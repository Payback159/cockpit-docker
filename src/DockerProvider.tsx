/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2024 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */

/* Central context of the Docker integration.
 *
 * Holds the access mode determined once, the module-wide error state, and a
 * `docker events` stream that views subscribe to.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { superuser } from 'superuser';

import {
    probeAccess, resetAccessMode, setSuperuserAllowedSource, stream, checkSystem,
    isDockerError, DockerError, type AccessMode, type SystemInfo,
} from './client';

/* The client layer deliberately does not import 'superuser' itself (it is
 * meant to stay testable without the cockpit page environment); the provider
 * is the place that watches admin access anyway, and passes it in as a
 * function. As a function, because `superuser.allowed` is `null` during
 * session initialisation: a value copied once would almost always be `null`
 * and would never let the escalation happen. */
setSuperuserAllowedSource(() => superuser.allowed === true);

/* Measured: a `compose restart` with two services produces 18 events. Without
 * debouncing, event-driven reloading would be worse than the earlier
 * polling. */
const DEBOUNCE_MS = 300;

/* Backoff before reconnecting after a torn-off docker-events stream.
 * Deliberately event-driven (through the onError callback of `stream()`)
 * rather than a blind interval: an interval that closes and rebuilds the
 * stream every N seconds regardless of its state also tears off a healthy
 * stream and loses events in the gap -- exactly the defect this rework is
 * meant to fix.
 *
 * The wait doubles up to the upper bound. A fixed value of 3 s would mean
 * roughly 20 process starts per minute with a permanently dead daemon,
 * endlessly -- precisely the load this rework is meant to remove. */
const RECONNECT_DELAY_MS = 3000;
const RECONNECT_MAX_DELAY_MS = 60000;
/* If a connection held for this long it counts as having been healthy; the
 * next tear-off starts at the bottom again. */
const STREAM_STABLE_MS = 60000;

/* A module-wide error (Docker gone, daemon dead, rights revoked) stops every
 * reload. Without a retry of its own the module would stay dead until a page
 * reload, even long after the daemon is running again. With backoff here
 * too. */
const FATAL_RETRY_MIN_MS = 5000;
const FATAL_RETRY_MAX_MS = 60000;

/* Causes that affect every tab (spec section 3). */
const FATAL_KINDS = ['not-installed', 'daemon-unreachable', 'permission-denied'];

type Listener = { types: string[]; cb: () => void };

interface DockerContextValue {
    mode: AccessMode | null;
    ready: boolean;
    fatalError: DockerError | null;
    systemInfo: SystemInfo | null;
    subscribe: (types: string[], cb: () => void) => () => void;
    /* Reports an error from a load. Only the three module-wide causes are
     * taken over; everything else stays local to the view that raised it. */
    reportFatal: (err: DockerError) => void;
    activeTab: string | number;
    setActiveTab: (k: string | number) => void;
}

const DockerContext = createContext<DockerContextValue | null>(null);

export function useDockerContext(): DockerContextValue {
    const ctx = useContext(DockerContext);
    if (!ctx)
        throw new Error('useDockerContext used outside of DockerProvider');
    return ctx;
}

