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
import {
    Modal,
    ModalHeader,
    ModalBody,
    ModalFooter
} from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { DatabaseIcon } from '@patternfly/react-icons';
import TrashIcon from '@patternfly/react-icons/dist/esm/icons/trash-icon';
import InfoCircleIcon from '@patternfly/react-icons/dist/esm/icons/info-circle-icon';
import BroomIcon from '@patternfly/react-icons/dist/esm/icons/broom-icon';
import { ListingTable } from "cockpit-components-table.jsx";
import { VolumeDetails } from './VolumeDetails';
import { ActionError } from './ActionError';
import { DockerActionButton } from './DockerActionButton';

import { listVolumes, removeVolume, pruneVolumes, type DockerVolume } from '../client';
import { useDockerResource } from '../hooks/useDockerResource';

const _ = cockpit.gettext;

export const VolumeManagement: React.FC = () => {
    const { data: volumes, loading, error, reload } = useDockerResource(
        () => listVolumes(),
        { events: ['volume'], tab: 4 });
    const [actionError, setActionError] = useState<Error | null>(null);
    const [actionInProgress, setActionInProgress] = useState<string | null>(null);
    const [detailsVolume, setDetailsVolume] = useState<DockerVolume | null>(null);
    const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
    const [confirmPrune, setConfirmPrune] = useState(false);

    const shown = React.useMemo(
        () => (volumes ?? []).filter(v => !!v.Labels['com.docker.compose.project']),
        [volumes]);

    const handleRemoveVolume = async (volumeName: string) => {
        setActionInProgress(volumeName);
        try {
            await removeVolume(volumeName, false);
            await reload();
        } catch (err) {
            setActionError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setActionInProgress(null);
        }
    };

    const handlePruneVolumes = async () => {
        setActionInProgress('prune');
        try {
            await pruneVolumes();
            await reload();
        } catch (err) {
            setActionError(err instanceof Error ? err : new Error(String(err)));
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
                            <strong>{_("Error loading volumes")}</strong><br />
                            {error.message}
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

    const rows = shown.map((volume) => {
        const isActionInProgress = !!actionInProgress;
        const project = getProjectLabel(volume.Labels);

        return {
            columns: [
                { title: <strong>{volume.Name}</strong> },
                { title: volume.Driver },
                { title: getScopeLabel(volume.Scope) },
                {
                    title: (
                        <span
                            className="ct-truncate-path"
                            title={volume.Mountpoint}
                        >
                            {volume.Mountpoint}
                        </span>
                    )
                },
                {
                    title: project !== '-'
                        ? <Label color="green">{project}</Label>
                        : <span className="ct-empty-value">-</span>
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
                                    onClick={() => setDetailsVolume(volume)}
                                >
                                    {_("Details")}
                                </Button>
                            </FlexItem>
                            <FlexItem>
                                <DockerActionButton
                                    variant="danger"
                                    size="sm"
                                    icon={<TrashIcon />}
                                    isDisabled={isActionInProgress}
                                    onClick={() => setConfirmRemove(volume.Name)}
                                >
                                    {_("Remove")}
                                </DockerActionButton>
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
                            <DockerActionButton
                                variant="warning"
                                size="sm"
                                icon={<BroomIcon />}
                                isDisabled={!!actionInProgress}
                                onClick={() => setConfirmPrune(true)}
                            >
                                {_("Prune Unused")}
                            </DockerActionButton>
                        </FlexItem>
                    </Flex>
                </CardTitle>
                <CardBody className="contains-list">
                    <ActionError error={actionError} onDismiss={() => setActionError(null)} />
                    {shown.length === 0
                        ? (
                            <EmptyState>
                                <DatabaseIcon />
                                <h4>{_("No volumes found")}</h4>
                                <EmptyStateBody>
                                    {_("There are no Docker volumes used by Compose projects on this system.")}
                                </EmptyStateBody>
                            </EmptyState>
                        )
                        : (
                            <ListingTable
                                variant="compact"
                                gridBreakPoint="grid-md"
                                emptyCaption={_("No volumes")}
                                aria-label={_("Docker Volumes")}
                                columns={columnTitles}
                                rows={rows}
                            />
                        )}
                </CardBody>
            </Card>

            {detailsVolume && (
                <VolumeDetails
                    volume={detailsVolume}
                    isOpen={!!detailsVolume}
                    onClose={() => setDetailsVolume(null)}
                />
            )}

            {confirmRemove && (
                <Modal
                    variant="small"
                    isOpen
                    onClose={() => setConfirmRemove(null)}
                >
                    <ModalHeader title={_("Remove this volume?")} />
                    <ModalBody>
                        <p>{cockpit.format(_("Remove volume $0? This cannot be undone."), confirmRemove)}</p>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="danger" onClick={() => { const n = confirmRemove; setConfirmRemove(null); handleRemoveVolume(n) }}>
                            {_("Remove")}
                        </Button>
                        <Button variant="link" onClick={() => setConfirmRemove(null)}>{_("Cancel")}</Button>
                    </ModalFooter>
                </Modal>
            )}

            {confirmPrune && (
                <Modal
                    variant="small"
                    isOpen
                    onClose={() => setConfirmPrune(false)}
                >
                    <ModalHeader title={_("Remove all unused volumes?")} />
                    <ModalBody>
                        <p>{_("This removes every volume not used by at least one container. This cannot be undone.")}</p>
                        <p>{_("This also removes volumes not shown in this list, because they do not belong to a Compose project.")}</p>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="danger" onClick={() => { setConfirmPrune(false); handlePruneVolumes() }}>
                            {_("Prune")}
                        </Button>
                        <Button variant="link" onClick={() => setConfirmPrune(false)}>{_("Cancel")}</Button>
                    </ModalFooter>
                </Modal>
            )}
        </>
    );
};
