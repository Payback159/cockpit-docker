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

/* Compose projects and their services.
 *
 * Projects are addressed exclusively through --project-name. The ConfigFiles
 * field from `compose ls` may contain several comma-separated paths and is
 * then invalid as a -f argument; it serves display purposes only.
 */
import cockpit from 'cockpit';

import { getAccessMode, run } from './spawn';
import { parseJsonList } from './parse';
import type { ComposeProject, ComposeService } from './types';

function projectArgs(project: string, ...rest: string[]): string[] {
    return ['docker', 'compose', '--project-name', project, ...rest];
}

export async function listProjects(): Promise<ComposeProject[]> {
    const out = await run(['docker', 'compose', 'ls', '--format', 'json', '--all']);
    return parseJsonList<ComposeProject>(out);
}

/**
 * Services of a project. An unknown project returns an empty list, not an
 * error -- Docker exits with status 0 in that case.
 *
 * The function is part of the interface the spec lays out for compose.ts, even
 * though the UI does not currently call it; its test pins down the NDJSON
 * behaviour that the earlier implementation failed on from the second service
 * onwards.
 */
export async function listServices(project: string): Promise<ComposeService[]> {
    const out = await run(projectArgs(project, 'ps', '--format', 'json', '--all'));
    return parseJsonList<ComposeService>(out);
}

export async function upProject(project: string): Promise<void> {
    await run(projectArgs(project, 'up', '-d'));
}

/**
 * Starts the containers of an already existing project again, without
 * reconstructing the project model from a compose file. `start` works -- like
 * stop/restart/down/ps -- exclusively through container labels and therefore
 * needs no -f.
 *
 * `upProject` (docker compose up -d) would be the wrong choice here: it
 * strictly requires the compose file(s) and fails without -f with
 * "no configuration file provided: not found", because run() runs without a
 * working directory. upProject stays part of the interface for a
 * create-from-file flow; this UI only knows about projects that already
 * exist, for which start() is enough.
 */
export async function startProject(project: string): Promise<void> {
    await run(projectArgs(project, 'start'));
}

export async function stopProject(project: string): Promise<void> {
    await run(projectArgs(project, 'stop'));
}

export async function downProject(project: string): Promise<void> {
    await run(projectArgs(project, 'down'));
}

export async function restartProject(project: string): Promise<void> {
    await run(projectArgs(project, 'restart'));
}

/**
 * Reads a compose file. Expects ONE path -- callers holding a ConfigFiles
 * field must split it on commas first.
 *
 * The access mode applies here too: if Docker access runs through privilege
 * escalation, the project directories almost always belong to root. Without
 * `superuser` this read operation alone would fail while every other
 * operation of the module works.
 */
export async function readComposeFile(path: string): Promise<string> {
    const options = getAccessMode() === 'require'
        ? { superuser: 'require' as const }
        : {};
    const content = await cockpit.file(path, options).read();
    return content ?? '';
}
