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
    probeAccess, resetAccessMode, setSuperuserAllowedSource, stream, checkSystem,
    isDockerError, DockerError, type AccessMode, type SystemInfo,
} from './client';

/* Die Client-Schicht importiert 'superuser' bewusst nicht selbst (sie soll
 * ohne die cockpit-Seitenumgebung testbar bleiben); der Provider ist die
 * Stelle, die den Admin-Zugriff ohnehin beobachtet, und reicht ihn als
 * Funktion hinein. Als Funktion, weil `superuser.allowed` waehrend der
 * Sitzungsinitialisierung `null` ist: ein einmal kopierter Wert waere fast
 * immer `null` und liesse die Eskalation nie zustande kommen. */
setSuperuserAllowedSource(() => superuser.allowed === true);

/* Gemessen: ein `compose restart` mit zwei Services erzeugt 18 Ereignisse.
 * Ohne Entprellung waere ereignisgesteuertes Nachladen schlechter als das
 * fruehere Polling. */
const DEBOUNCE_MS = 300;

/* Backoff, bevor nach einem abgerissenen docker-events-Stream neu verbunden
 * wird. Bewusst ereignisgesteuert (ueber den onError-Callback von `stream()`)
 * statt eines blinden Intervalls: ein Intervall, das den Stream unabhaengig
 * von seinem Zustand alle N Sekunden schliesst und neu aufbaut, reisst auch
 * einen gesunden Stream ab und verliert Ereignisse in der Luecke -- das war
 * genau der Fehler, den dieser Umbau beheben soll.
 *
 * Die Wartezeit verdoppelt sich bis zur Obergrenze. Ein fester Wert von 3 s
 * bedeutete bei dauerhaft totem Daemon rund 20 Prozessstarts je Minute, ohne
 * Ende -- also genau die Last, die dieser Umbau beseitigen soll. */
const RECONNECT_DELAY_MS = 3000;
const RECONNECT_MAX_DELAY_MS = 60000;
/* Hielt eine Verbindung so lange, gilt sie als gesund gewesen; der naechste
 * Abbruch faengt wieder unten an. */
const STREAM_STABLE_MS = 60000;

/* Ein modulweiter Fehler (Docker weg, Daemon tot, Rechte entzogen) beendet
 * jedes Nachladen. Ohne eigenen Versuch bliebe das Modul bis zum Reload tot,
 * auch wenn der Daemon laengst wieder laeuft. Auch hier mit Backoff. */
const FATAL_RETRY_MIN_MS = 5000;
const FATAL_RETRY_MAX_MS = 60000;

/* Ursachen, die jeden Tab betreffen (Spec Abschnitt 3). */
const FATAL_KINDS = ['not-installed', 'daemon-unreachable', 'permission-denied'];

type Listener = { types: string[]; cb: () => void };

