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
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { InputGroup, InputGroupItem } from "@patternfly/react-core/dist/esm/components/InputGroup/index.js";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";
import DownloadIcon from '@patternfly/react-icons/dist/esm/icons/download-icon';
import TrashIcon from '@patternfly/react-icons/dist/esm/icons/trash-icon';
import { ListingTable } from "cockpit-components-table.jsx";
import { listImages, pullImage, removeImage } from '../client';
import { useDockerResource } from '../hooks/useDockerResource';
import { ActionError } from './ActionError';
import { DockerActionButton } from './DockerActionButton';

const _ = cockpit.gettext;

export const ComposeImages: React.FC = () => {
    const { data: images, loading, error, reload } = useDockerResource(
        () => listImages(),
        { events: ['image', 'container'], tab: 3 });
    const [actionError, setActionError] = useState<Error | null>(null);
    const [pullImageInput, setPullImageInput] = useState('');
    const [isPulling, setIsPulling] = useState(false);
    const [isCleaning, setIsCleaning] = useState(false);

    const shown = React.useMemo(
        () => (images ?? []).filter(img => img.UsedByCompose),
        [images]);

    const handlePullNewImage = async () => {
        if (!pullImageInput.trim()) {
            return;
        }

        try {
            setIsPulling(true);
            await pullImage(pullImageInput.trim());
            setPullImageInput(''); // Clear input after successful pull
            await reload();
        } catch (err) {
            setActionError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setIsPulling(false);
        }
    };

    const handleCleanupUnusedImages = async () => {
        const unusedImages = (images ?? []).filter(img => !img.UsedByCompose);
        if (unusedImages.length === 0) {
            return;
        }

        setIsCleaning(true);
        // Jedes Image einzeln versuchen: ein einzelner haengender Container
        // (docker rmi schlaegt fehl, solange irgendein Container das Image
        // noch referenziert) darf nicht den ganzen Aufraeumlauf abbrechen --
        // die uebrigen Images sind davon unabhaengig entfernbar. Erst nach
        // dem vollstaendigen Durchlauf wird neu geladen und ein
        // gesammelter Fehler gemeldet, falls welche uebrig blieben.
        const failed: string[] = [];
        for (const image of unusedImages) {
            try {
                await removeImage(image.ID);
            } catch (err) {
                failed.push(image.ID);
                console.warn('Image konnte nicht entfernt werden:', image.ID, err);
            }
        }
        await reload();
        setIsCleaning(false);
        if (failed.length > 0) {
            setActionError(new Error(cockpit.format(
                cockpit.ngettext(
                    "$0 image could not be removed: $1",
                    "$0 images could not be removed: $1",
                    failed.length),
                failed.length, failed.join(', '))));
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
                            <strong>{_("Error loading images")}</strong><br />
                            {error.message}
                        </EmptyStateBody>
                    </EmptyState>
                </CardBody>
            </Card>
        );
    }

    const columnTitles = [
        { title: _("Repository"), sortable: true },
        { title: _("Tag"), sortable: true },
        { title: _("Image ID"), sortable: true },
        { title: _("Size"), sortable: true },
        { title: _("Used By"), sortable: false }
    ];

    const unusedCount = (images ?? []).filter(img => !img.UsedByCompose).length;

    return (
        <Card id="compose-images">
            <CardTitle>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>
                        <InputGroup>
                            <InputGroupItem isFill>
                                <TextInput
                                    type="text"
                                    placeholder={_("Pull new image (e.g., nginx:latest)")}
                                    value={pullImageInput}
                                    onChange={(_event, value) => setPullImageInput(value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handlePullNewImage();
                                        }
                                    }}
                                    isDisabled={isPulling || isCleaning}
                                />
                            </InputGroupItem>
                            <InputGroupItem>
                                <DockerActionButton
                                    variant="primary"
                                    icon={<DownloadIcon />}
                                    onClick={handlePullNewImage}
                                    isDisabled={isPulling || isCleaning || !pullImageInput.trim()}
                                >
                                    {isPulling ? _("Pulling...") : _("Pull Image")}
                                </DockerActionButton>
                            </InputGroupItem>
                        </InputGroup>
                    </FlexItem>
                    {unusedCount > 0 && (
                        <FlexItem>
                            <DockerActionButton
                                variant="danger"
                                icon={<TrashIcon />}
                                onClick={handleCleanupUnusedImages}
                                isDisabled={isPulling || isCleaning}
                            >
                                {isCleaning
                                    ? _("Cleaning up...")
                                    : cockpit.format(cockpit.ngettext("Cleanup $0 unused image", "Cleanup $0 unused images", unusedCount), unusedCount)}
                            </DockerActionButton>
                        </FlexItem>
                    )}
                </Flex>
            </CardTitle>
            <CardBody>
                <ActionError error={actionError} onDismiss={() => setActionError(null)} />
                {shown.length === 0
                    ? (
                        <EmptyState>
                            <EmptyStateBody>
                                <strong>{_("No compose images found")}</strong><br />
                                {_("No images used by Docker Compose projects are currently available.")}
                            </EmptyStateBody>
                        </EmptyState>
                    )
                    : (
                        <ListingTable
                            aria-label="Docker images"
                            columns={columnTitles}
                            rows={shown.map((image) => ({
                                columns: [
                                    { title: image.Repository },
                                    { title: image.Tag },
                                    { title: image.ID.substring(0, 12) },
                                    { title: image.Size },
                                    {
                                        title: (
                                            <Flex spaceItems={{ default: 'spaceItemsXs' }}>
                                                {image.ComposeProjects.map(project => (
                                                    <FlexItem key={project}>
                                                        <Label color="blue">{project}</Label>
                                                    </FlexItem>
                                                ))}
                                            </Flex>
                                        )
                                    }
                                ]
                            }))}
                        />
                    )}
            </CardBody>
        </Card>
    );
};
