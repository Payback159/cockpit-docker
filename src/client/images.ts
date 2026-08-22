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

/* Images: list, pull, remove. */
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

/* `docker ps` reports the image the way it was referenced: `busybox` or
 * `busybox:latest`. `docker images` returns repository and tag separately, so
 * always with a tag. Without normalisation the mapping misses the image. */
function normalizeRef(ref: string): string {
    if (ref.includes('@'))
        return ref; // digest reference, see below
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

    // Which image belongs to which compose projects?
    //
    // Known limitation: if a container references its image by digest
    // (`repo@sha256:...`), it is not mapped here. Resolving that would need a
    // second call (`docker images --digests`), and in practice compose files
    // reference images by tag, not by digest -- so the case is deliberately
    // left unhandled.
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
        // An image without a tag (`<none>`) can never be hit through its
        // reference -- do not build a key for it.
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
    // `--` ends the option list: the reference comes from a free-form input
    // field, and a leading dash must not be read as a flag. No shell is
    // involved anyway (cockpit.spawn takes an argv); this is purely about
    // argument assignment.
    await run(['docker', 'pull', '--', ref]);
}

export async function removeImage(id: string): Promise<void> {
    await run(['docker', 'rmi', id]);
}
