/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2017 Red Hat, Inc.
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
    Page,
    PageSection
} from "@patternfly/react-core/dist/esm/components/Page/index.js";
import {
    Tabs,
    Tab,
    TabTitleText
} from "@patternfly/react-core/dist/esm/components/Tabs/index.js";

import cockpit from 'cockpit';
import { DockerStatus } from './components/DockerStatus';
import { ComposeProjects } from './components/ComposeProjects';
import { ComposeContainers } from './components/ComposeContainers';
import { ComposeImages } from './components/ComposeImages';
import { PortMapping } from './components/PortMapping';
import { VolumeManagement } from './components/VolumeManagement';
import { DockerProvider, useDockerContext } from './DockerProvider';
import { FatalErrorBanner } from './components/FatalErrorBanner';

const _ = cockpit.gettext;

export const Application = () => {
    return (
        <DockerProvider>
            <ApplicationTabs />
        </DockerProvider>
    );
};

const ApplicationTabs = () => {
    const { activeTab, setActiveTab, fatalError, ready } = useDockerContext();

    return (
        <Page className="no-masthead-sidebar">
            <PageSection hasBodyWrapper={false}>
                {fatalError && <FatalErrorBanner error={fatalError} />}
                <Tabs
                    activeKey={activeTab}
                    onSelect={(_event, tabIndex) => setActiveTab(tabIndex)}
                    mountOnEnter
                >
                    <Tab eventKey={0} title={<TabTitleText>{_("Overview")}</TabTitleText>} isDisabled={!!fatalError}>
                        <DockerStatus />
                    </Tab>
                    <Tab eventKey={1} title={<TabTitleText>{_("Containers")}</TabTitleText>} isDisabled={!!fatalError || !ready}>
                        <ComposeContainers />
                    </Tab>
                    <Tab eventKey={2} title={<TabTitleText>{_("Compose Projects")}</TabTitleText>} isDisabled={!!fatalError || !ready}>
                        <ComposeProjects />
                    </Tab>
                    <Tab eventKey={3} title={<TabTitleText>{_("Images")}</TabTitleText>} isDisabled={!!fatalError || !ready}>
                        <ComposeImages />
                    </Tab>
                    <Tab eventKey={4} title={<TabTitleText>{_("Volumes")}</TabTitleText>} isDisabled={!!fatalError || !ready}>
                        <VolumeManagement />
                    </Tab>
                    <Tab eventKey={5} title={<TabTitleText>{_("Port Mappings")}</TabTitleText>} isDisabled={!!fatalError || !ready}>
                        <PortMapping />
                    </Tab>
                </Tabs>
            </PageSection>
        </Page>
    );
};
