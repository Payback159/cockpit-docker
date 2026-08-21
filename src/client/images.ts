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

export async function listImages(): Promise<DockerImage[]> {
    const [imagesOut, containersOut] = await Promise.all([
        run(['docker', 'images', '--format', 'json']),
        run(['docker', 'ps', '-a', '--filter', 'label=com.docker.compose.project',
            '--format', 'json']),
    ]);

    // Welches Image gehoert zu welchen Compose-Projekten?
    const projectsByImage = new Map<string, Set<string>>();
    for (const c of parseJsonList<RawContainer>(containersOut)) {
        const project = parseLabels(c.Labels)['com.docker.compose.project'];
        if (!project)
            continue;
        const key = c.Image;
        if (!projectsByImage.has(key))
            projectsByImage.set(key, new Set());
        projectsByImage.get(key)!.add(project);
    }

    return parseJsonList<RawImage>(imagesOut).map(img => {
        const ref = `${img.Repository}:${img.Tag}`;
        const projects = projectsByImage.get(ref);
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
    await run(['docker', 'pull', ref]);
}

export async function removeImage(id: string): Promise<void> {
    await run(['docker', 'rmi', id]);
}