export const DockerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [mode, setMode] = useState<AccessMode | null>(null);
    const [ready, setReady] = useState(false);
    const [fatalError, setFatalError] = useState<DockerError | null>(null);
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const [activeTab, setActiveTab] = useState<string | number>(0);

    const listeners = useRef<Set<Listener>>(new Set());
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pending = useRef<Set<string>>(new Set());
    // Remainder of a line cut off at a chunk boundary; cockpit.spawn().stream()
    // delivers raw channel chunks without line framing.
    const remainder = useRef('');

    const subscribe = useCallback((types: string[], cb: () => void) => {
        const entry: Listener = { types, cb };
        listeners.current.add(entry);
        return () => {
            listeners.current.delete(entry);
        };
    }, []);

    const flush = useCallback(() => {
        const types = new Set(pending.current);
        pending.current.clear();
        timer.current = null;
        for (const l of listeners.current) {
            if (l.types.some(t => types.has(t)))
                l.cb();
        }
    }, []);

    const onEvent = useCallback((chunk: string) => {
        // Process complete lines right away; a truncated fragment at the end
        // is kept for the next chunk instead of being silently discarded.
        const combined = remainder.current + chunk;
        const lines = combined.split('\n');
        remainder.current = lines.pop() ?? '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '')
                continue;
            try {
                const evt = JSON.parse(trimmed) as { Type?: string };
                if (evt.Type)
                    pending.current.add(evt.Type);
            } catch (err) {
                console.warn('DockerProvider: could not parse event line', trimmed, err);
            }
        }
        if (timer.current === null)
            timer.current = setTimeout(flush, DEBOUNCE_MS);
    }, [flush]);

    /* Sets the module-wide error, but keeps an existing, identical object.
     * Otherwise every repeated failure would create a new object identity,
     * which restarted the retry effect below and reset its backoff for
     * good. */
    const raiseFatal = useCallback((err: DockerError) => {
        setFatalError(prev =>
            (prev !== null && prev.kind === err.kind && prev.raw === err.raw) ? prev : err);
    }, []);

    // Error from a load: take over only the three module-wide causes,
    // everything else remains the business of the view that raised it.
    const reportFatal = useCallback((err: DockerError) => {
        if (!FATAL_KINDS.includes(err.kind))
            return;
        raiseFatal(err);
    }, [raiseFatal]);

    // Determine the access mode; repeat when admin access changes.
    // `silent` is for the retry out of the error state: `ready` must not dip
    // to false there, otherwise the tabs would flicker.
    const probing = useRef(false);
    const reprobeQueued = useRef(false);
    const probeRef = useRef<(opts?: { silent?: boolean }) => void>(() => {});

    const probe = useCallback(async (opts: { silent?: boolean } = {}) => {
        // Two concurrent probes would overwrite each other's mode; an event
        // arriving while a probe is in flight is noted instead and caught up
        // afterwards (admin access may have changed in exactly that window).
        if (probing.current) {
            reprobeQueued.current = true;
            return;
        }
        probing.current = true;
        if (!opts.silent)
            setReady(false);
        resetAccessMode();
        try {
            // Without superuserAllowed: probeAccess reads admin access only
            // at the moment of escalation, through the function the provider
            // configured. A value read here would be practically always
            // `null` on the first run (session still initialising) and would
            // block privilege escalation for good.
            const m = await probeAccess();
            setMode(m);
            setFatalError(null);
            try {
                setSystemInfo(await checkSystem());
            } catch (err) {
                // The access mode is settled; only the extra info for the
                // overview did not arrive. No reason to discard the whole
                // mode and prevent the event stream -- but the error must
                // not vanish without a word.
                console.error('DockerProvider: checkSystem failed', err);
                setSystemInfo(null);
            }
        } catch (err) {
            setMode(null);
            // An unclassified error must not leave the module state
            // unobserved (ready=true, fatalError=null would unlock every tab
            // even though access was never established).
            if (isDockerError(err)) {
                raiseFatal(err);
            } else {
                console.error('DockerProvider: unexpected error in probeAccess', err);
                const message = err instanceof Error ? err.message : String(err);
                raiseFatal(new DockerError('command-failed', message, null));
            }
        } finally {
            setReady(true);
            probing.current = false;
            if (reprobeQueued.current) {
                reprobeQueued.current = false;
                probeRef.current(opts);
            }
        }
    }, [raiseFatal]);

    probeRef.current = probe;

    // The live state for the event handlers below: they live for the whole
    // session and must not freeze state from the render that created them.
    const modeRef = useRef(mode);
    modeRef.current = mode;
    const fatalRef = useRef(fatalError);
    fatalRef.current = fatalError;

    useEffect(() => {
        probe();

        /* Listen for BOTH events.
         *
         * `reconnect` alone is not enough: pkg/lib/superuser.js only sends it
         * when a value was already known (`if (prev != null)`). The
         * null -> true transition, which happens on every page load and is the
         * decisive one for situation 2 (administrator without the docker
         * group), announces itself exclusively through `changed`.
         *
         * A re-probe only happens when it can change something: while no mode
         * is settled or a module-wide error is pending. A working module is
         * left untouched by repeated `changed` events -- otherwise privilege
         * changes would start a chain of probes. */
        const onSuperuserChange = () => {
            if (modeRef.current === null || fatalRef.current !== null)
                probe();
        };
        superuser.addEventListener('changed', onSuperuserChange);
        superuser.addEventListener('reconnect', onSuperuserChange);
        return () => {
            superuser.removeEventListener('changed', onSuperuserChange);
            superuser.removeEventListener('reconnect', onSuperuserChange);
        };
    }, [probe]);

    /* Retry out of the module-wide error state.
     *
     * In the error state no view reloads any more (useDockerResource relies on
     * that) and the event stream is idle. Without this retry the module would
     * stay dead after a daemon restart until a page reload. */
    useEffect(() => {
        if (fatalError === null)
            return;

        let cancelled = false;
        let delay = FATAL_RETRY_MIN_MS;
        let id: ReturnType<typeof setTimeout> | null = null;

        const schedule = () => {
            id = setTimeout(async () => {
                id = null;
                if (cancelled)
                    return;
                await probe({ silent: true });
                if (cancelled)
                    return;
                delay = Math.min(delay * 2, FATAL_RETRY_MAX_MS);
                schedule();
            }, delay);
        };
        schedule();

        return () => {
            cancelled = true;
            if (id !== null)
                clearTimeout(id);
        };
    }, [fatalError, probe]);

    // Event stream, for as long as access holds.
    useEffect(() => {
        if (!ready || fatalError || mode === null)
            return;

        let closed = false;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let handle: { close: () => void } = { close: () => {} };
        let delay = RECONNECT_DELAY_MS;
        let connectedAt = 0;

        function connect() {
            remainder.current = '';
            connectedAt = Date.now();
            handle = stream(['docker', 'events', '--format', 'json'], onEvent, onStreamError);
        }

        // The stream never ends on its own; a tear-off (daemon restart,
        // revoked rights, interrupted connection) always lands here -- never
        // discard it silently, report it and reconnect with a short backoff.
        function onStreamError(err: DockerError) {
            if (closed)
                return;

            // A module-wide cause (daemon dead, Docker gone, rights revoked)
            // belongs in the banner rather than in an endless reconnect; the
            // error state tears this effect down anyway.
            reportFatal(err);

            // If the connection held long enough it was healthy: the next
            // tear-off starts at the short wait again.
            if (Date.now() - connectedAt >= STREAM_STABLE_MS)
                delay = RECONNECT_DELAY_MS;

            const wait = delay;
            delay = Math.min(delay * 2, RECONNECT_MAX_DELAY_MS);
            console.warn('DockerProvider: docker-events stream torn off, reconnecting in',
                         wait, 'ms', err);
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                if (!closed)
                    connect();
            }, wait);
        }

        connect();

        // The set is never replaced, only mutated -- capturing the reference
        // here is therefore equivalent and satisfies the hooks rule that
        // objects to a ref access in the cleanup.
        const pendingTypes = pending.current;

        return () => {
            closed = true;
            if (reconnectTimer !== null)
                clearTimeout(reconnectTimer);
            handle.close();
            if (timer.current !== null) {
                clearTimeout(timer.current);
                timer.current = null;
            }
            pendingTypes.clear();
        };
    }, [ready, fatalError, mode, onEvent, reportFatal]);

    return (
        <DockerContext.Provider
            value={{
                mode,
                ready,
                fatalError,
                systemInfo,
                subscribe,
                reportFatal,
                activeTab,
                setActiveTab,
            }}
        >
            {children}
        </DockerContext.Provider>
    );
};
