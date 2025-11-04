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

import cockpit from 'cockpit';

export interface DockerInfo {
    installed: boolean;
    version?: string;
    error?: string;
}

export interface DockerComposeInfo {
    installed: boolean;
    version?: string;
    isPlugin: boolean;
    error?: string;
}

export interface SystemInfo {
    docker: DockerInfo;
    compose: DockerComposeInfo;
}

export interface DockerSystemInfo {
    Containers: number;
    ContainersRunning: number;
    ContainersPaused: number;
    ContainersStopped: number;
    Images: number;
    Driver: string;
    OperatingSystem: string;
    KernelVersion: string;
    NCPU: number;
    MemTotal: number;
    DockerRootDir: string;
    LoggingDriver: string;
    CgroupDriver: string;
    CgroupVersion: string;
}

export interface ComposeProject {
    Name: string;
    Status: string;
    ConfigFiles: string;
}

export interface ComposeService {
    ID: string;
    Name: string;
    Image: string;
    Command: string;
    Project: string;
    Service: string;
    State: string;
    Health: string;
    ExitCode: number;
    Publishers?: Array<{
        URL: string;
        TargetPort: number;
        PublishedPort: number;
        Protocol: string;
    }>;
}

/**
 * Check if Docker is installed and get version
 */
export async function checkDocker(): Promise<DockerInfo> {
    try {
        const result = await cockpit.spawn(['docker', '--version'], { err: 'message' });
        const version = result.trim()
                .replace('Docker version ', '')
                .split(',')[0];
        return {
            installed: true,
            version
        };
    } catch (error) {
        return {
            installed: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * Check if Docker Compose is installed (new plugin version)
 */
export async function checkDockerCompose(): Promise<DockerComposeInfo> {
    // First, try the new 'docker compose' plugin
    try {
        const result = await cockpit.spawn(['docker', 'compose', 'version'], { err: 'message' });
        const version = result.trim()
                .replace('Docker Compose version ', '')
                .replace(/^v/, '');
        return {
            installed: true,
            version,
            isPlugin: true
        };
    } catch {
        // Fall back to old 'docker-compose' standalone
        try {
            const result = await cockpit.spawn(['docker-compose', '--version'], { err: 'message' });
            const version = result.trim()
                    .replace('docker-compose version ', '')
                    .split(',')[0];
            return {
                installed: true,
                version,
                isPlugin: false
            };
        } catch {
            return {
                installed: false,
                isPlugin: false,
                error: `Neither 'docker compose' plugin nor 'docker-compose' standalone found`
            };
        }
    }
}

/**
 * Check both Docker and Docker Compose
 */
export async function checkSystemInfo(): Promise<SystemInfo> {
    const [docker, compose] = await Promise.all([
        checkDocker(),
        checkDockerCompose()
    ]);

    return { docker, compose };
}

/**
 * Get detailed Docker system information
 */
export async function getDockerInfo(): Promise<DockerSystemInfo | null> {
    try {
        const result = await cockpit.spawn(
            ['docker', 'info', '--format', '{{json .}}'],
            { err: 'message' }
        );

        const info = JSON.parse(result);
        
        return {
            Containers: info.Containers || 0,
            ContainersRunning: info.ContainersRunning || 0,
            ContainersPaused: info.ContainersPaused || 0,
            ContainersStopped: info.ContainersStopped || 0,
            Images: info.Images || 0,
            Driver: info.Driver || '',
            OperatingSystem: info.OperatingSystem || '',
            KernelVersion: info.KernelVersion || '',
            NCPU: info.NCPU || 0,
            MemTotal: info.MemTotal || 0,
            DockerRootDir: info.DockerRootDir || '',
            LoggingDriver: info.LoggingDriver || '',
            CgroupDriver: info.CgroupDriver || '',
            CgroupVersion: info.CgroupVersion || ''
        };
    } catch (error) {
        console.error('Failed to get Docker info:', error);
        return null;
    }
}

/**
 * Count Docker volumes
 */
export async function countVolumes(): Promise<number> {
    try {
        const result = await cockpit.spawn(
            ['docker', 'volume', 'ls', '-q'],
            { err: 'message' }
        );
        
        if (!result || result.trim() === '') {
            return 0;
        }
        
        return result.trim().split('\n').length;
    } catch (error) {
        console.error('Failed to count volumes:', error);
        return 0;
    }
}

/**
 * Count Docker networks
 */
export async function countNetworks(): Promise<number> {
    try {
        const result = await cockpit.spawn(
            ['docker', 'network', 'ls', '-q'],
            { err: 'message' }
        );
        
        if (!result || result.trim() === '') {
            return 0;
        }
        
        return result.trim().split('\n').length;
    } catch (error) {
        console.error('Failed to count networks:', error);
        return 0;
    }
}

/**
 * List all Docker Compose projects
 */
export async function listComposeProjects(): Promise<ComposeProject[]> {
    try {
        const result = await cockpit.spawn(['docker', 'compose', 'ls', '--format', 'json', '--all'], { err: 'message' });
        if (!result || result.trim() === '') {
            return [];
        }
        const projects = JSON.parse(result);
        return Array.isArray(projects) ? projects : [];
    } catch (error) {
        console.error('Failed to list compose projects:', error);
        return [];
    }
}

/**
 * List services for a specific Docker Compose project
 */
export async function listComposeServices(projectName: string): Promise<ComposeService[]> {
    try {
        const result = await cockpit.spawn(
            ['docker', 'compose', 'ps', '--format', 'json', '--all'],
            {
                err: 'message',
                environ: ['COMPOSE_PROJECT_NAME=' + projectName]
            }
        );
        if (!result || result.trim() === '') {
            return [];
        }
        const services = JSON.parse(result);
        return Array.isArray(services) ? services : [];
    } catch (error) {
        console.error('Failed to list compose services:', error);
        return [];
    }
}

/**
 * Start a Docker Compose project
 */
export async function startComposeProject(projectName: string, projectPath?: string): Promise<void> {
    const args = ['docker', 'compose'];
    if (projectPath) {
        args.push('-f', projectPath);
    }
    args.push('up', '-d');

    console.log('Starting compose project:', projectName, 'with path:', projectPath, 'args:', args);
    await cockpit.spawn(args, {
        err: 'message',
        environ: projectPath ? [] : ['COMPOSE_PROJECT_NAME=' + projectName]
    });
}

/**
 * Stop a Docker Compose project
 */
export async function stopComposeProject(projectName: string, projectPath?: string): Promise<void> {
    const args = ['docker', 'compose'];
    if (projectPath) {
        args.push('-f', projectPath);
    }
    args.push('stop');

    await cockpit.spawn(args, {
        err: 'message',
        environ: projectPath ? [] : ['COMPOSE_PROJECT_NAME=' + projectName]
    });
}

/**
 * Remove a Docker Compose project (stop and remove containers)
 */
export async function downComposeProject(projectName: string, projectPath?: string): Promise<void> {
    const args = ['docker', 'compose'];
    if (projectPath) {
        args.push('-f', projectPath);
    }
    args.push('down');

    await cockpit.spawn(args, {
        err: 'message',
        environ: projectPath ? [] : ['COMPOSE_PROJECT_NAME=' + projectName]
    });
}

/**
 * Restart a Docker Compose project
 */
export async function restartComposeProject(projectName: string, projectPath?: string): Promise<void> {
    const args = ['docker', 'compose'];
    if (projectPath) {
        args.push('-f', projectPath);
    }
    args.push('restart');

    await cockpit.spawn(args, {
        err: 'message',
        environ: projectPath ? [] : ['COMPOSE_PROJECT_NAME=' + projectName]
    });
}

/**
 * Restart a single container
 */
export async function restartContainer(containerName: string): Promise<void> {
    await cockpit.spawn(['docker', 'restart', containerName], { err: 'message' });
}

/**
 * Read the content of a Docker Compose file
 */
export async function readComposeFile(filePath: string): Promise<string> {
    const result = await cockpit.file(filePath).read();
    return result || '';
}

/**
 * Docker Volume Interface
 */
export interface DockerVolume {
    Name: string;
    Driver: string;
    Mountpoint: string;
    CreatedAt: string;
    Labels: Record<string, string>;
    Scope: string;
    Options: Record<string, string> | null;
}

/**
 * List all Docker volumes
 */
export async function listVolumes(): Promise<DockerVolume[]> {
    try {
        // First get the list of volume names
        const result = await cockpit.spawn(
            ['docker', 'volume', 'ls', '--format', '{{.Name}}'],
            { err: 'message' }
        );

        if (!result || result.trim() === '') {
            return [];
        }

        // Get volume names
        const volumeNames = result.trim().split('\n');
        
        // Inspect all volumes to get full details
        const inspectPromises = volumeNames.map(name => inspectVolume(name));
        const inspectResults = await Promise.all(inspectPromises);
        
        // Filter out null results and return
        return inspectResults.filter((vol): vol is DockerVolume => vol !== null);
    } catch (error) {
        console.error('Failed to list volumes:', error);
        return [];
    }
}

/**
 * Get detailed information about a specific volume
 */
export async function inspectVolume(volumeName: string): Promise<DockerVolume | null> {
    try {
        const result = await cockpit.spawn(
            ['docker', 'volume', 'inspect', volumeName],
            { err: 'message' }
        );

        const volumes = JSON.parse(result);
        if (Array.isArray(volumes) && volumes.length > 0) {
            const vol = volumes[0];
            return {
                Name: vol.Name || '',
                Driver: vol.Driver || 'local',
                Mountpoint: vol.Mountpoint || '',
                CreatedAt: vol.CreatedAt || '',
                Labels: vol.Labels || {},
                Scope: vol.Scope || 'local',
                Options: vol.Options || null
            };
        }
        return null;
    } catch (error) {
        console.error('Failed to inspect volume:', error);
        return null;
    }
}

/**
 * Remove a Docker volume
 */
export async function removeVolume(volumeName: string, force: boolean = false): Promise<void> {
    const args = ['docker', 'volume', 'rm'];
    if (force) {
        args.push('-f');
    }
    args.push(volumeName);
    await cockpit.spawn(args, { err: 'message' });
}

/**
 * Prune unused volumes
 */
export async function pruneVolumes(force: boolean = false): Promise<string> {
    const args = ['docker', 'volume', 'prune'];
    if (force) {
        args.push('-f');
    } else {
        args.push('--force');
    }
    const result = await cockpit.spawn(args, { err: 'message' });
    return result;
}
