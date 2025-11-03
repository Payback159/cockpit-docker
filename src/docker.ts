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
