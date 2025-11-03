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
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { DatabaseIcon } from '@patternfly/react-icons';
import TrashIcon from '@patternfly/react-icons/dist/esm/icons/trash-icon';
import InfoCircleIcon from '@patternfly/react-icons/dist/esm/icons/info-circle-icon';
import BroomIcon from '@patternfly/react-icons/dist/esm/icons/broom-icon';
import { ListingTable } from "cockpit-components-table.jsx";
import { VolumeDetails } from './VolumeDetails';

import {
    listVolumes,
    removeVolume,
    pruneVolumes,
    type DockerVolume
} from '../docker';

const _ = cockpit.gettext;

export const VolumeManagement: React.FC = () => {
    const [volumes, setVolumes] = useState<DockerVolume[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionInProgress, setActionInProgress] = useState<string | null>(null);
    const [detailsVolume, setDetailsVolume] = useState<string | null>(null);

    const loadVolumes = async () => {
        try {
            setLoading(true);
            setError(null);
            const volumeList = await listVolumes();
            setVolumes(volumeList);
        } catch (err) {
            console.error('Failed to load volumes:', err);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadVolumes();
        // Refresh every 30 seconds
        const interval = setInterval(loadVolumes, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleRemoveVolume = async (volumeName: string) => {
        if (!confirm(_(`Are you sure you want to remove volume "${volumeName}"? This action cannot be undone.`))) {
            return;
        }

        setActionInProgress(volumeName);
        try {
            await removeVolume(volumeName, false);
            await loadVolumes();
        } catch (err) {
            console.error('Failed to remove volume:', err);
            setError(_(`Failed to remove volume: ${err instanceof Error ? err.message : String(err)}`));
        } finally {
            setActionInProgress(null);
        }
    };

    const handlePruneVolumes = async () => {
        if (!confirm(_("Are you sure you want to remove all unused volumes? This action cannot be undone."))) {
            return;
        }

        setActionInProgress('prune');
        try {
            const result = await pruneVolumes(true);
            console.log('Prune result:', result);
            await loadVolumes();
        } catch (err) {
            console.error('Failed to prune volumes:', err);
            setError(_(`Failed to prune volumes: ${err instanceof Error ? err.message : String(err)}`));
        } finally {
            setActionInProgress(null);
        }
    };

    const formatDate = (dateStr: string): string => {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            return date.toLocaleString();
        } catch {
            return dateStr;
        }
    };

    const getProjectLabel = (labels: Record<string, string>): string => {
        return labels['com.docker.compose.project'] || labels['com.docker.volume.project'] || '-';
    };

    const getScopeLabel = (scope: string) => {
        if (scope === 'local') {
            return <Label color="blue">{_("Local")}</Label>;
        } else {
            return <Label color="purple">{scope}</Label>;
        }
    };

    if (loading) {
        return (
            <Card>
                <CardBody>
                    <Spinner size="lg" /> {_("Loading volumes...")}
                </CardBody>
            </Card>
        );
    }

    if (error) {
        return (
            <Alert variant={AlertVariant.danger} title={_("Error loading volumes")}>
                {error}
            </Alert>
        );
    }

    if (volumes.length === 0) {
        return (
            <Card>
                <CardBody>
                    <EmptyState>
                        <DatabaseIcon />
                        <h4>{_("No volumes found")}</h4>
                        <EmptyStateBody>
                            {_("There are no Docker volumes on this system.")}
                        </EmptyStateBody>
                    </EmptyState>
                </CardBody>
            </Card>
        );
    }

    const columnTitles = [
        { title: _("Name"), sortable: true, header: true },
        { title: _("Driver"), sortable: true },
        { title: _("Scope"), sortable: true },
        { title: _("Mountpoint"), sortable: true },
        { title: _("Project"), sortable: true },
        { title: _("Created"), sortable: true },
        { title: "", props: { "aria-label": _("Actions") } }
    ];

    const rows = volumes.map((volume) => {
        const isActionInProgress = actionInProgress === volume.Name;
        const project = getProjectLabel(volume.Labels);

        return {
            columns: [
                { title: <strong>{volume.Name}</strong> },
                { title: volume.Driver },
                { title: getScopeLabel(volume.Scope) },
                {
                    title: (
                        <span
                            style={{
                                fontFamily: 'monospace',
                                fontSize: '0.875rem',
                                maxWidth: '300px',
                                display: 'inline-block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}
                            title={volume.Mountpoint}
                        >
                            {volume.Mountpoint}
                        </span>
                    )
                },
                {
                    title: project !== '-'
                        ? <Label color="green">{project}</Label>
                        : <span style={{ color: 'var(--pf-v6-global--Color--200)' }}>-</span>
                },
                { title: formatDate(volume.CreatedAt) },
                {
                    title: (
                        <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                            <FlexItem>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={<InfoCircleIcon />}
                                    isDisabled={isActionInProgress}
                                    onClick={() => setDetailsVolume(volume.Name)}
                                >
                                    {_("Details")}
                                </Button>
                            </FlexItem>
                            <FlexItem>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    icon={<TrashIcon />}
                                    isDisabled={isActionInProgress}
                                    onClick={() => handleRemoveVolume(volume.Name)}
                                >
                                    {_("Remove")}
                                </Button>
                            </FlexItem>
                        </Flex>
                    )
                }
            ],
            props: { key: volume.Name }
        };
    });

    return (
        <>
            <Card id="volume-management">
                <CardTitle>
                    <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }}>
                        <FlexItem>
                            {_("Docker Volumes")}
                        </FlexItem>
                        <FlexItem>
                            <Button
                                variant="warning"
                                size="sm"
                                icon={<BroomIcon />}
                                isDisabled={!!actionInProgress}
                                onClick={handlePruneVolumes}
                            >
                                {_("Prune Unused")}
                            </Button>
                        </FlexItem>
                    </Flex>
                </CardTitle>
                <CardBody className="contains-list">
                    <ListingTable
                        variant="compact"
                        gridBreakPoint="grid-md"
                        emptyCaption={_("No volumes")}
                        aria-label={_("Docker Volumes")}
                        columns={columnTitles}
                        rows={rows}
                    />
                </CardBody>
            </Card>

            {detailsVolume && (
                <VolumeDetails
                    volumeName={detailsVolume}
                    isOpen={!!detailsVolume}
                    onClose={() => setDetailsVolume(null)}
                />
            )}
        </>
    );
};
