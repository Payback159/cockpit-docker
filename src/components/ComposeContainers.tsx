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

import React, { useState } from 'react';
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
import { listContainers, startContainer, stopContainer, restartContainer, type ContainerSummary } from '../client';
import { useDockerResource } from '../hooks/useDockerResource';
import { ActionError } from './ActionError';
import { DockerActionButton } from './DockerActionButton';

const _ = cockpit.gettext;

export const ComposeContainers: React.FC = () => {
    const { data: containers, loading, error, reload } = useDockerResource(
        () => listContainers({ composeOnly: true }),
        { events: ['container'], tab: 1 });
    const [actionError, setActionError] = useState<Error | null>(null);
    const [logsContainer, setLogsContainer] = useState<string | null>(null);

    const handleContainerAction = async (name: string, action: 'start' | 'stop' | 'restart') => {
        try {
            if (action === 'start')
                await startContainer(name);
            else if (action === 'stop')
                await stopContainer(name);
            else
                await restartContainer(name);
            await reload();
        } catch (err) {
            setActionError(err instanceof Error ? err : new Error(String(err)));
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
                            {error.message}
                        </EmptyStateBody>
                    </EmptyState>
                </CardBody>
            </Card>
        );
    }

    if (!containers || containers.length === 0) {
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
    }, {} as Record<string, ContainerSummary[]>);

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
            <ActionError error={actionError} onDismiss={() => setActionError(null)} />
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
                                                        <DockerActionButton
                                                            variant={isRunning ? "secondary" : "primary"}
                                                            size="sm"
                                                            icon={isRunning ? <StopIcon /> : <PlayIcon />}
                                                            onClick={() => handleContainerAction(
                                                                container.Name,
                                                                isRunning ? 'stop' : 'start'
                                                            )}
                                                        >
                                                            {isRunning ? _("Stop") : _("Start")}
                                                        </DockerActionButton>
                                                    </FlexItem>
                                                    {isRunning && (
                                                        <FlexItem>
                                                            <DockerActionButton
                                                                variant="secondary"
                                                                size="sm"
                                                                icon={<RedoIcon />}
                                                                onClick={() => handleContainerAction(
                                                                    container.Name,
                                                                    'restart'
                                                                )}
                                                            >
                                                                {_("Restart")}
                                                            </DockerActionButton>
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
