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

/* Detection of Docker and Compose, plus system metrics. */
import { run } from './spawn';
import { parseJson } from './parse';
import { isDockerError } from './errors';
import type { ComposeInfo, DockerInfo, DockerSystemInfo, SystemInfo } from './types';

function describe(err: unknown): { kind?: DockerInfo['kind']; error: string } {
    if (isDockerError(err))
        return { kind: err.kind, error: err.raw };
    return { error: String(err) };
}

export async function checkDocker(): Promise<DockerInfo> {
    try {
        const out = await run(['docker', '--version']);
        const version = out.trim()
                .replace(/^Docker version /, '')
                .split(',')[0];
        return { installed: true, version };
    } catch (err) {
        return { installed: false, ...describe(err) };
    }
}

/**
 * Looks for Compose. Only v2 (the plugin) counts as usable.
 *
 * If the old `docker-compose` (v1, Python) is found instead, that is recorded
 * explicitly: v1 has no `docker compose ls`, which the project list is built
 * on. Reporting it as installed would mean the module announces Compose and
 * then fails on every operation.
 */
export async function checkCompose(): Promise<ComposeInfo> {
    try {
        const out = await run(['docker', 'compose', 'version']);
        const version = out.trim()
                .replace(/^Docker Compose version /, '')
                .replace(/^v/, '');
        return { installed: true, version, isPlugin: true, isLegacyV1: false };
    } catch (pluginErr) {
        try {
            const out = await run(['docker-compose', '--version']);
            const version = out.trim()
                    .replace(/^docker-compose version /, '')
                    .split(',')[0];
            return {
                installed: false,
                version,
                isPlugin: false,
                isLegacyV1: true,
            };
        } catch {
            return { installed: false, isPlugin: false, isLegacyV1: false, ...describe(pluginErr) };
        }
    }
}

export async function checkSystem(): Promise<SystemInfo> {
    const [docker, compose] = await Promise.all([checkDocker(), checkCompose()]);
    return { docker, compose };
}

export async function getInfo(): Promise<DockerSystemInfo> {
    const out = await run(['docker', 'info', '--format', '{{json .}}']);
    const raw = parseJson<Partial<DockerSystemInfo>>(out);
    return {
        Containers: raw.Containers ?? 0,
        ContainersRunning: raw.ContainersRunning ?? 0,
        ContainersPaused: raw.ContainersPaused ?? 0,
        ContainersStopped: raw.ContainersStopped ?? 0,
        Images: raw.Images ?? 0,
        Driver: raw.Driver ?? '',
        OperatingSystem: raw.OperatingSystem ?? '',
        KernelVersion: raw.KernelVersion ?? '',
        NCPU: raw.NCPU ?? 0,
        MemTotal: raw.MemTotal ?? 0,
        DockerRootDir: raw.DockerRootDir ?? '',
        LoggingDriver: raw.LoggingDriver ?? '',
        CgroupDriver: raw.CgroupDriver ?? '',
        CgroupVersion: raw.CgroupVersion ?? '',
    };
}

export async function countNetworks(): Promise<number> {
    const out = await run(['docker', 'network', 'ls', '-q']);
    const trimmed = out.trim();
    return trimmed === '' ? 0 : trimmed.split('\n').length;
}
