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

/* Execution of Docker commands through cockpit.
 *
 * This is the ONLY module that calls cockpit.spawn. Domain modules go through
 * run() and stream().
 *
 * On the access model: access to /var/run/docker.sock hangs on the docker
 * group, not on sudo. A blanket superuser: "require" would therefore be
 * harmful -- it would ask for admin rights where none are needed, and would
 * fail for users without sudo even though Docker is reachable. So the mode is
 * determined once and then used for every call.
 */
import cockpit from 'cockpit';

import { classifyError, DockerError } from './errors';

export type AccessMode = 'none' | 'require';

let accessMode: AccessMode | null = null;

/* Source for "admin access is available".
 *
 * Deliberately a setter rather than an import of 'superuser': this module is
 * meant to stay testable without the cockpit page environment (the unit tests
 * only alias 'cockpit'), and the provider is the place that watches the value
 * anyway. What matters is that a FUNCTION is stored here and not a value:
 * `superuser.allowed` is `null` during session initialisation and only later
 * becomes `true`/`false` (see pkg/lib/superuser.js). A value copied once would
 * therefore almost always be `null` -- which is why it is read at the moment
 * of escalation instead. */
let superuserAllowedSource: () => boolean = () => false;

export function setSuperuserAllowedSource(fn: () => boolean): void {
    superuserAllowedSource = fn;
}

/* Probe in flight, so that concurrent callers (provider startup, run()'s own
 * probe after resetAccessMode()) do not start several `docker info` runs and
 * overwrite each other's mode. */
let inFlightProbe: Promise<AccessMode> | null = null;

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
 * Determines the access mode and remembers it.
 *
 * First without escalation; if that fails and admin access is available, a
 * second attempt with superuser. If both fail, the classified error is thrown.
 */
export function probeAccess(
    opts: { superuserAllowed?: boolean } = {}
): Promise<AccessMode> {
    if (inFlightProbe !== null)
        return inFlightProbe;

    const running = doProbe(opts);
    inFlightProbe = running;
    // Do not hang .finally() on the returned promise: its rejection would
    // then need handling on top. The cleanup hangs on the original and lets
    // the rejection propagate unchanged.
    running.then(
        () => { if (inFlightProbe === running) inFlightProbe = null; },
        () => { if (inFlightProbe === running) inFlightProbe = null; });
    return running;
}

async function doProbe(opts: { superuserAllowed?: boolean }): Promise<AccessMode> {
    const probe = ['docker', 'info', '--format', '{{json .}}'];

    try {
        await invoke(probe, 'none');
        accessMode = 'none';
        return accessMode;
    } catch (err) {
        const first = toDockerError(err);

        // A missing binary or a dead daemon does not get better with
        // escalated privileges.
        if (first.kind === 'not-installed' || first.kind === 'daemon-unreachable')
            throw first;
        // Read only NOW: at call time the cockpit session may not know
        // about admin access yet.
        const allowed = opts.superuserAllowed ?? superuserAllowedSource();
        if (!allowed)
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
 * Runs a command and returns its output.
 * Throws a DockerError on failure.
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
 * Starts a command as a stream (for `docker logs -f` and `docker events`).
 * The caller ends it through close().
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
                /* already ended */
            }
        },
    };
}
