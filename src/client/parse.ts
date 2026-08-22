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

/* Output parsing for Docker commands.
 *
 * This module deliberately imports NO cockpit: that lets its tests run as
 * plain Node processes without any mocking scaffolding.
 */

/**
 * Parses a list output from Docker.
 *
 * Depending on the command Docker returns either a JSON array or NDJSON (one
 * object per line), and which command returns which format is not guaranteed
 * across the supported version range. This function therefore accepts both and
 * decides on the first non-whitespace character.
 */
export function parseJsonList<T>(text: string): T[] {
    const trimmed = text.trim();
    if (trimmed === '')
        return [];

    if (trimmed[0] === '[')
        return JSON.parse(trimmed) as T[];

    return trimmed
            .split('\n')
            .map(line => line.trim())
            .filter(line => line !== '')
            .map(line => JSON.parse(line) as T);
}

/**
 * Parses an output that contains exactly one object (`docker info`, say).
 */
export function parseJson<T>(text: string): T {
    const trimmed = text.trim();
    if (trimmed === '')
        throw new SyntaxError('Empty output, expected an object');
    return JSON.parse(trimmed) as T;
}

/**
 * Splits the comma-separated label string that `docker ps --format json`
 * returns in the `Labels` field.
 *
 * Values may contain equals signs, so we split on the first one only. Entries
 * without a value are skipped.
 */
export function parseLabels(labels: string | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!labels)
        return out;

    for (const pair of labels.split(',')) {
        const eq = pair.indexOf('=');
        if (eq <= 0)
            continue;
        out[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    return out;
}
