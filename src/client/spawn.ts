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

/* Ausfuehrung von Docker-Kommandos ueber cockpit.
 *
 * Dies ist das EINZIGE Modul, das cockpit.spawn aufruft. Fachliche Module
 * gehen ueber run() bzw. stream().
 *
 * Zum Zugriffsmodell: Der Zugriff auf /var/run/docker.sock haengt an der
 * Gruppe docker, nicht an sudo. Ein pauschales superuser: "require" waere
 * daher schaedlich -- es forderte Admin-Rechte an, wo keine noetig sind, und
 * scheiterte bei Nutzern ohne sudo, obwohl Docker erreichbar ist. Deshalb
 * wird der Modus einmal ermittelt und danach fuer alle Aufrufe verwendet.
 */
import cockpit from 'cockpit';

import { classifyError, DockerError } from './errors';

export type AccessMode = 'none' | 'require';

let accessMode: AccessMode | null = null;

export function getAccessMode(): AccessMode | null {
    return accessMode;
}

export function resetAccessMode(): void {
    accessMode = null;
}

interface ProcessErrorLike {
    problem?: string | null;
    exit_status?: number | null;
    message?: string;
}

function toDockerError(err: unknown): DockerError {
    if (err instanceof DockerError)
        return err;
    const e = (err ?? {}) as ProcessErrorLike;
    return classifyError(
        e.problem ?? null,
        e.message ?? String(err),
        e.exit_status ?? null);
}

function invoke(args: string[], mode: AccessMode, environ?: string[]): Promise<string> {
    const options: Record<string, unknown> = { err: 'message' };
    if (mode === 'require')
        options.superuser = 'require';
    if (environ)
        options.environ = environ;
    return cockpit.spawn(args, options as never) as unknown as Promise<string>;
}

/**
 * Ermittelt den Zugriffsmodus und merkt ihn.
 *
 * Erst ohne Rechteerhoehung; schlaegt das fehl und ist Admin-Zugriff
 * verfuegbar, ein zweiter Versuch mit superuser. Schlagen beide fehl, wird
 * der klassifizierte Fehler geworfen.
 */
export async function probeAccess(
    opts: { superuserAllowed?: boolean } = {}
): Promise<AccessMode> {
    const probe = ['docker', 'info', '--format', '{{json .}}'];

    try {
        await invoke(probe, 'none');
        accessMode = 'none';
        return accessMode;
    } catch (err) {
        const first = toDockerError(err);

        // Fehlendes Binary oder toter Daemon werden durch Rechteerhoehung
        // nicht besser.
        if (first.kind === 'not-installed' || first.kind === 'daemon-unreachable')
            throw first;
        if (!opts.superuserAllowed)
            throw first;

        try {
            await invoke(probe, 'require');
            accessMode = 'require';
            return accessMode;
        } catch (err2) {
            throw toDockerError(err2);
        }
    }
}

/**
 * Fuehrt ein Kommando aus und liefert dessen Ausgabe.
 * Wirft bei Fehlern einen DockerError.
 */
export async function run(
    args: string[],
    opts: { environ?: string[] } = {}
): Promise<string> {
    if (accessMode === null)
        await probeAccess();

    try {
        return await invoke(args, accessMode ?? 'none', opts.environ);
    } catch (err) {
        throw toDockerError(err);
    }
}

/**
 * Startet ein Kommando als Stream (fuer `docker logs -f` und `docker events`).
 * Der Aufrufer beendet ihn ueber close().
 */
export function stream(
    args: string[],
    onData: (chunk: string) => void,
    onError?: (err: DockerError) => void
): { close: () => void } {
    const options: Record<string, unknown> = { err: 'out' };
    if (accessMode === 'require')
        options.superuser = 'require';

    const proc = cockpit.spawn(args, options as never);
    proc.stream(onData);
    proc.catch((err: unknown) => {
        const e = toDockerError(err);
        if (e.raw !== 'cancelled' && onError)
            onError(e);
    });

    return {
        close: () => {
            try {
                proc.close();
            } catch {
                /* bereits beendet */
            }
        },
    };
}
