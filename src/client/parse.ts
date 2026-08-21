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

/* Ausgabe-Parsing fuer Docker-Kommandos.
 *
 * Dieses Modul importiert bewusst KEIN cockpit: dadurch laufen seine Tests
 * als schlichte Node-Prozesse ohne Mocking-Geruest.
 */

/**
 * Parst eine Listenausgabe von Docker.
 *
 * Docker liefert je nach Kommando ein JSON-Array oder NDJSON (ein Objekt je
 * Zeile), und welches Kommando welches Format liefert, ist ueber die
 * unterstuetzte Versionsspanne nicht zugesichert. Diese Funktion nimmt daher
 * beides an und unterscheidet am ersten Nicht-Leerzeichen.
 */
export function parseJsonList<T>(text: string): T[] {
    const trimmed = text.trim();
    if (trimmed === '')
        return [];

    if (trimmed[0] === '[')
        return JSON.parse(trimmed) as T[];

    return trimmed
            .split('\n')
            .map(line => line.trim())
            .filter(line => line !== '')
            .map(line => JSON.parse(line) as T);
}

/**
 * Parst eine Ausgabe, die genau ein Objekt enthaelt (etwa `docker info`).
 */
export function parseJson<T>(text: string): T {
    const trimmed = text.trim();
    if (trimmed === '')
        throw new SyntaxError('Leere Ausgabe, Objekt erwartet');
    return JSON.parse(trimmed) as T;
}

/**
 * Zerlegt den kommagetrennten Label-String, den `docker ps --format json`
 * im Feld `Labels` liefert.
 *
 * Werte duerfen Gleichheitszeichen enthalten, daher wird nur am ersten
 * getrennt. Eintraege ohne Wert werden uebergangen.
 */
export function parseLabels(labels: string | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!labels)
        return out;

    for (const pair of labels.split(',')) {
        const eq = pair.indexOf('=');
        if (eq <= 0)
            continue;
        out[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    return out;
}
