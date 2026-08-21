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
 * diesem Fall wird sie deaktiviert und der Grund als Tooltip erklaert.
 *
 * PrivilegedButton aus pkg/lib waere hier zu grobkoernig: es nimmt weder
 * `size` noch `icon` noch ein eigenes `isDisabled` an und hardcodiert
 * `isInline`. Stattdessen wird der niedrigere Baustein `Privileged` um eine
 * eigene <Button> gelegt -- so bleiben alle Props erhalten, und ein
 * zusaetzliches isDisabled (z. B. waehrend eine andere Aktion laeuft) wird
 * mit der fehlenden Berechtigung UND-verknuepft statt von ihr verdeckt.
 *
 * Im Modus 'none' (Nutzer ist in der Gruppe docker) braucht es keine
 * Rechteerhoehung; dann ist es eine gewoehnliche Schaltflaeche.
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
    /* Eindeutige Tooltip-Id fuer die Privileged-Huelle. `Privileged` baut
     * daraus "<tooltipId>_tooltip"; ohne eigene Id waere das bei jeder
     * Instanz "undefined_tooltip" -- doppelte DOM-Ids. Ohne Vorgabe wird
     * eine pro Instanz eindeutige Id erzeugt. */
    tooltipId?: string;
    children: React.ReactNode;
}

export const DockerActionButton: React.FC<Props> = ({
    onClick, variant = 'secondary', size = 'sm', icon, isDisabled = false, ariaLabel, tooltipId, children,
}) => {
    const { mode } = useDockerContext();
    const user = useLoggedInUser();
    const generatedTooltipId = useId();
    // superuser.allowed wird direkt gelesen, nicht ueber React-State --
    // ohne dieses Abonnement wuerde ein Wechsel der Rechteerhoehung erst
    // bei einem unabhaengigen Re-Render sichtbar (wie in PrivilegedButton).
    useEvent(superuser, 'changed');

    if (mode !== 'require') {
        return (
            <Button variant={variant} size={size} icon={icon}
                    isDisabled={isDisabled} onClick={onClick}
                    {...ariaLabel !== undefined && { 'aria-label': ariaLabel }}>
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
            <Button variant={variant} size={size} icon={icon}
                    isDisabled={isDisabled || !superuser.allowed} onClick={onClick}
                    {...ariaLabel !== undefined && { 'aria-label': ariaLabel }}>
                {children}
            </Button>
        </Privileged>
    );
};