interface DockerContextValue {
    mode: AccessMode | null;
    ready: boolean;
    fatalError: DockerError | null;
    systemInfo: SystemInfo | null;
    subscribe: (types: string[], cb: () => void) => () => void;
    /* Meldet einen Fehler aus einem Ladevorgang. Nur die drei modulweiten
     * Ursachen werden uebernommen; alles andere bleibt lokal bei der
     * ausloesenden Ansicht. */
    reportFatal: (err: DockerError) => void;
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
    // Rest einer am Chunk-Rand abgeschnittenen Zeile; cockpit.spawn().stream()
    // liefert rohe Kanal-Chunks ohne Zeilenrahmung.
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
        // Vollstaendige Zeilen sofort verarbeiten; ein abgeschnittenes
        // Fragment am Ende bleibt fuer den naechsten Chunk stehen, statt
        // stillschweigend verworfen zu werden.
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
                console.warn('DockerProvider: konnte Ereigniszeile nicht parsen', trimmed, err);
            }
        }
        if (timer.current === null)
            timer.current = setTimeout(flush, DEBOUNCE_MS);
    }, [flush]);

    /* Setzt den modulweiten Fehler, behaelt aber ein bereits vorhandenes,
     * gleichlautendes Objekt. Sonst erzeugte jeder erneute Fehlversuch eine
     * neue Objektidentitaet, was den Wiederholungs-Effekt unten neu startete
     * und dessen Backoff dauerhaft zuruecksetzte. */
    const raiseFatal = useCallback((err: DockerError) => {
        setFatalError(prev =>
            (prev !== null && prev.kind === err.kind && prev.raw === err.raw) ? prev : err);
    }, []);

    // Fehler aus einem Ladevorgang: nur die drei modulweiten Ursachen
    // uebernehmen, alles andere bleibt Sache der ausloesenden Ansicht.
    const reportFatal = useCallback((err: DockerError) => {
        if (!FATAL_KINDS.includes(err.kind))
            return;
        raiseFatal(err);
    }, [raiseFatal]);

    // Zugriffsmodus ermitteln; bei Wechsel des Admin-Zugriffs wiederholen.
    // `silent` fuer den Wiederholungsversuch aus dem Fehlerzustand: dort darf
    // `ready` nicht kurz auf false fallen, sonst flackerten die Tabs.
    const probing = useRef(false);
    const reprobeQueued = useRef(false);
    const probeRef = useRef<(opts?: { silent?: boolean }) => void>(() => {});

    const probe = useCallback(async (opts: { silent?: boolean } = {}) => {
        // Zwei gleichzeitige Proben wuerden sich den Modus gegenseitig
        // ueberschreiben; ein waehrend einer laufenden Probe eintreffendes
        // Ereignis wird stattdessen vorgemerkt und danach nachgeholt (der
        // Admin-Zugriff kann sich genau in diesem Fenster geaendert haben).
        if (probing.current) {
            reprobeQueued.current = true;
            return;
        }
        probing.current = true;
        if (!opts.silent)
            setReady(false);
        resetAccessMode();
        try {
            // Ohne superuserAllowed: probeAccess liest den Admin-Zugriff erst
            // im Moment der Eskalation ueber die vom Provider hinterlegte
            // Funktion. Ein hier abgelesener Wert waere beim ersten Lauf
            // praktisch immer `null` (Sitzung noch in Initialisierung) und
            // verhinderte die Rechteerhoehung dauerhaft.
            const m = await probeAccess();
            setMode(m);
            setFatalError(null);
            try {
                setSystemInfo(await checkSystem());
            } catch (err) {
                // Der Zugriffsmodus steht fest; nur die Zusatzinfo fuer die
                // Uebersicht blieb aus. Kein Grund, den ganzen Modus zu
                // verwerfen und den Ereignisstrom zu verhindern -- aber der
                // Fehler darf nicht wortlos verschwinden.
                console.error('DockerProvider: checkSystem fehlgeschlagen', err);
                setSystemInfo(null);
            }
        } catch (err) {
            setMode(null);
            // Ein nicht klassifizierter Fehler darf den Modul-Zustand nicht
            // unbeobachtet lassen (ready=true, fatalError=null wuerde jeden
            // Tab freischalten, obwohl der Zugriff nie geklaert wurde).
            if (isDockerError(err)) {
                raiseFatal(err);
            } else {
                console.error('DockerProvider: unerwarteter Fehler bei probeAccess', err);
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

    // Der Wach-Zustand fuer die Ereignis-Handler unten: sie leben ueber die
    // gesamte Sitzung und duerfen keinen Zustand aus ihrer Aufbau-Runde
    // einfrieren.
    const modeRef = useRef(mode);
    modeRef.current = mode;
    const fatalRef = useRef(fatalError);
    fatalRef.current = fatalError;

    useEffect(() => {
        probe();

        /* Auf BEIDE Ereignisse hoeren.
         *
         * `reconnect` allein genuegt nicht: pkg/lib/superuser.js sendet es
         * nur, wenn vorher schon ein Wert bekannt war (`if (prev != null)`).
         * Der Uebergang null -> true, der bei jedem Seitenaufbau stattfindet
         * und der fuer Lage 2 (Administrator ohne Gruppe docker) der
         * entscheidende ist, meldet sich ausschliesslich ueber `changed`.
         *
         * Neu geprobt wird nur, wenn es etwas aendern kann: solange kein
         * Modus feststeht oder ein modulweiter Fehler ansteht. Ein
         * funktionierendes Modul wird von wiederholten `changed`-Ereignissen
         * nicht angeruehrt -- sonst starteten Rechtewechsel eine Kette von
         * Proben. */
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

    /* Wiederholung aus dem modulweiten Fehlerzustand.
     *
     * Im Fehlerzustand laedt keine Ansicht mehr nach (useDockerResource ist
     * darauf gestuetzt) und der Ereignisstrom ruht. Ohne diesen Versuch
     * bliebe das Modul nach einem Daemon-Neustart bis zum Reload tot. */
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

    // Ereignis-Stream, solange der Zugriff steht.
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

        // Der Stream endet nie von selbst; ein Abbruch (Daemon-Neustart,
        // entzogene Rechte, unterbrochene Verbindung) laeuft immer hier
        // auf -- nie stillschweigend verwerfen, sondern melden und mit
        // kurzem Backoff neu verbinden.
        function onStreamError(err: DockerError) {
            if (closed)
                return;

            // Ein modulweiter Grund (Daemon tot, Docker weg, Rechte entzogen)
            // gehoert ins Banner statt in eine endlose Wiederverbindung; der
            // Fehlerzustand baut diesen Effekt ohnehin ab.
            reportFatal(err);

            // Hat die Verbindung lange genug gehalten, war sie gesund: der
            // naechste Abbruch faengt wieder bei der kurzen Wartezeit an.
            if (Date.now() - connectedAt >= STREAM_STABLE_MS)
                delay = RECONNECT_DELAY_MS;

            const wait = delay;
            delay = Math.min(delay * 2, RECONNECT_MAX_DELAY_MS);
            console.warn('DockerProvider: docker-events-Stream abgebrochen, verbinde in',
                          wait, 'ms neu', err);
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                if (!closed)
                    connect();
            }, wait);
        }

        connect();

        return () => {
            closed = true;
            if (reconnectTimer !== null)
                clearTimeout(reconnectTimer);
            handle.close();
            if (timer.current !== null) {
                clearTimeout(timer.current);
                timer.current = null;
            }
            pending.current.clear();
        };
    }, [ready, fatalError, mode, onEvent, reportFatal]);

    return (
        <DockerContext.Provider
            value={{
                mode, ready, fatalError, systemInfo, subscribe, reportFatal,
                activeTab, setActiveTab,
            }}
        >
            {children}
        </DockerContext.Provider>
    );
};
