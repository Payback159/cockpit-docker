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

/* Fehlerklassifizierung fuer Docker-Kommandos.
 *
 * Dieses Modul importiert bewusst KEIN cockpit (siehe parse.ts).
 *
 * Zwei Signalquellen: das `problem` des cockpit-Kanals (etwa 'not-found',
 * wenn das Binary fehlt) und der stderr-Text von Docker. Alle Docker-Fehler
 * liefern exit=1, unterscheidbar sind sie ausschliesslich am Text.
 */

export type DockerErrorKind =
    | 'not-installed'
    | 'daemon-unreachable'
    | 'permission-denied'
    | 'not-found'
    | 'command-failed';

export class DockerError extends Error {
    readonly kind: DockerErrorKind;
    readonly raw: string;
    readonly exitStatus: number | null;

    constructor(kind: DockerErrorKind, raw: string, exitStatus: number | null) {
        super(raw);
        this.name = 'DockerError';
        this.kind = kind;
        this.raw = raw;
        this.exitStatus = exitStatus;
    }
}

export function isDockerError(e: unknown): e is DockerError {
    return e instanceof DockerError;
}

/* Gemessene stderr-Muster. Ueber alle gemessenen Meldungen sind sie disjunkt
 * -- keine Meldung trifft auf zwei Muster zu, die Reihenfolge ist daher ohne
 * Wirkung. Das erste passende Muster gewinnt; kaeme spaeter ein Muster hinzu,
 * das eine bereits abgedeckte Meldung ebenfalls trifft, muesste die
 * Reihenfolge erneut bedacht werden. */
const PATTERNS: ReadonlyArray<[RegExp, DockerErrorKind]> = [
    [/permission denied while trying to connect/i, 'permission-denied'],
    [/failed to connect to the docker api/i, 'daemon-unreachable'],
    [/cannot connect to the docker daemon/i, 'daemon-unreachable'],
    [/no such (volume|object|container|image|network)/i, 'not-found'],
];

export function classifyError(
    problem: string | null,
    message: string,
    exitStatus: number | null
): DockerError {
    // Die Kanal-Ebene ist eindeutiger als der Text und hat deshalb Vorrang.
    if (problem === 'not-found')
        return new DockerError('not-installed', message, exitStatus);
    if (problem === 'access-denied')
        return new DockerError('permission-denied', message, exitStatus);

    for (const [pattern, kind] of PATTERNS) {
        if (pattern.test(message))
            return new DockerError(kind, message, exitStatus);
    }

    return new DockerError('command-failed', message, exitStatus);
}
