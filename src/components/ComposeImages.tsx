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
import { InputGroup, InputGroupItem } from "@patternfly/react-core/dist/esm/components/InputGroup/index.js";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";
import DownloadIcon from '@patternfly/react-icons/dist/esm/icons/download-icon';
import TrashIcon from '@patternfly/react-icons/dist/esm/icons/trash-icon';
import { ListingTable } from "cockpit-components-table.jsx";

const _ = cockpit.gettext;

interface DockerImage {
    ID: string;
    Repository: string;
    Tag: string;
    Size: string;
    CreatedAt: string;
    UsedByCompose: boolean;
    ComposeProjects: string[];
}

interface ComposeService {
    Project: string;
    Service: string;
    Image: string;
}

export const ComposeImages: React.FC = () => {
    const [images, setImages] = useState<DockerImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pullImageInput, setPullImageInput] = useState('');
    const [isPulling, setIsPulling] = useState(false);
    const [isCleaning, setIsCleaning] = useState(false);

    const loadImages = async () => {
        try {
            setLoading(true);
            setError(null);

            // Get all images
            const imagesResult = await cockpit.spawn(
                ['docker', 'images', '--format', 'json'],
                { err: 'message' }
            );

            // Get compose containers to determine which images are used by compose
            const containersResult = await cockpit.spawn(
                ['docker', 'ps', '-a', '--filter', 'label=com.docker.compose.project', '--format', 'json'],
                { err: 'message' }
            );

            const imageLines = imagesResult.trim().split('\n')
                    .filter(line => line);
            const parsedImages: DockerImage[] = imageLines.map(line => {
                const img = JSON.parse(line);
                return {
                    ID: img.ID,
                    Repository: img.Repository,
                    Tag: img.Tag,
                    Size: img.Size,
                    CreatedAt: img.CreatedAt,
                    UsedByCompose: false,
                    ComposeProjects: []
                };
            });

            // Parse compose containers
            if (containersResult && containersResult.trim()) {
                const containerLines = containersResult.trim().split('\n');
                const composeServices: ComposeService[] = containerLines.map(line => {
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
                        Project: labels['com.docker.compose.project'] || 'unknown',
                        Service: labels['com.docker.compose.service'] || 'unknown',
                        Image: container.Image
                    };
                });

                // Mark images used by compose
                parsedImages.forEach(image => {
                    const imageFullName = `${image.Repository}:${image.Tag}`;
                    const usingServices = composeServices.filter(
                        svc => svc.Image === imageFullName || svc.Image === image.Repository
                    );

                    if (usingServices.length > 0) {
                        image.UsedByCompose = true;
                        image.ComposeProjects = [...new Set(usingServices.map(svc => svc.Project))];
                    }
                });
            }

            // Sort: compose images first, then by repository
            parsedImages.sort((a, b) => {
                if (a.UsedByCompose && !b.UsedByCompose) return -1;
                if (!a.UsedByCompose && b.UsedByCompose) return 1;
                return a.Repository.localeCompare(b.Repository);
            });

            setImages(parsedImages);
        } catch (err) {
            console.error('Failed to load images:', err);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadImages();
        const interval = setInterval(loadImages, 30000); // Refresh every 30 seconds
        return () => clearInterval(interval);
    }, []);

    const handlePullNewImage = async () => {
        if (!pullImageInput.trim()) {
            return;
        }

        try {
            setIsPulling(true);
            setError(null);
            await cockpit.spawn(['docker', 'pull', pullImageInput.trim()], { err: 'message' });
            setPullImageInput(''); // Clear input after successful pull
            await loadImages(); // Reload after pull
        } catch (err) {
            console.error('Failed to pull image:', err);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsPulling(false);
        }
    };

    const handleCleanupUnusedImages = async () => {
        try {
            setIsCleaning(true);
            setError(null);

            // Get all unused images
            const unusedImages = images.filter(img => !img.UsedByCompose);

            if (unusedImages.length === 0) {
                return;
            }

            // Remove each unused image
            for (const image of unusedImages) {
                try {
                    await cockpit.spawn(['docker', 'rmi', image.ID], { err: 'message' });
                } catch (err) {
                    console.error(`Failed to remove image ${image.ID}:`, err);
                    // Continue with other images even if one fails
                }
            }

            await loadImages(); // Reload after cleanup
        } catch (err) {
            console.error('Failed to cleanup images:', err);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsCleaning(false);
        }
    };

    const handleRemoveImage = async (imageId: string) => {
        try {
            await cockpit.spawn(['docker', 'rmi', imageId], { err: 'message' });
            await loadImages(); // Reload after removal
        } catch (err) {
            console.error('Failed to remove image:', err);
            setError(err instanceof Error ? err.message : String(err));
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
                            {error}
                        </EmptyStateBody>
                    </EmptyState>
                </CardBody>
            </Card>
        );
    }

    if (images.length === 0) {
        return (
            <Card>
                <CardBody>
                    <EmptyState>
                        <EmptyStateBody>
                            <strong>{_("No images found")}</strong><br />
                            {_("No Docker images are available on this system.")}
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
        { title: _("Used By"), sortable: false },
        { title: _("Actions"), sortable: false }
    ];

    const unusedCount = images.filter(img => !img.UsedByCompose).length;

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
                                <Button
                                    variant="primary"
                                    icon={<DownloadIcon />}
                                    onClick={handlePullNewImage}
                                    isLoading={isPulling}
                                    isDisabled={isPulling || isCleaning || !pullImageInput.trim()}
                                >
                                    {isPulling ? _("Pulling...") : _("Pull Image")}
                                </Button>
                            </InputGroupItem>
                        </InputGroup>
                    </FlexItem>
                    {unusedCount > 0 && (
                        <FlexItem>
                            <Button
                                variant="danger"
                                icon={<TrashIcon />}
                                onClick={handleCleanupUnusedImages}
                                isLoading={isCleaning}
                                isDisabled={isPulling || isCleaning}
                            >
                                {isCleaning ? _("Cleaning up...") : _(`Cleanup ${unusedCount} unused image${unusedCount > 1 ? 's' : ''}`)}
                            </Button>
                        </FlexItem>
                    )}
                </Flex>
            </CardTitle>
            <CardBody>
                <ListingTable
                    aria-label="Docker images"
                    columns={columnTitles}
                    rows={images.map((image) => ({
                        columns: [
                            { title: image.Repository },
                            { title: image.Tag },
                            { title: image.ID.substring(0, 12) },
                            { title: image.Size },
                            {
                                title: image.UsedByCompose
                                    ? (
                                        <Flex spaceItems={{ default: 'spaceItemsXs' }}>
                                            {image.ComposeProjects.map(project => (
                                                <FlexItem key={project}>
                                                    <Label color="blue">{project}</Label>
                                                </FlexItem>
                                            ))}
                                        </Flex>
                                    )
                                    : <Label color="grey">{_("Unused")}</Label>
                            },
                            {
                                title: !image.UsedByCompose
                                    ? (
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            icon={<TrashIcon />}
                                            onClick={() => handleRemoveImage(image.ID)}
                                            isDisabled={isPulling || isCleaning}
                                        >
                                            {_("Remove")}
                                        </Button>
                                    )
                                    : null
                            }
                        ]
                    }))}
                />
            </CardBody>
        </Card>
    );
};
