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

import React from 'react';
import {
    Modal,
    ModalHeader,
    ModalBody,
    ModalFooter
} from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import {
    DescriptionList,
    DescriptionListGroup,
    DescriptionListTerm,
    DescriptionListDescription
} from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";

import cockpit from 'cockpit';
import type { DockerVolume } from '../client';

const _ = cockpit.gettext;

interface VolumeDetailsProps {
    volume: DockerVolume;
    isOpen: boolean;
    onClose: () => void;
}

export const VolumeDetails: React.FC<VolumeDetailsProps> = ({
    volume,
    isOpen,
    onClose
}) => {
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
            isOpen={isOpen}
            onClose={onClose}
            width="60%"
        >
            <ModalHeader title={cockpit.format(_("Volume details: $0"), volume.Name)} />
            <ModalBody>
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
                            <code className="ct-monospace-sm">{volume.Mountpoint}</code>
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
                                <div className="ct-label-row">
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
                                <div className="ct-label-row">
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
            </ModalBody>

            <ModalFooter>
                <Button variant="primary" onClick={onClose}>
                    {_("Close")}
                </Button>
            </ModalFooter>
        </Modal>
    );
};
