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
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";
import {
    CubeIcon,
    ImageIcon,
    DatabaseIcon,
    NetworkIcon
} from '@patternfly/react-icons';

import cockpit from 'cockpit';
import { getDockerInfo, countVolumes, countNetworks } from '../docker';

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

export const DockerResources: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<ResourceStats | null>(null);

    const loadStats = async () => {
        try {
            const [dockerInfo, volumeCount, networkCount] = await Promise.all([
                getDockerInfo(),
                countVolumes(),
                countNetworks()
            ]);

            if (dockerInfo) {
                setStats({
                    containers: {
                        total: dockerInfo.Containers,
                        running: dockerInfo.ContainersRunning,
                        stopped: dockerInfo.ContainersStopped,
                        paused: dockerInfo.ContainersPaused
                    },
                    images: dockerInfo.Images,
                    volumes: volumeCount,
                    networks: networkCount
                });
            }
        } catch (error) {
            console.error('Failed to load resource stats:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStats();
        
        // Auto-refresh every 30 seconds
        const interval = setInterval(loadStats, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <Card>
                <CardBody>
                    <Spinner size="lg" />
                </CardBody>
            </Card>
        );
    }

    if (!stats) {
        return null;
    }

    const ResourceCard = ({ icon, title, count, details }: {
        icon: React.ReactNode;
        title: string;
        count: number;
        details?: string;
    }) => (
        <Card isCompact style={{ height: '100%' }}>
            <CardBody style={{ padding: '1rem' }}>
                <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    gap: '0.5rem',
                    height: '100%',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.75rem',
                        color: 'var(--pf-v6-global--Color--200)'
                    }}>
                        <div style={{ fontSize: '1.25rem' }}>
                            {icon}
                        </div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                            {title}
                        </div>
                    </div>
                    
                    <div>
                        <div style={{ 
                            fontSize: '2rem', 
                            fontWeight: 'bold',
                            lineHeight: 1,
                            color: 'var(--pf-v6-global--primary-color--100)'
                        }}>
                            {count}
                        </div>
                        {details && (
                            <div style={{ 
                                fontSize: '0.8125rem', 
                                color: 'var(--pf-v6-global--Color--200)',
                                marginTop: '0.375rem'
                            }}>
                                {details}
                            </div>
                        )}
                    </div>
                </div>
            </CardBody>
        </Card>
    );

    return (
        <Card>
            <CardTitle>{_("Resources Overview")}</CardTitle>
            <CardBody>
                <div style={{ 
                    display: 'flex', 
                    gap: '0.75rem',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ flex: '1 1 0', minWidth: '200px' }}>
                        <ResourceCard
                            icon={<CubeIcon />}
                            title={_("Containers")}
                            count={stats.containers.total}
                            details={`${stats.containers.running} ${_("running")}, ${stats.containers.stopped} ${_("stopped")}`}
                        />
                    </div>
                    <div style={{ flex: '1 1 0', minWidth: '200px' }}>
                        <ResourceCard
                            icon={<ImageIcon />}
                            title={_("Images")}
                            count={stats.images}
                        />
                    </div>
                    <div style={{ flex: '1 1 0', minWidth: '200px' }}>
                        <ResourceCard
                            icon={<DatabaseIcon />}
                            title={_("Volumes")}
                            count={stats.volumes}
                        />
                    </div>
                    <div style={{ flex: '1 1 0', minWidth: '200px' }}>
                        <ResourceCard
                            icon={<NetworkIcon />}
                            title={_("Networks")}
                            count={stats.networks}
                        />
                    </div>
                </div>
            </CardBody>
        </Card>
    );
};
