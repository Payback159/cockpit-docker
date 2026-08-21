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

/* Zentraler Kontext der Docker-Anbindung.
 *
 * Haelt den einmal ermittelten Zugriffsmodus, den modulweiten Fehlerzustand
 * und einen `docker events`-Stream, auf den sich Ansichten abonnieren.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { superuser } from 'superuser';

import {
    probeAccess, resetAccessMode, stream, checkSystem,
    isDockerError, type AccessMode, type DockerError, type SystemInfo,
} from './client';

/* Gemessen: ein `compose restart` mit zwei Services erzeugt 18 Ereignisse.
 * Ohne Entprellung waere ereignisgesteuertes Nachladen schlechter als das
 * fruehere Polling. */
const DEBOUNCE_MS = 300;

type Listener = { types: string[]; cb: () => void };

interface DockerContextValue {
    mode: AccessMode | null;
    ready: boolean;
    fatalError: DockerError | null;
    systemInfo: SystemInfo | null;
    subscribe: (types: string[], cb: () => void) => () => void;
    activeTab: string | number;
    setActiveTab: (k: string | number) => void;
}

const DockerContext = createContext<DockerContextValue | null>(null);

export function useDockerContext(): DockerContextValue {
    const ctx = useContext(DockerContext);
    if (!ctx)
        throw new Error('useDockerContext ausserhalb von DockerProvider verwendet');
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
        for (const line of chunk.split('\n')) {
            const trimmed = line.trim();
            if (trimmed === '')
                continue;
            try {
                const evt = JSON.parse(trimmed) as { Type?: string };
                if (evt.Type)
                    pending.current.add(evt.Type);
            } catch {
                /* Teilzeile am Puffergrenze; die naechste Zustellung
                 * bringt den Rest. */
            }
        }
        if (timer.current === null)
            timer.current = setTimeout(flush, DEBOUNCE_MS);
    }, [flush]);

    // Zugriffsmodus ermitteln; bei Wechsel des Admin-Zugriffs wiederholen.
    const probe = useCallback(async () => {
        setReady(false);
        resetAccessMode();
        try {
            const m = await probeAccess({ superuserAllowed: superuser.allowed === true });
            setMode(m);
            setFatalError(null);
            setSystemInfo(await checkSystem());
        } catch (err) {
            setMode(null);
            setFatalError(isDockerError(err) ? err : null);
        } finally {
            setReady(true);
        }
    }, []);

    useEffect(() => {
        probe();
        const onReconnect = () => { probe() };
        superuser.addEventListener('reconnect', onReconnect);
        return () => {
            superuser.removeEventListener('reconnect', onReconnect);
        };
    }, [probe]);

    // Ereignis-Stream, solange der Zugriff steht.
    useEffect(() => {
        if (!ready || fatalError || mode === null)
            return;

        let closed = false;
        let handle = stream(['docker', 'events', '--format', 'json'], onEvent);

        // Reisst der Stream ab, neu aufbauen.
        const retry = setInterval(() => {
            if (closed)
                return;
            handle.close();
            handle = stream(['docker', 'events', '--format', 'json'], onEvent);
        }, 60000);

        return () => {
            closed = true;
            clearInterval(retry);
            handle.close();
            if (timer.current !== null)
                clearTimeout(timer.current);
        };
    }, [ready, fatalError, mode, onEvent]);

    return (
        <DockerContext.Provider
            value={{ mode, ready, fatalError, systemInfo, subscribe, activeTab, setActiveTab }}
        >
            {children}
        </DockerContext.Provider>
    );
};
