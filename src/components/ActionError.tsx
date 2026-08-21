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

/* Einheitliche Anzeige eines fehlgeschlagenen Vorgangs.
 *
 * Die Spec verlangt eine gemeinsame Darstellung statt neun eigener
 * error-States. Angezeigt wird eine uebersetzte Kurzform als Titel und der
 * Originaltext von Docker als Detail.
 */
import React from 'react';
import { InlineNotification } from 'cockpit-components-inline-notification.jsx';

import cockpit from 'cockpit';
import { isDockerError } from '../client';

const _ = cockpit.gettext;

export const ActionError: React.FC<{ error: Error | null; onDismiss: () => void }> = ({ error, onDismiss }) => {
    if (!error)
        return null;

    const detail = isDockerError(error) ? error.raw : error.message;
    const text = isDockerError(error) && error.kind === 'not-found'
        ? _("The resource no longer exists.")
        : _("The operation failed.");

    return (
        <InlineNotification
            type="danger"
            text={text}
            detail={detail}
            onDismiss={onDismiss}
        />
    );
};
