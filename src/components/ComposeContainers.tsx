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
import { Bullseye } from "@patternfly/react-core/dist/esm/layouts/Bullseye/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import PlayIcon from '@patternfly/react-icons/dist/esm/icons/play-icon';
import StopIcon from '@patternfly/react-icons/dist/esm/icons/stop-icon';
import RedoIcon from '@patternfly/react-icons/dist/esm/icons/redo-icon';
import ListIcon from '@patternfly/react-icons/dist/esm/icons/list-icon';
import { ListingTable } from "cockpit-components-table.jsx";
import { ContainerLogs } from './ContainerLogs';

const _ = cockpit.gettext;

interface Container {
    ID: string;
    Name: string;
    Image: string;
    State: string;
    Status: string;
    Project: string;
    Service: string;
    Ports: string;
}

export const ComposeContainers: React.FC = () => {
    const [containers, setContainers] = useState<Container[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [logsContainer, setLogsContainer] = useState<string | null>(null);

    const loadContainers = async () => {
        try {
            setLoading(true);
            setError(null);

            // Get all containers from compose projects
            const result = await cockpit.spawn(
                ['docker', 'ps', '-a', '--filter', 'label=com.docker.compose.project', '--format', 'json'],
                { err: 'message' }
            );

            if (!result || result.trim() === '') {
                setContainers([]);
                return;
            }

            // Parse NDJSON (newline-delimited JSON)
            const lines = result.trim().split('\n');
            const parsed: Container[] = lines.map(line => {
                const container = JSON.parse(line);

                // Parse labels from comma-separated string
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

                return {
                    ID: container.ID,
                    Name: container.Names,
                    Image: container.Image,
                    State: container.State,
                    Status: container.Status,
                    Project: labels['com.docker.compose.project'] || 'unknown',
                    Service: labels['com.docker.compose.service'] || 'unknown',
                    Ports: container.Ports || ''
                };
            });

            // Sort by project name, then service name
            parsed.sort((a, b) => {
                const projectCompare = a.Project.localeCompare(b.Project);
                if (projectCompare !== 0) return projectCompare;
                return a.Service.localeCompare(b.Service);
            });

            setContainers(parsed);
        } catch (err) {
            console.error('Failed to load containers:', err);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadContainers();
        const interval = setInterval(loadContainers, 30000); // Refresh every 30 seconds
        return () => clearInterval(interval);
    }, []);

    const handleContainerAction = async (containerName: string, action: 'start' | 'stop' | 'restart') => {
        try {
            let command: string;
            switch (action) {
            case 'start':
                command = 'start';
                break;
            case 'stop':
                command = 'stop';
                break;
            case 'restart':
                command = 'restart';
                break;
            }
            await cockpit.spawn(['docker', command, containerName], { err: 'message' });
            await loadContainers(); // Reload after action
        } catch (err) {
            console.error(`Failed to ${action} container:`, err);
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    const getStatusLabel = (state: string) => {
        const stateMap: Record<string, { color: "green" | "red" | "grey" | "blue", label: string }> = {
            running: { color: "green", label: "Running" },
            exited: { color: "red", label: "Exited" },
            created: { color: "grey", label: "Created" },
            restarting: { color: "blue", label: "Restarting" },
            paused: { color: "grey", label: "Paused" },
            dead: { color: "red", label: "Dead" },
        };

        const status = stateMap[state.toLowerCase()] || { color: "grey" as const, label: state };
        return <Label color={status.color}>{status.label}</Label>;
    };

    if (loading) {
        return (
            <Card>
                <CardBody>
                    <Bullseye>
                        <Spinner size="xl" />
                    </Bullseye>
                </CardBody>
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <CardBody>
                    <EmptyState>
                        <EmptyStateBody>
                            <strong>{_("Error loading containers")}</strong><br />
                            {error}
                        </EmptyStateBody>
                    </EmptyState>
                </CardBody>
            </Card>
        );
    }

    if (containers.length === 0) {
        return (
            <Card>
                <CardBody>
                    <EmptyState>
                        <EmptyStateBody>
                            <strong>{_("No compose containers found")}</strong><br />
                            {_("No containers from Docker Compose projects are currently running or exist.")}
                        </EmptyStateBody>
                    </EmptyState>
                </CardBody>
            </Card>
        );
    }

    // Group containers by project
    const containersByProject = containers.reduce((acc, container) => {
        if (!acc[container.Project]) {
            acc[container.Project] = [];
        }
        acc[container.Project].push(container);
        return acc;
    }, {} as Record<string, Container[]>);

    const columnTitles = [
        { title: _("Service"), sortable: true },
        { title: _("Container Name"), sortable: true },
        { title: _("Image"), sortable: true },
        { title: _("Status"), sortable: true },
        { title: _("Ports"), sortable: false },
        { title: _("Actions"), sortable: false }
    ];

    return (
        <>
            {Object.entries(containersByProject).map(([projectName, projectContainers]) => (
                <Card key={projectName} id={`compose-containers-${projectName}`}>
                    <CardTitle>{_("Project")}: {projectName}</CardTitle>
                    <CardBody>
                        <ListingTable
                            aria-label={`Containers for project ${projectName}`}
                            columns={columnTitles}
                            rows={projectContainers.map((container) => {
                                const isRunning = container.State.toLowerCase() === 'running';
                                return ({
                                    columns: [
                                        { title: container.Service },
                                        { title: container.Name },
                                        { title: container.Image },
                                        { title: getStatusLabel(container.State) },
                                        { title: container.Ports || '-' },
                                        {
                                            title: (
                                                <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                                                    <FlexItem>
                                                        <Button
                                                            variant={isRunning ? "secondary" : "primary"}
                                                            size="sm"
                                                            icon={isRunning ? <StopIcon /> : <PlayIcon />}
                                                            onClick={() => handleContainerAction(
                                                                container.Name,
                                                                isRunning ? 'stop' : 'start'
                                                            )}
                                                        >
                                                            {isRunning ? _("Stop") : _("Start")}
                                                        </Button>
                                                    </FlexItem>
                                                    {isRunning && (
                                                        <FlexItem>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                icon={<RedoIcon />}
                                                                onClick={() => handleContainerAction(
                                                                    container.Name,
                                                                    'restart'
                                                                )}
                                                            >
                                                                {_("Restart")}
                                                            </Button>
                                                        </FlexItem>
                                                    )}
                                                    <FlexItem>
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            icon={<ListIcon />}
                                                            onClick={() => setLogsContainer(container.Name)}
                                                        >
                                                            {_("Logs")}
                                                        </Button>
                                                    </FlexItem>
                                                </Flex>
                                            )
                                        }
                                    ]
                                });
                            })}
                        />
                    </CardBody>
                </Card>
            ))}
            {logsContainer && (
                <ContainerLogs
                    containerName={logsContainer}
                    isOpen={!!logsContainer}
                    onClose={() => setLogsContainer(null)}
                />
            )}
        </>
    );
};
