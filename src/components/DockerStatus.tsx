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
    Alert,
    AlertVariant
} from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import {
    Card,
    CardBody,
    CardTitle
} from "@patternfly/react-core/dist/esm/components/Card/index.js";
import {
    DescriptionList,
    DescriptionListGroup,
    DescriptionListTerm,
    DescriptionListDescription
} from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import {
    Label
} from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";
import { CheckCircleIcon, ExclamationCircleIcon } from '@patternfly/react-icons';

import cockpit from 'cockpit';
import { useDockerContext } from '../DockerProvider';
import { DockerResources } from './DockerResources';

const _ = cockpit.gettext;

export const DockerStatus: React.FC = () => {
    const { systemInfo, ready } = useDockerContext();

    if (!ready) {
        return (
            <Card>
                <CardBody>
                    <Spinner size="lg" /> {_("Checking Docker installation...")}
                </CardBody>
            </Card>
        );
    }

    if (!systemInfo) {
        return null;
    }

    const dockerInstalled = systemInfo.docker.installed;
    const composeInstalled = systemInfo.compose.installed;
    const composeLegacyV1 = systemInfo.compose.isLegacyV1;

    return (
        <>
            {dockerInstalled && <DockerResources />}

            <Card id="docker-system-status">
                <CardTitle>{_("Docker System Status")}</CardTitle>
                <CardBody>
                    <DescriptionList isHorizontal>
                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Docker Engine")}</DescriptionListTerm>
                            <DescriptionListDescription>
                                {dockerInstalled
                                    ? (
                                        <>
                                            <Label color="green" icon={<CheckCircleIcon />}>
                                                {_("Installed")}
                                            </Label>
                                            {systemInfo.docker.version && (
                                                <span style={{ marginLeft: '1rem' }}>
                                                    {_("Version")}: {systemInfo.docker.version}
                                                </span>
                                            )}
                                        </>
                                    )
                                    : (
                                        <>
                                            <Label color="red" icon={<ExclamationCircleIcon />}>
                                                {_("Not installed")}
                                            </Label>
                                            {systemInfo.docker.error && (
                                                <Alert
                                                    variant={AlertVariant.warning}
                                                    isInline
                                                    title={_("Docker not found")}
                                                    style={{ marginTop: '0.5rem' }}
                                                >
                                                    {systemInfo.docker.error}
                                                </Alert>
                                            )}
                                        </>
                                    )}
                            </DescriptionListDescription>
                        </DescriptionListGroup>

                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Docker Compose")}</DescriptionListTerm>
                            <DescriptionListDescription>
                                {composeInstalled
                                    ? (
                                        <>
                                            <Label color="green" icon={<CheckCircleIcon />}>
                                                {_("Installed")}
                                            </Label>
                                            {systemInfo.compose.version && (
                                                <span style={{ marginLeft: '1rem' }}>
                                                    {_("Version")}: {systemInfo.compose.version}
                                                </span>
                                            )}
                                            {systemInfo.compose.isPlugin && (
                                                <Label color="blue" style={{ marginLeft: '0.5rem' }}>
                                                    {_("Plugin")}
                                                </Label>
                                            )}
                                        </>
                                    )
                                    : composeLegacyV1
                                        ? (
                                            <>
                                                <Label color="orange" icon={<ExclamationCircleIcon />}>
                                                    {_("Compose v1 found")}
                                                </Label>
                                                <Alert
                                                    variant={AlertVariant.warning}
                                                    isInline
                                                    title={_("Docker Compose v1 is not supported")}
                                                    style={{ marginTop: '0.5rem' }}
                                                >
                                                    {cockpit.format(
                                                        _("Found the legacy 'docker-compose'$0. This module requires the Docker Compose v2 plugin."),
                                                        systemInfo.compose.version ? ` (${systemInfo.compose.version})` : '')}
                                                </Alert>
                                            </>
                                        )
                                        : (
                                            <>
                                                <Label color="red" icon={<ExclamationCircleIcon />}>
                                                    {_("Not installed")}
                                                </Label>
                                                {systemInfo.compose.error && (
                                                    <Alert
                                                        variant={AlertVariant.warning}
                                                        isInline
                                                        title={_("Docker Compose not found")}
                                                        style={{ marginTop: '0.5rem' }}
                                                    >
                                                        {systemInfo.compose.error}
                                                    </Alert>
                                                )}
                                            </>
                                        )}
                            </DescriptionListDescription>
                        </DescriptionListGroup>
                    </DescriptionList>

                    {!dockerInstalled && (
                        <Alert
                            variant={AlertVariant.info}
                            isInline
                            title={_("Installation required")}
                            style={{ marginTop: '1rem' }}
                        >
                            {_("Docker needs to be installed on this system to use this module. Please install Docker Engine and Docker Compose plugin.")}
                        </Alert>
                    )}
                </CardBody>
            </Card>
        </>
    );
};
