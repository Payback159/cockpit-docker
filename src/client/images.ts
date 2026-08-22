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

/* Images: auflisten, holen, entfernen. */
import { run } from './spawn';
import { parseJsonList, parseLabels } from './parse';
import type { DockerImage } from './types';

interface RawImage {
    ID: string;
    Repository: string;
    Tag: string;
    Size: string;
    CreatedAt: string;
}

interface RawContainer {
    Image: string;
    Labels?: string;
}

/* `docker ps` meldet das Image so, wie es referenziert wurde: `busybox` oder
 * `busybox:latest`. `docker images` liefert Repository und Tag getrennt, also
 * immer mit Tag. Ohne Normalisierung findet die Zuordnung das Image nicht. */
function normalizeRef(ref: string): string {
    if (ref.includes('@'))
        return ref;                       // Digest-Referenz, siehe unten
    const lastSlash = ref.lastIndexOf('/');
    const colon = ref.indexOf(':', lastSlash + 1);
    return colon === -1 ? `${ref}:latest` : ref;
}

export async function listImages(): Promise<DockerImage[]> {
    const [imagesOut, containersOut] = await Promise.all([
        run(['docker', 'images', '--format', 'json']),
        run(['docker', 'ps', '-a', '--filter', 'label=com.docker.compose.project',
            '--format', 'json']),
    ]);

    // Welches Image gehoert zu welchen Compose-Projekten?
    //
    // Bekannte Grenze: referenziert ein Container sein Image ueber einen
    // Digest (`repo@sha256:...`), wird es hier nicht zugeordnet. Das
    // aufzuloesen braeuchte einen zweiten Aufruf (`docker images
    // --digests`), und Compose-Dateien referenzieren Images in der Praxis
    // ueber Tags, nicht ueber Digests -- der Fall bleibt daher bewusst
    // unbehandelt.
    const projectsByImage = new Map<string, Set<string>>();
    for (const c of parseJsonList<RawContainer>(containersOut)) {
        const project = parseLabels(c.Labels)['com.docker.compose.project'];
        if (!project)
            continue;
        const key = normalizeRef(c.Image);
        if (!projectsByImage.has(key))
            projectsByImage.set(key, new Set());
        projectsByImage.get(key)!.add(project);
    }

    return parseJsonList<RawImage>(imagesOut).map(img => {
        // Ein Image ohne Tag (`<none>`) kann ueber seine Referenz nie
        // getroffen werden -- keinen Schluessel dafuer bilden.
        const projects = img.Tag === '<none>'
            ? undefined
            : projectsByImage.get(`${img.Repository}:${img.Tag}`);
        return {
            ID: img.ID,
            Repository: img.Repository,
            Tag: img.Tag,
            Size: img.Size,
            CreatedAt: img.CreatedAt,
            UsedByCompose: projects !== undefined,
            ComposeProjects: projects ? [...projects].sort() : [],
        };
    });
}

export async function pullImage(ref: string): Promise<void> {
    // `--` beendet die Optionsliste: die Referenz kommt aus einem freien
    // Eingabefeld, und ein fuehrender Bindestrich soll nicht als Flag gelesen
    // werden. Eine Shell ist ohnehin nicht beteiligt (cockpit.spawn nimmt ein
    // argv), es geht allein um die Argumentzuordnung.
    await run(['docker', 'pull', '--', ref]);
}

export async function removeImage(id: string): Promise<void> {
    await run(['docker', 'rmi', id]);
}
