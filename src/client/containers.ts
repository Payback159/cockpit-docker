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

/* Container: auflisten, steuern, Logs. */
import { run, stream } from './spawn';
import { parseJsonList, parseLabels } from './parse';
import type { ContainerSummary } from './types';

interface RawContainer {
    ID: string;
    Names: string;
    Image: string;
    State: string;
    Status: string;
    Ports?: string;
    Labels?: string;
}

export async function listContainers(
    opts: { composeOnly?: boolean } = {}
): Promise<ContainerSummary[]> {
    const args = ['docker', 'ps', '-a'];
    if (opts.composeOnly)
        args.push('--filter', 'label=com.docker.compose.project');
    args.push('--format', 'json');

    const raw = parseJsonList<RawContainer>(await run(args));

    const out = raw.map(c => {
        const labels = parseLabels(c.Labels);
        return {
            ID: c.ID,
            Name: c.Names,
            Image: c.Image,
            State: c.State,
            Status: c.Status,
            Project: labels['com.docker.compose.project'] || 'unknown',
            Service: labels['com.docker.compose.service'] || 'unknown',
            Ports: c.Ports || '',
        };
    });

    out.sort((a, b) => {
        const byProject = a.Project.localeCompare(b.Project);
        return byProject !== 0 ? byProject : a.Service.localeCompare(b.Service);
    });
    return out;
}

export async function startContainer(name: string): Promise<void> {
    await run(['docker', 'start', name]);
}

export async function stopContainer(name: string): Promise<void> {
    await run(['docker', 'stop', name]);
}

export async function restartContainer(name: string): Promise<void> {
    await run(['docker', 'restart', name]);
}

export async function containerLogs(name: string, tail = 1000): Promise<string> {
    return run(['docker', 'logs', '--tail', String(tail), name]);
}

export function followLogs(
    name: string,
    onData: (chunk: string) => void
): { close: () => void } {
    return stream(['docker', 'logs', '-f', '--tail', '100', name], onData);
}
