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

/* Modulweite Fehlermeldung.
 *
 * not-installed, daemon-unreachable und permission-denied betreffen jeden
 * Tab; sie werden daher einmal oben angezeigt statt in jeder Ansicht.
 */
import React from 'react';
import { Alert, AlertVariant } from "@patternfly/react-core/dist/esm/components/Alert/index.js";

import cockpit from 'cockpit';
import type { DockerError } from '../client';

const _ = cockpit.gettext;

function title(error: DockerError): string {
    switch (error.kind) {
    case 'not-installed':
        return _("Docker is not installed");
    case 'daemon-unreachable':
        return _("The Docker daemon is not running");
    case 'permission-denied':
        return _("No permission to access Docker");
    default:
        return _("Docker is not available");
    }
}

function hint(error: DockerError): string {
    switch (error.kind) {
    case 'not-installed':
        return _("Install Docker Engine and the Docker Compose plugin to use this module.");
    case 'daemon-unreachable':
        return _("Start it with 'systemctl start docker'.");
    case 'permission-denied':
        return _("Turn on administrative access, or add your user to the 'docker' group.");
    default:
        return '';
    }
}

export const FatalErrorBanner: React.FC<{ error: DockerError }> = ({ error }) => (
    <Alert variant={AlertVariant.danger} isInline title={title(error)}>
        <p>{hint(error)}</p>
        <p className="pf-v6-u-mt-sm">
            <code>{error.raw}</code>
        </p>
    </Alert>
);
