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
import {
    Modal,
    ModalHeader,
    ModalBody,
    ModalFooter
} from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { CubesIcon } from '@patternfly/react-icons';
import PlayIcon from '@patternfly/react-icons/dist/esm/icons/play-icon';
import StopIcon from '@patternfly/react-icons/dist/esm/icons/stop-icon';
import RedoIcon from '@patternfly/react-icons/dist/esm/icons/redo-icon';
import TrashIcon from '@patternfly/react-icons/dist/esm/icons/trash-icon';
import FileCodeIcon from '@patternfly/react-icons/dist/esm/icons/file-code-icon';

import cockpit from 'cockpit';
import { ListingTable } from 'cockpit-components-table.jsx';
import { listProjects, startProject, stopProject, downProject, restartProject, type ComposeProject } from '../client';
import { useDockerResource } from '../hooks/useDockerResource';
import { ActionError } from './ActionError';
import { DockerActionButton } from './DockerActionButton';
import { ComposeFileViewer } from './ComposeFileViewer';

const _ = cockpit.gettext;

export const ComposeProjects: React.FC = () => {
    const { data: projects, loading, error, reload } = useDockerResource(
        () => listProjects(),
        { events: ['container'], tab: 2 });
    const [actionError, setActionError] = useState<Error | null>(null);
    const [actionInProgress, setActionInProgress] = useState<string | null>(null);
    const [viewFileProject, setViewFileProject] = useState<{ name: string; path: string } | null>(null);
    const [confirmDown, setConfirmDown] = useState<string | null>(null);

    const handleProjectAction = async (name: string, action: 'start' | 'stop' | 'restart' | 'down') => {
        setActionInProgress(`${name}-${action}`);
        try {
            if (action === 'start') await startProject(name);
            else if (action === 'stop') await stopProject(name);
            else if (action === 'restart') await restartProject(name);
            else await downProject(name);
            await reload();
        } catch (err) {
            setActionError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setActionInProgress(null);
        }
    };

    const getStatusLabel = (status: string) => {
        const statusLower = status.toLowerCase();
        if (statusLower.includes('running')) {
            return <Label color="green">{status}</Label>;
        } else if (statusLower.includes('exited')) {
            return <Label color="red">{status}</Label>;
        } else if (statusLower.includes('created')) {
            return <Label color="blue">{status}</Label>;
        } else {
            return <Label color="grey">{status}</Label>;
        }
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
                            <strong>{_("Error loading projects")}</strong><br />
                            {error.message}
                        </EmptyStateBody>
                    </EmptyState>
                </CardBody>
            </Card>
        );
    }

    const columnTitles = [
        { title: _("Name"), sortable: true, header: true },
        { title: _("Status"), sortable: true },
        { title: _("Config"), sortable: true },
        { title: "", props: { "aria-label": _("Actions") } }
    ];

    const rows = (projects ?? []).map((project: ComposeProject) => {
        const isRunning = project.Status.toLowerCase().includes('running');
        const isActionInProgress = !!actionInProgress?.startsWith(`${project.Name}-`);

        return {
            columns: [
                { title: <strong>{project.Name}</strong> },
                { title: getStatusLabel(project.Status) },
                { title: project.ConfigFiles },
                {
                    title: (
                        <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                            <FlexItem>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={<FileCodeIcon />}
                                    isDisabled={isActionInProgress}
                                    onClick={() => setViewFileProject({
                                        name: project.Name,
                                        path: (project.ConfigFiles ?? '').split(',')[0],
                                    })}
                                >
                                    {_("View File")}
                                </Button>
                            </FlexItem>
                            <FlexItem>
                                <DockerActionButton
                                    variant={isRunning ? "secondary" : "primary"}
                                    size="sm"
                                    icon={isRunning ? <StopIcon /> : <PlayIcon />}
                                    isDisabled={isActionInProgress}
                                    onClick={() => handleProjectAction(project.Name, isRunning ? 'stop' : 'start')}
                                >
                                    {isRunning ? _("Stop") : _("Start")}
                                </DockerActionButton>
                            </FlexItem>
                            <FlexItem>
                                <DockerActionButton
                                    variant="secondary"
                                    size="sm"
                                    icon={<RedoIcon />}
                                    isDisabled={isActionInProgress}
                                    onClick={() => handleProjectAction(project.Name, 'restart')}
                                >
                                    {_("Restart")}
                                </DockerActionButton>
                            </FlexItem>
                            <FlexItem>
                                <DockerActionButton
                                    variant="danger"
                                    size="sm"
                                    icon={<TrashIcon />}
                                    isDisabled={isActionInProgress}
                                    onClick={() => setConfirmDown(project.Name)}
                                >
                                    {_("Down")}
                                </DockerActionButton>
                            </FlexItem>
                        </Flex>
                    )
                }
            ],
            props: { key: project.Name }
        };
    });

    return (
        <Card id="compose-projects">
            <CardTitle>{_("Docker Compose Projects")}</CardTitle>
            <CardBody className="contains-list">
                <ActionError error={actionError} onDismiss={() => setActionError(null)} />
                {!projects || projects.length === 0
                    ? (
                        <EmptyState>
                            <CubesIcon />
                            <h4>{_("No Docker Compose projects found")}</h4>
                            <EmptyStateBody>
                                {_("There are no Docker Compose projects running on this system.")}
                                <br />
                                {_("Start a project with 'docker compose up -d' to see it here.")}
                            </EmptyStateBody>
                        </EmptyState>
                    )
                    : (
                        <ListingTable
                            variant="compact"
                            gridBreakPoint="grid-md"
                            emptyCaption={_("No Docker Compose projects")}
                            aria-label={_("Docker Compose Projects")}
                            columns={columnTitles}
                            rows={rows}
                        />
                    )}
            </CardBody>

            {viewFileProject && (
                <ComposeFileViewer
                    isOpen={!!viewFileProject}
                    onClose={() => setViewFileProject(null)}
                    projectName={viewFileProject.name}
                    configPath={viewFileProject.path}
                />
            )}

            {confirmDown && (
                <Modal
                    variant="small"
                    isOpen
                    onClose={() => setConfirmDown(null)}
                >
                    <ModalHeader title={_("Remove all containers of this project?")} />
                    <ModalBody>
                        <p>{cockpit.format(_("This removes every container of project $0. Volumes are kept."), confirmDown)}</p>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="danger" onClick={() => { const n = confirmDown; setConfirmDown(null); handleProjectAction(n, 'down') }}>
                            {_("Remove")}
                        </Button>
                        <Button variant="link" onClick={() => setConfirmDown(null)}>{_("Cancel")}</Button>
                    </ModalFooter>
                </Modal>
            )}
        </Card>
    );
};
