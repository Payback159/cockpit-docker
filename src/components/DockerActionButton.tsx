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

/* Button for Docker actions that write.
 *
 * If access runs through privilege escalation (mode 'require') and admin
 * access is not currently active, the action would go nowhere. In that case it
 * is disabled and the reason is explained in a tooltip.
 *
 * PrivilegedButton from pkg/lib would be too coarse-grained here: it accepts
 * neither `size` nor `icon` nor an `isDisabled` of its own, and hardcodes
 * `isInline`. Instead the lower-level building block `Privileged` is wrapped
 * around a <Button> of our own -- that way all props survive, and an
 * additional isDisabled (while another action is running, say) is ANDed with
 * the missing permission instead of being masked by it.
 *
 * In mode 'none' (user is in the docker group) no escalation is needed; then
 * it is an ordinary button.
 */
import React, { useId } from 'react';
import { Button, type ButtonProps } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Privileged } from 'cockpit-components-privileged.jsx';

import cockpit from 'cockpit';
import { superuser } from 'superuser';
import { useEvent, useLoggedInUser } from 'hooks';
import { useDockerContext } from '../DockerProvider';

const _ = cockpit.gettext;

interface Props {
    onClick: () => void;
    variant?: ButtonProps['variant'];
    size?: 'sm' | 'lg';
    icon?: React.ReactNode;
    isDisabled?: boolean;
    ariaLabel?: string;
    /* Unique tooltip id for the Privileged wrapper. `Privileged` builds
     * "<tooltipId>_tooltip" from it; without an id of our own that would be
     * "undefined_tooltip" on every instance -- duplicate DOM ids. When none
     * is given, an id unique per instance is generated. */
    tooltipId?: string;
    children: React.ReactNode;
}

export const DockerActionButton: React.FC<Props> = ({
    onClick, variant = 'secondary', size = 'sm', icon, isDisabled = false, ariaLabel, tooltipId, children,
}) => {
    const { mode } = useDockerContext();
    const user = useLoggedInUser();
    const generatedTooltipId = useId();
    // superuser.allowed is read directly, not through React state -- without
    // this subscription a change in privilege escalation would only become
    // visible on an unrelated re-render (as in PrivilegedButton).
    useEvent(superuser, 'changed');

    if (mode !== 'require') {
        return (
            <Button
variant={variant} size={size} icon={icon}
                    isDisabled={isDisabled} onClick={onClick}
                    {...ariaLabel !== undefined && { 'aria-label': ariaLabel }}
            >
                {children}
            </Button>
        );
    }

    const excuse = cockpit.format(
        _("The user $0 needs administrative access to manage Docker on this system."),
        user?.name ?? ''
    );

    return (
        <Privileged allowed={superuser.allowed} tooltipId={tooltipId ?? generatedTooltipId} placement={undefined} excuse={excuse}>
            <Button
variant={variant} size={size} icon={icon}
                    isDisabled={isDisabled || !superuser.allowed} onClick={onClick}
                    {...ariaLabel !== undefined && { 'aria-label': ariaLabel }}
            >
                {children}
            </Button>
        </Privileged>
    );
};
