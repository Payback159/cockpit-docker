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

import React, { useEffect, useState } from 'react';
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
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { CubesIcon } from '@patternfly/react-icons';
import PlayIcon from '@patternfly/react-icons/dist/esm/icons/play-icon';
import StopIcon from '@patternfly/react-icons/dist/esm/icons/stop-icon';
import RedoIcon from '@patternfly/react-icons/dist/esm/icons/redo-icon';
import TrashIcon from '@patternfly/react-icons/dist/esm/icons/trash-icon';
import FileCodeIcon from '@patternfly/react-icons/dist/esm/icons/file-code-icon';

import cockpit from 'cockpit';
import { ListingTable } from 'cockpit-components-table.jsx';
import {
    listComposeProjects,
    startComposeProject,
    stopComposeProject,
    downComposeProject,
    restartComposeProject,
    type ComposeProject
} from '../docker';
import { ComposeFileViewer } from './ComposeFileViewer';

const _ = cockpit.gettext;

interface ProjectWithServices {
    project: ComposeProject;
}

export const ComposeProjects: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [projects, setProjects] = useState<Map<string, ProjectWithServices>>(new Map());
    const [actionInProgress, setActionInProgress] = useState<string | null>(null);
    const [viewFileProject, setViewFileProject] = useState<{ name: string; path: string } | null>(null);

    const loadProjects = async () => {
        try {
            setLoading(true);
            setError(null);
            const projectList = await listComposeProjects();

            const projectMap = new Map<string, ProjectWithServices>();
            projectList.forEach(project => {
                projectMap.set(project.Name, {
                    project
                });
            });

            setProjects(projectMap);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const handleProjectAction = async (projectName: string, configPath: string, action: 'start' | 'stop' | 'restart' | 'down') => {
        console.log('handleProjectAction called:', { projectName, configPath, action });
        setActionInProgress(`${projectName}-${action}`);
        try {
            switch (action) {
            case 'start':
                console.log('Calling startComposeProject with:', projectName, configPath);
                await startComposeProject(projectName, configPath);
                break;
            case 'stop':
                await stopComposeProject(projectName, configPath);
                break;
            case 'restart':
                await restartComposeProject(projectName, configPath);
                break;
            case 'down':
                if (confirm(_("Are you sure you want to remove all containers for this project?"))) {
                    await downComposeProject(projectName, configPath);
                }
                break;
            }
            // Reload projects after action
            await loadProjects();
        } catch (err) {
            console.error(`Failed to ${action} project ${projectName}:`, err);
            setError(_(`Failed to ${action} project: ${err instanceof Error ? err.message : String(err)}`));
        } finally {
            setActionInProgress(null);
        }
    };

    useEffect(() => {
        loadProjects();
        // Refresh every 30 seconds
        const interval = setInterval(loadProjects, 30000);
        return () => clearInterval(interval);
    }, []);

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
                    <Spinner size="lg" /> {_("Loading Docker Compose projects...")}
                </CardBody>
            </Card>
        );
    }

    if (error) {
        return (
            <Alert variant={AlertVariant.danger} title={_("Error loading projects")}>
                {error}
            </Alert>
        );
    }

    if (projects.size === 0) {
        return (
            <Card>
                <CardBody>
                    <EmptyState>
                        <CubesIcon />
                        <h4>{_("No Docker Compose projects found")}</h4>
                        <EmptyStateBody>
                            {_("There are no Docker Compose projects running on this system.")}
                            <br />
                            {_("Start a project with 'docker compose up -d' to see it here.")}
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

    const rows = Array.from(projects.values()).map(({ project }) => {
        const isRunning = project.Status.toLowerCase().includes('running');
        const isActionInProgress = !!actionInProgress?.startsWith(project.Name);

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
                                    onClick={() => setViewFileProject({ name: project.Name, path: project.ConfigFiles })}
                                >
                                    {_("View File")}
                                </Button>
                            </FlexItem>
                            <FlexItem>
                                <Button
                                    variant={isRunning ? "secondary" : "primary"}
                                    size="sm"
                                    icon={isRunning ? <StopIcon /> : <PlayIcon />}
                                    isDisabled={isActionInProgress}
                                    onClick={() => handleProjectAction(project.Name, project.ConfigFiles, isRunning ? 'stop' : 'start')}
                                >
                                    {isRunning ? _("Stop") : _("Start")}
                                </Button>
                            </FlexItem>
                            <FlexItem>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={<RedoIcon />}
                                    isDisabled={isActionInProgress}
                                    onClick={() => handleProjectAction(project.Name, project.ConfigFiles, 'restart')}
                                >
                                    {_("Restart")}
                                </Button>
                            </FlexItem>
                            <FlexItem>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    icon={<TrashIcon />}
                                    isDisabled={isActionInProgress}
                                    onClick={() => handleProjectAction(project.Name, project.ConfigFiles, 'down')}
                                >
                                    {_("Down")}
                                </Button>
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
                <ListingTable
                    variant="compact"
                    gridBreakPoint="grid-md"
                    emptyCaption={_("No Docker Compose projects")}
                    aria-label={_("Docker Compose Projects")}
                    columns={columnTitles}
                    rows={rows}
                />
            </CardBody>

            {viewFileProject && (
                <ComposeFileViewer
                    isOpen={!!viewFileProject}
                    onClose={() => setViewFileProject(null)}
                    projectName={viewFileProject.name}
                    configPath={viewFileProject.path}
                />
            )}
        </Card>
    );
};
