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

import React from 'react';
import cockpit from 'cockpit';
import {
    Card,
    CardBody,
    CardTitle
} from "@patternfly/react-core/dist/esm/components/Card/index.js";
import {
    EmptyState,
    EmptyStateBody
} from "@patternfly/react-core/dist/esm/components/EmptyState/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";
import {
    Alert,
    AlertVariant
} from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { NetworkIcon } from '@patternfly/react-icons';
import { ListingTable } from "cockpit-components-table.jsx";
import { listContainers, type ContainerSummary } from '../client';
import { useDockerResource } from '../hooks/useDockerResource';

const _ = cockpit.gettext;

interface PortMapping {
    containerName: string;
    containerPort: string;
    hostPort: string;
    protocol: string;
    hostIP: string;
    project: string;
    state: string;
}

function toPortMappings(containers: ContainerSummary[]): PortMapping[] {
    const mappings: PortMapping[] = [];
    for (const container of containers) {
        if (!container.Ports)
            continue;
        for (const entry of container.Ports.split(', ')) {
            const hostMapping = entry.match(/^(\d+\.\d+\.\d+\.\d+):(\d+)->(\d+)\/(tcp|udp)$/);
            const containerOnly = entry.match(/^(\d+)\/(tcp|udp)$/);
            if (hostMapping) {
                mappings.push({
                    containerName: container.Name,
                    containerPort: hostMapping[3],
                    hostPort: hostMapping[2],
                    protocol: hostMapping[4].toUpperCase(),
                    hostIP: hostMapping[1],
                    project: container.Project,
                    state: container.State,
                });
            } else if (containerOnly) {
                mappings.push({
                    containerName: container.Name,
                    containerPort: containerOnly[1],
                    hostPort: '-',
                    protocol: containerOnly[2].toUpperCase(),
                    hostIP: '-',
                    project: container.Project,
                    state: container.State,
                });
            }
        }
    }
    mappings.sort((a, b) => {
        if (a.hostPort === '-' && b.hostPort === '-')
            return a.containerName.localeCompare(b.containerName);
        if (a.hostPort === '-') return 1;
        if (b.hostPort === '-') return -1;
        const diff = parseInt(a.hostPort) - parseInt(b.hostPort);
        return diff !== 0 ? diff : a.containerName.localeCompare(b.containerName);
    });
    return mappings;
}

export const PortMapping: React.FC = () => {
    const { data: containers, loading, error } = useDockerResource(
        () => listContainers({ composeOnly: true }),
        { events: ['container'], tab: 5 });

    const ports = React.useMemo(() => toPortMappings(containers ?? []), [containers]);

    const getStateLabel = (state: string) => {
        const stateLower = state.toLowerCase();
        if (stateLower === 'running') {
            return <Label color="green">{state}</Label>;
        } else if (stateLower === 'exited') {
            return <Label color="red">{state}</Label>;
        } else if (stateLower === 'created') {
            return <Label color="blue">{state}</Label>;
        } else if (stateLower === 'paused') {
            return <Label color="orange">{state}</Label>;
        } else {
            return <Label color="grey">{state}</Label>;
        }
    };

    if (loading) {
        return (
            <Card>
                <CardBody>
                    <Spinner size="lg" /> {_("Loading port mappings...")}
                </CardBody>
            </Card>
        );
    }

    if (error) {
        return (
            <Alert variant={AlertVariant.danger} title={_("Error loading port mappings")}>
                {error.message}
            </Alert>
        );
    }

    if (ports.length === 0) {
        return (
            <Card>
                <CardBody>
                    <EmptyState>
                        <NetworkIcon />
                        <h4>{_("No port mappings found")}</h4>
                        <EmptyStateBody>
                            {_("There are no containers with exposed or mapped ports.")}
                        </EmptyStateBody>
                    </EmptyState>
                </CardBody>
            </Card>
        );
    }

    const columnTitles = [
        { title: _("Host Port"), sortable: true },
        { title: _("Container Port"), sortable: true },
        { title: _("Protocol"), sortable: true },
        { title: _("Host IP"), sortable: true },
        { title: _("Container"), sortable: true, header: true },
        { title: _("Project"), sortable: true },
        { title: _("State"), sortable: true }
    ];

    const rows = ports.map((port, index) => ({
        columns: [
            { title: port.hostPort === '-' ? <em>{_("not mapped")}</em> : <strong>{port.hostPort}</strong> },
            { title: port.containerPort },
            { title: <Label color="blue">{port.protocol}</Label> },
            { title: port.hostIP },
            { title: port.containerName },
            { title: port.project },
            { title: getStateLabel(port.state) }
        ],
        props: { key: `${port.containerName}-${index}` }
    }));

    return (
        <Card id="port-mappings">
            <CardTitle>{_("Port Mappings")}</CardTitle>
            <CardBody className="contains-list">
                <ListingTable
                    variant="compact"
                    gridBreakPoint="grid-md"
                    emptyCaption={_("No port mappings")}
                    aria-label={_("Port Mappings")}
                    columns={columnTitles}
                    rows={rows}
                />
            </CardBody>
        </Card>
    );
};
