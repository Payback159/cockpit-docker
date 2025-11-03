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

import React, { useState } from 'react';
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

const _ = cockpit.gettext;

export const Application = () => {
    const [activeTabKey, setActiveTabKey] = useState<string | number>(0);

    return (
        <Page className="no-masthead-sidebar">
            <PageSection hasBodyWrapper={false}>
                <Tabs
                    activeKey={activeTabKey}
                    onSelect={(_event, tabIndex) => setActiveTabKey(tabIndex)}
                >
                    <Tab eventKey={0} title={<TabTitleText>{_("Overview")}</TabTitleText>}>
                        <DockerStatus />
                    </Tab>
                    <Tab eventKey={1} title={<TabTitleText>{_("Containers")}</TabTitleText>}>
                        <ComposeContainers />
                    </Tab>
                    <Tab eventKey={2} title={<TabTitleText>{_("Compose Projects")}</TabTitleText>}>
                        <ComposeProjects />
                    </Tab>
                    <Tab eventKey={3} title={<TabTitleText>{_("Images")}</TabTitleText>}>
                        <ComposeImages />
                    </Tab>
                    <Tab eventKey={4} title={<TabTitleText>{_("Volumes")}</TabTitleText>}>
                        <VolumeManagement />
                    </Tab>
                    <Tab eventKey={5} title={<TabTitleText>{_("Port Mappings")}</TabTitleText>}>
                        <PortMapping />
                    </Tab>
                </Tabs>
            </PageSection>
        </Page>
    );
};
