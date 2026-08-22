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

/* Oeffentliche Schnittstelle der Client-Schicht.
 * Komponenten importieren aus './client', nicht aus den Einzelmodulen. */
export * from './types';
export { DockerError, isDockerError } from './errors';
export type { DockerErrorKind } from './errors';
export {
    probeAccess, getAccessMode, resetAccessMode, setSuperuserAllowedSource, stream,
} from './spawn';
export type { AccessMode } from './spawn';
export { checkDocker, checkCompose, checkSystem, getInfo, countNetworks } from './system';
export {
    listProjects, listServices, upProject, startProject, stopProject, downProject,
    restartProject, readComposeFile,
} from './compose';
export {
    listContainers, startContainer, stopContainer, restartContainer,
    containerLogs, followLogs,
} from './containers';
export { listImages, pullImage, removeImage } from './images';
export { listVolumes, countVolumes, removeVolume, pruneVolumes } from './volumes';
