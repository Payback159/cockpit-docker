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

/* Schaltflaeche fuer schreibende Docker-Aktionen.
 *
 * Laeuft der Zugriff ueber Rechteerhoehung (Modus 'require') und ist der
 * Admin-Zugriff gerade nicht aktiv, wuerde die Aktion ins Leere laufen. In
 * diesem Fall wird sie deaktiviert und der Grund als Tooltip erklaert --
 * dafuer bringt Cockpit PrivilegedButton mit.
 *
 * Im Modus 'none' (Nutzer ist in der Gruppe docker) braucht es keine
 * Rechteerhoehung; dann ist es eine gewoehnliche Schaltflaeche.
 */
import React from 'react';
import { Button, type ButtonProps } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { PrivilegedButton } from 'cockpit-components-privileged.jsx';

import cockpit from 'cockpit';
import { useDockerContext } from '../DockerProvider';

const _ = cockpit.gettext;

interface Props {
    onClick: () => void;
    variant?: ButtonProps['variant'];
    size?: 'sm' | 'lg';
    icon?: React.ReactNode;
    isDisabled?: boolean;
    ariaLabel?: string;
    children: React.ReactNode;
}

export const DockerActionButton: React.FC<Props> = ({
    onClick, variant = 'secondary', size = 'sm', icon, isDisabled = false, ariaLabel, children,
}) => {
    const { mode } = useDockerContext();

    if (mode !== 'require') {
        return (
            <Button variant={variant} size={size} icon={icon}
                    isDisabled={isDisabled} onClick={onClick}
                    {...ariaLabel !== undefined && { 'aria-label': ariaLabel }}>
                {children}
            </Button>
        );
    }

    return (
        <PrivilegedButton
            variant={variant}
            ariaLabel={ariaLabel}
            isDanger={false}
            excuse={_("The user $0 needs administrative access to manage Docker on this system.")}
            onClick={onClick}
        >
            {children}
        </PrivilegedButton>
    );
};
