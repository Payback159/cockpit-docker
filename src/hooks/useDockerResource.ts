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

/* Laedt eine Ressource und haelt sie ueber Docker-Ereignisse aktuell.
 *
 * Wichtig fuer die Bedienung: `loading` ist nur beim ERSTEN Laden wahr.
 * Spaetere Aktualisierungen setzen `refreshing` und lassen die Anzeige
 * stehen -- das fruehere setLoading(true) im Refresh-Pfad liess die Tabelle
 * alle 30 Sekunden hinter einem Spinner verschwinden.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useDockerContext } from '../DockerProvider';
import { isDockerError, type DockerError } from '../client';

interface Options {
    /* Ereignistypen, die eine Neuladung ausloesen (container, image,
     * volume, network). */
    events?: string[];
    /* Tab, zu dem diese Ressource gehoert. Ist er nicht sichtbar, wird
     * nicht geladen; beim Sichtbarwerden wird nachgeholt. */
    tab?: string | number;
    /* Sicherheitsnetz, falls der Ereignisstrom abreisst. */
    intervalMs?: number;
}

/* Ursachen, die jeden Tab betreffen (Spec Abschnitt 3): sie gehoeren als
 * Banner ueber alle Tabs, nicht als lokale Fehlermeldung in jede Ansicht. */
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

    // Erhoeht sich bei jedem reload()-Aufruf. Ueberholt eine juengere
    // Anfrage eine aeltere (z. B. `docker ps` unter Last laesst das
    // 300-ms-Entprellfenster leicht platzen), darf nur die zum Zeitpunkt
    // ihrer Ankunft noch aktuelle Generation den Zustand schreiben --
    // sonst ueberschreibt eine spaet ankommende, aeltere Antwort frischere
    // Daten mit veralteten.
    const generation = useRef(0);

    const visible = opts.tab === undefined || opts.tab === activeTab;
    // Ereignis-Arrays sind bei jedem Aufrufer-Render ein neues Literal
    // (`{ events: ['container'] }`); ein Vergleich nach Referenz wuerde das
    // Abonnement bei jedem Tastendruck ab- und wiederaufbauen. Ein aus dem
    // Inhalt gebildeter String ist stabil, solange die Ereignistypen
    // gleich bleiben.
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
            // Modulweite Ursachen an den Kontext geben: dort wird ein
            // einzelnes Banner gezeigt und die Tabs werden deaktiviert.
            // Frueher landete auch ein toter Daemon als roher Text in jeder
            // einzelnen Ansicht, sobald er erst nach dem Start eintrat.
            // not-found und command-failed betreffen nur diesen Ladevorgang
            // und bleiben lokal.
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

    // Erstes Laden, sobald der Tab sichtbar und der Zugriff geklaert ist.
    useEffect(() => {
        if (!ready || fatalError)
            return;
        if (!visible) return;
        if (staleWhileHidden.current || !loadedOnce.current) {
            staleWhileHidden.current = false;
            reload();
        }
    }, [ready, fatalError, visible, reload]);

    // Ereignisse: sichtbar -> nachladen, unsichtbar -> nur vormerken.
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

    // Sicherheitsnetz gegen einen abgerissenen Ereignisstrom.
    useEffect(() => {
        if (!ready || fatalError || !visible)
            return;
        const ms = opts.intervalMs ?? 60000;
        const id = setInterval(() => { reload() }, ms);
        return () => clearInterval(id);
    }, [ready, fatalError, visible, reload, opts.intervalMs]);

    return { data, loading, refreshing, error, reload };
}
