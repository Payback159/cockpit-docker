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
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import {
    DescriptionList,
    DescriptionListGroup,
    DescriptionListTerm,
    DescriptionListDescription
} from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";
import {
    Alert,
    AlertVariant
} from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";

import cockpit from 'cockpit';
import { inspectVolume, type DockerVolume } from '../docker';

const _ = cockpit.gettext;

interface VolumeDetailsProps {
    volumeName: string;
    isOpen: boolean;
    onClose: () => void;
}

export const VolumeDetails: React.FC<VolumeDetailsProps> = ({
    volumeName,
    isOpen,
    onClose
}) => {
    const [volume, setVolume] = useState<DockerVolume | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setVolume(null);
            setError(null);
            return;
        }

        const loadDetails = async () => {
            setLoading(true);
            setError(null);
            try {
                const details = await inspectVolume(volumeName);
                setVolume(details);
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        };

        loadDetails();
    }, [isOpen, volumeName]);

    const formatDate = (dateStr: string): string => {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            return date.toLocaleString();
        } catch {
            return dateStr;
        }
    };

    return (
        <Modal
            title={_(`Volume Details: ${volumeName}`)}
            isOpen={isOpen}
            onClose={onClose}
            width="60%"
        >
            {loading && (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <Spinner size="lg" /> {_("Loading volume details...")}
                </div>
            )}

            {error && (
                <Alert variant={AlertVariant.danger} title={_("Error loading volume details")} isInline>
                    {error}
                </Alert>
            )}

            {!loading && !error && volume && (
                <>
                    <div
                        style={{
                            marginBottom: '1rem',
                            padding: '1rem',
                            background: 'var(--pf-v6-global--BackgroundColor--100)',
                            borderRadius: '8px',
                            border: '1px solid var(--pf-v6-global--BorderColor--100)'
                        }}
                    >
                        <DescriptionList isHorizontal>
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Name")}</DescriptionListTerm>
                                <DescriptionListDescription>
                                    <strong>{volume.Name}</strong>
                                </DescriptionListDescription>
                            </DescriptionListGroup>

                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Driver")}</DescriptionListTerm>
                                <DescriptionListDescription>
                                    <Label color="blue">{volume.Driver}</Label>
                                </DescriptionListDescription>
                            </DescriptionListGroup>

                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Scope")}</DescriptionListTerm>
                                <DescriptionListDescription>
                                    <Label color="purple">{volume.Scope}</Label>
                                </DescriptionListDescription>
                            </DescriptionListGroup>

                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Mountpoint")}</DescriptionListTerm>
                                <DescriptionListDescription>
                                    <code style={{ fontSize: '0.875rem' }}>{volume.Mountpoint}</code>
                                </DescriptionListDescription>
                            </DescriptionListGroup>

                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Created")}</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {formatDate(volume.CreatedAt)}
                                </DescriptionListDescription>
                            </DescriptionListGroup>

                            {volume.Labels && Object.keys(volume.Labels).length > 0 && (
                                <DescriptionListGroup>
                                    <DescriptionListTerm>{_("Labels")}</DescriptionListTerm>
                                    <DescriptionListDescription>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {Object.entries(volume.Labels).map(([key, value]) => (
                                                <Label key={key} color="grey">
                                                    {key}: {value}
                                                </Label>
                                            ))}
                                        </div>
                                    </DescriptionListDescription>
                                </DescriptionListGroup>
                            )}

                            {volume.Options && Object.keys(volume.Options).length > 0 && (
                                <DescriptionListGroup>
                                    <DescriptionListTerm>{_("Options")}</DescriptionListTerm>
                                    <DescriptionListDescription>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {Object.entries(volume.Options).map(([key, value]) => (
                                                <Label key={key} color="orange">
                                                    {key}: {value}
                                                </Label>
                                            ))}
                                        </div>
                                    </DescriptionListDescription>
                                </DescriptionListGroup>
                            )}
                        </DescriptionList>
                    </div>

                    {/* Footer mit Button */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            padding: '1rem',
                            borderTop: '1px solid var(--pf-v6-global--BorderColor--100)'
                        }}
                    >
                        <Button variant="primary" onClick={onClose}>
                            {_("Close")}
                        </Button>
                    </div>
                </>
            )}
        </Modal>
    );
};
