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

/* Compose-Projekte und ihre Services.
 *
 * Projekte werden ausschliesslich ueber --project-name angesprochen. Das
 * Feld ConfigFiles aus `compose ls` kann mehrere kommagetrennte Pfade
 * enthalten und ist als -f-Argument dann ungueltig; es dient nur der Anzeige.
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
 * Services eines Projekts. Ein unbekanntes Projekt liefert eine leere Liste,
 * keinen Fehler -- Docker beendet sich in diesem Fall mit exit 0.
 *
 * Die Funktion gehoert zur Schnittstelle, die die Spec fuer compose.ts
 * vorsieht, auch wenn die Oberflaeche sie derzeit nicht aufruft; ihr Test
 * sichert das NDJSON-Verhalten ab, an dem die frueherer Implementierung ab
 * dem zweiten Service scheiterte.
 */
export async function listServices(project: string): Promise<ComposeService[]> {
    const out = await run(projectArgs(project, 'ps', '--format', 'json', '--all'));
    return parseJsonList<ComposeService>(out);
}

export async function upProject(project: string): Promise<void> {
    await run(projectArgs(project, 'up', '-d'));
}

/**
 * Startet die Container eines bereits vorhandenen Projekts neu, ohne das
 * Projektmodell aus einer Compose-Datei zu rekonstruieren. `start` arbeitet
 * -- wie stop/restart/down/ps -- ausschliesslich ueber Container-Labels und
 * kommt daher ohne -f aus.
 *
 * `upProject` (docker compose up -d) waere hier die falsche Wahl: es
 * benoetigt zwingend die Compose-Datei(en) und schlaegt ohne -f mit
 * "no configuration file provided: not found" fehl, weil run() ohne
 * Arbeitsverzeichnis laeuft. upProject bleibt Teil der Schnittstelle fuer
 * einen Create-from-file-Ablauf; diese Oberflaeche kennt nur bereits
 * bestehende Projekte, fuer die start() genuegt.
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
 * Liest eine Compose-Datei. Erwartet EINEN Pfad -- Aufrufer, die ein
 * ConfigFiles-Feld haben, muessen es vorher an Kommas zerlegen.
 *
 * Der Zugriffsmodus gilt auch hier: laeuft der Docker-Zugriff ueber
 * Rechteerhoehung, liegen die Projektverzeichnisse in aller Regel unter root.
 * Ohne `superuser` scheiterte allein diese Leseoperation, waehrend jede
 * andere Operation des Moduls funktioniert.
 */
export async function readComposeFile(path: string): Promise<string> {
    const options = getAccessMode() === 'require'
        ? { superuser: 'require' as const }
        : {};
    const content = await cockpit.file(path, options).read();
    return content ?? '';
}
