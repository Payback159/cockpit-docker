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

/* Volumes: list, remove, prune. */
import { run } from './spawn';
import { parseJsonList } from './parse';
import type { DockerVolume } from './types';

/**
 * Lists all volumes with details.
 *
 * `docker volume inspect` takes several names in ONE call. The previously used
 * one-call-per-volume approach cost 153 processes per load on a system with
 * 152 volumes.
 */
export async function listVolumes(): Promise<DockerVolume[]> {
    const names = (await run(['docker', 'volume', 'ls', '--format', '{{.Name}}']))
            .trim();
    if (names === '')
        return [];

    const list = names.split('\n');
    const out = await run(['docker', 'volume', 'inspect', ...list]);

    return parseJsonList<Partial<DockerVolume>>(out).map(v => ({
        Name: v.Name ?? '',
        Driver: v.Driver ?? 'local',
        Mountpoint: v.Mountpoint ?? '',
        CreatedAt: v.CreatedAt ?? '',
        Labels: v.Labels ?? {},
        Scope: v.Scope ?? 'local',
        Options: v.Options ?? null,
    }));
}

/**
 * Counts volumes without inspecting them.
 *
 * The overview only needs the count. Using `listVolumes()` for it would mean
 * inspecting every volume and throwing the full payload away again -- on every
 * debounced event. Counterpart to countNetworks() in system.ts.
 */
export async function countVolumes(): Promise<number> {
    const out = await run(['docker', 'volume', 'ls', '-q']);
    const trimmed = out.trim();
    return trimmed === '' ? 0 : trimmed.split('\n').length;
}

export async function removeVolume(name: string, force = false): Promise<void> {
    const args = ['docker', 'volume', 'rm'];
    if (force)
        args.push('-f');
    args.push(name);
    await run(args);
}

/**
 * Removes unused volumes.
 *
 * `--force` merely suppresses Docker's own prompt on the console; the UI is
 * what asks the user.
 */
export async function pruneVolumes(): Promise<string> {
    return run(['docker', 'volume', 'prune', '--force']);
}
