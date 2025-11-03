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

import React, { useState, useEffect } from 'react';
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

export const PortMapping: React.FC = () => {
    const [ports, setPorts] = useState<PortMapping[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadPorts = async () => {
        try {
            setLoading(true);
            setError(null);

            // Get all containers with port mappings
            const result = await cockpit.spawn(
                ['docker', 'ps', '-a', '--format', 'json'],
                { err: 'message' }
            );

            if (!result || result.trim() === '') {
                setPorts([]);
                return;
            }

            // Parse NDJSON
            const lines = result.trim().split('\n');
            const mappings: PortMapping[] = [];

            lines.forEach(line => {
                const container = JSON.parse(line);
                const portsStr = container.Ports || '';

                // Parse labels for project name
                const labels: Record<string, string> = {};
                if (container.Labels) {
                    const labelPairs = container.Labels.split(',');
                    labelPairs.forEach((pair: string) => {
                        const [key, ...valueParts] = pair.split('=');
                        if (key && valueParts.length > 0) {
                            labels[key] = valueParts.join('=');
                        }
                    });
                }

                const project = labels['com.docker.compose.project'] || '-';

                // Parse ports string
                // Format: "0.0.0.0:8080->80/tcp, 0.0.0.0:8443->443/tcp"
                if (portsStr) {
                    const portEntries = portsStr.split(', ');
                    portEntries.forEach((entry: string) => {
                        // Match pattern: "0.0.0.0:8080->80/tcp" or "80/tcp" (no host port)
                        const hostMapping = entry.match(/^(\d+\.\d+\.\d+\.\d+):(\d+)->(\d+)\/(tcp|udp)$/);
                        const containerOnly = entry.match(/^(\d+)\/(tcp|udp)$/);

                        if (hostMapping) {
                            mappings.push({
                                containerName: container.Names,
                                containerPort: hostMapping[3],
                                hostPort: hostMapping[2],
                                protocol: hostMapping[4].toUpperCase(),
                                hostIP: hostMapping[1],
                                project,
                                state: container.State
                            });
                        } else if (containerOnly) {
                            // Port exposed but not mapped to host
                            mappings.push({
                                containerName: container.Names,
                                containerPort: containerOnly[1],
                                hostPort: '-',
                                protocol: containerOnly[2].toUpperCase(),
                                hostIP: '-',
                                project,
                                state: container.State
                            });
                        }
                    });
                }
            });

            // Sort by host port (numeric), then container name
            mappings.sort((a, b) => {
                if (a.hostPort === '-' && b.hostPort === '-') return a.containerName.localeCompare(b.containerName);
                if (a.hostPort === '-') return 1;
                if (b.hostPort === '-') return -1;
                const portA = parseInt(a.hostPort);
                const portB = parseInt(b.hostPort);
                if (portA !== portB) return portA - portB;
                return a.containerName.localeCompare(b.containerName);
            });

            setPorts(mappings);
        } catch (err) {
            console.error('Failed to load port mappings:', err);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPorts();
        // Refresh every 30 seconds
        const interval = setInterval(loadPorts, 30000);
        return () => clearInterval(interval);
    }, []);

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
                {error}
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
