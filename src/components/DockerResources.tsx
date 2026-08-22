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
import {
    Flex,
    FlexItem
} from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import {
    CubeIcon,
    ImageIcon,
    DatabaseIcon,
    NetworkIcon
} from '@patternfly/react-icons';

import cockpit from 'cockpit';
import { getInfo, countNetworks, countVolumes } from '../client';
import { useDockerResource } from '../hooks/useDockerResource';

const _ = cockpit.gettext;

interface ResourceStats {
    containers: {
        total: number;
        running: number;
        stopped: number;
        paused: number;
    };
    images: number;
    volumes: number;
    networks: number;
}

async function loadStats(): Promise<ResourceStats> {
    // Counts only: the overview shows numbers, not details. A listVolumes()
    // here would be an extra `volume inspect` over ALL volumes whose payload
    // would be discarded right away.
    const [info, networks, volumes] = await Promise.all([
        getInfo(),
        countNetworks(),
        countVolumes(),
    ]);

    return {
        containers: {
            total: info.Containers,
            running: info.ContainersRunning,
            stopped: info.ContainersStopped,
            paused: info.ContainersPaused,
        },
        images: info.Images,
        volumes,
        networks,
    };
}

const ResourceCard = ({ icon, title, count, details }: {
    icon: React.ReactNode;
    title: string;
    count: number;
    details?: string;
}) => (
    <Card isCompact className="ct-resource-tile">
        <CardBody>
            <Flex
                direction={{ default: 'column' }}
                spaceItems={{ default: 'spaceItemsSm' }}
                justifyContent={{ default: 'justifyContentSpaceBetween' }}
                flexWrap={{ default: 'nowrap' }}
                className="ct-resource-tile__stack"
            >
                <Flex
                    alignItems={{ default: 'alignItemsCenter' }}
                    spaceItems={{ default: 'spaceItemsSm' }}
                    flexWrap={{ default: 'nowrap' }}
                >
                    <FlexItem className="ct-resource-tile__icon">{icon}</FlexItem>
                    <FlexItem className="ct-resource-tile__label">{title}</FlexItem>
                </Flex>

                <FlexItem>
                    <div className="ct-resource-tile__count">{count}</div>
                    {details && <div className="ct-resource-tile__details">{details}</div>}
                </FlexItem>
            </Flex>
        </CardBody>
    </Card>
);

export const DockerResources: React.FC = () => {
    const { data: stats, loading, error } = useDockerResource(
        () => loadStats(),
        { events: ['container', 'image', 'volume', 'network'], tab: 0 });

    if (loading) {
        return (
            <Card>
                <CardBody>
                    <Bullseye>
                        <Spinner size="lg" />
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
                            <strong>{_("Error loading resource overview")}</strong><br />
                            {error.message}
                        </EmptyStateBody>
                    </EmptyState>
                </CardBody>
            </Card>
        );
    }

    if (!stats) {
        return null;
    }

    return (
        <Card>
            <CardTitle>{_("Resources Overview")}</CardTitle>
            <CardBody>
                {/* PatternFly's Flex aligns on the baseline by default; the
                    tiles have to stretch so a tile with a details line does
                    not make its neighbours shorter. */}
                <Flex
                    spaceItems={{ default: 'spaceItemsSm' }}
                    alignItems={{ default: 'alignItemsStretch' }}
                >
                    <FlexItem flex={{ default: 'flex_1' }} className="ct-resource-tile__slot">
                        <ResourceCard
                            icon={<CubeIcon />}
                            title={_("Containers")}
                            count={stats.containers.total}
                            details={cockpit.format(
                                _("$0 running, $1 stopped"),
                                stats.containers.running, stats.containers.stopped)}
                        />
                    </FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }} className="ct-resource-tile__slot">
                        <ResourceCard
                            icon={<ImageIcon />}
                            title={_("Images")}
                            count={stats.images}
                        />
                    </FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }} className="ct-resource-tile__slot">
                        <ResourceCard
                            icon={<DatabaseIcon />}
                            title={_("Volumes")}
                            count={stats.volumes}
                        />
                    </FlexItem>
                    <FlexItem flex={{ default: 'flex_1' }} className="ct-resource-tile__slot">
                        <ResourceCard
                            icon={<NetworkIcon />}
                            title={_("Networks")}
                            count={stats.networks}
                        />
                    </FlexItem>
                </Flex>
            </CardBody>
        </Card>
    );
};
