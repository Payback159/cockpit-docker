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

/* Error classification for Docker commands.
 *
 * This module deliberately imports NO cockpit (see parse.ts).
 *
 * Two signal sources: the cockpit channel's `problem` ('not-found', say, when
 * the binary is missing) and Docker's stderr text. All Docker errors exit with
 * status 1, so the text is the only thing that tells them apart.
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

/* Measured stderr patterns. They are disjoint across every message we
 * measured -- no message matches two patterns, so the order has no effect.
 * The first matching pattern wins; if a pattern were added later that also
 * matched an already covered message, the order would need reconsidering. */
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
    // The channel layer is less ambiguous than the text, so it takes priority.
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
