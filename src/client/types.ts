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

/* Gemeinsame Datentypen der Client-Schicht. */
import type { DockerErrorKind } from './errors';

export interface DockerInfo {
    installed: boolean;
    version?: string;
    kind?: DockerErrorKind | undefined;
    error?: string;
}

export interface ComposeInfo {
    installed: boolean;
    version?: string;
    isPlugin: boolean;
    /* Compose v1 (Python) wurde gefunden. v1 kennt kein `compose ls`,
     * daher gilt es als nicht nutzbar. */
    isLegacyV1: boolean;
    kind?: DockerErrorKind | undefined;
    error?: string;
}

export interface SystemInfo {
    docker: DockerInfo;
    compose: ComposeInfo;
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
    /* Kann MEHRERE kommagetrennte Pfade enthalten. Nur zur Anzeige
     * verwenden, nie als -f-Argument. */
    ConfigFiles: string;
}

export interface ComposeService {
    ID: string;
    Name: string;
    Image: string;
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

export interface ContainerSummary {
    ID: string;
    Name: string;
    Image: string;
    State: string;
    Status: string;
    Project: string;
    Service: string;
    Ports: string;
}

export interface DockerVolume {
    Name: string;
    Driver: string;
    Mountpoint: string;
    CreatedAt: string;
    Labels: Record<string, string>;
    Scope: string;
    Options: Record<string, string> | null;
}

export interface DockerImage {
    ID: string;
    Repository: string;
    Tag: string;
    Size: string;
    CreatedAt: string;
    UsedByCompose: boolean;
    ComposeProjects: string[];
}
