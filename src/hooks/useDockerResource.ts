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

/* Loads a resource and keeps it current through Docker events.
 *
 * Important for usability: `loading` is only true for the FIRST load. Later
 * refreshes set `refreshing` and leave the display standing -- the earlier
 * setLoading(true) in the refresh path made the table disappear behind a
 * spinner every 30 seconds.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useDockerContext } from '../DockerProvider';
import { isDockerError, type DockerError } from '../client';

interface Options {
    /* Event types that trigger a reload (container, image, volume,
     * network). */
    events?: string[];
    /* Tab this resource belongs to. While it is not visible nothing is
     * loaded; the load is caught up when it becomes visible. */
    tab?: string | number;
    /* Safety net in case the event stream tears off. */
    intervalMs?: number;
}

/* Causes that affect every tab (spec section 3): they belong in a banner
 * above all tabs, not as a local error message in every view. */
const FATAL_KINDS = ['not-installed', 'daemon-unreachable', 'permission-denied'];

export function useDockerResource<T>(loader: () => Promise<T>, opts: Options = {}) {
    const { subscribe, activeTab, ready, fatalError, reportFatal } = useDockerContext();
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<DockerError | Error | null>(null);

    const loadedOnce = useRef(false);
    const staleWhileHidden = useRef(false);
    const loaderRef = useRef(loader);
    loaderRef.current = loader;

    // Increases on every reload() call. If a newer request overtakes an
    // older one (`docker ps` under load easily bursts the 300 ms debounce
    // window, say), only the generation still current when the response
    // arrives may write the state -- otherwise a late-arriving older
    // response overwrites fresher data with stale data.
    const generation = useRef(0);

    const visible = opts.tab === undefined || opts.tab === activeTab;
    // Event arrays are a fresh literal on every render of the caller
    // (`{ events: ['container'] }`); comparing by reference would tear down
    // and rebuild the subscription on every keystroke. A string built from
    // the contents is stable as long as the event types stay the same.
    const eventKey = (opts.events ?? []).join(',');

    const reload = useCallback(async () => {
        const gen = ++generation.current;
        if (loadedOnce.current)
            setRefreshing(true);
        try {
            const result = await loaderRef.current();
            if (gen !== generation.current)
                return;
            setData(result);
            setError(null);
        } catch (err) {
            if (gen !== generation.current)
                return;
            // Hand module-wide causes to the context: it shows a single
            // banner there and disables the tabs. Previously even a dead
            // daemon ended up as raw text in every single view as soon as it
            // occurred after startup. not-found and command-failed concern
            // only this load and stay local.
            if (isDockerError(err) && FATAL_KINDS.includes(err.kind)) {
                reportFatal(err);
                setError(null);
            } else {
                setError(isDockerError(err) ? err : (err as Error));
            }
        } finally {
            if (gen === generation.current) {
                loadedOnce.current = true;
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [reportFatal]);

    // First load as soon as the tab is visible and access is established.
    useEffect(() => {
        if (!ready || fatalError)
            return;
        if (!visible) return;
        if (staleWhileHidden.current || !loadedOnce.current) {
            staleWhileHidden.current = false;
            reload();
        }
    }, [ready, fatalError, visible, reload]);

    // Events: visible -> reload, invisible -> just note it down.
    useEffect(() => {
        if (!ready || fatalError)
            return;
        const types = eventKey === '' ? [] : eventKey.split(',');
        if (types.length === 0)
            return;
        return subscribe(types, () => {
            if (opts.tab === undefined || opts.tab === activeTab)
                reload();
            else
                staleWhileHidden.current = true;
        });
    }, [ready, fatalError, subscribe, reload, activeTab, eventKey, opts.tab]);

    // Safety net against a torn-off event stream.
    useEffect(() => {
        if (!ready || fatalError || !visible)
            return;
        const ms = opts.intervalMs ?? 60000;
        const id = setInterval(() => { reload() }, ms);
        return () => clearInterval(id);
    }, [ready, fatalError, visible, reload, opts.intervalMs]);

    return { data, loading, refreshing, error, reload };
}
