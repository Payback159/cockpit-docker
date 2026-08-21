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

/* Volumes: auflisten, entfernen, aufraeumen. */
import { run } from './spawn';
import { parseJsonList } from './parse';
import type { DockerVolume } from './types';

/**
 * Listet alle Volumes mit Details.
 *
 * `docker volume inspect` nimmt mehrere Namen in EINEM Aufruf. Der frueher
 * verwendete Aufruf je Volume kostete auf einem System mit 152 Volumes 153
 * Prozesse pro Ladevorgang.
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

export async function removeVolume(name: string, force = false): Promise<void> {
    const args = ['docker', 'volume', 'rm'];
    if (force)
        args.push('-f');
    args.push(name);
    await run(args);
}

/**
 * Entfernt ungenutzte Volumes.
 *
 * `--force` unterdrueckt lediglich Dockers eigene Rueckfrage auf der Konsole;
 * die Rueckfrage an den Nutzer stellt die Oberflaeche.
 */
export async function pruneVolumes(): Promise<string> {
    return run(['docker', 'volume', 'prune', '--force']);
}
