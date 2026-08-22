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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import cockpit from 'cockpit';
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Checkbox } from "@patternfly/react-core/dist/esm/components/Checkbox/index.js";
import { CodeBlock, CodeBlockCode } from "@patternfly/react-core/dist/esm/components/CodeBlock/index.js";
import DownloadIcon from '@patternfly/react-icons/dist/esm/icons/download-icon';
import { containerLogs, followLogs, type DockerError } from '../client';

const _ = cockpit.gettext;

interface ContainerLogsProps {
    containerName: string;
    isOpen: boolean;
    onClose: () => void;
}

export const ContainerLogs: React.FC<ContainerLogsProps> = ({ containerName, isOpen, onClose }) => {
    const [logs, setLogs] = useState<string>('');
    const [follow, setFollow] = useState(false);
    const [loading, setLoading] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const followProcessRef = useRef<{ close:() => void } | null>(null);
    const logsContainerRef = useRef<HTMLDivElement>(null);
    const isFollowingRef = useRef<boolean>(false);

    // Strip ANSI color codes from logs
    const stripAnsiCodes = (text: string): string => {
        // eslint-disable-next-line no-control-regex
        return text.replace(/\x1b\[[0-9;]*m/g, '');
    };

    const stopFollowing = useCallback(() => {
        if (followProcessRef.current) {
            followProcessRef.current.close();
            followProcessRef.current = null;
        }
        isFollowingRef.current = false;
    }, []);

    const loadLogs = useCallback(async (followMode: boolean) => {
        try {
            setLoading(true);

            if (followMode) {
                // Stop any existing follow process first
                stopFollowing();

                // Start following logs
                const handle = followLogs(
                    containerName,
                    chunk => {
                        setLogs(prev => prev + stripAnsiCodes(chunk));
                        // Auto-scroll in next tick
                        setTimeout(() => {
                            if (logsContainerRef.current) {
                                logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
                            }
                        }, 0);
                    },
                    (streamErr: DockerError) => {
                        // Der Stream ist bereits beendet, wenn dieser Callback
                        // feuert -- ohne diese Meldung wuerde ein abgerissenes
                        // `docker logs -f` (z.B. Container entfernt) im
                        // Hintergrund verschwinden, ohne dass die Anzeige es
                        // zeigt.
                        console.error('Failed to follow logs:', streamErr);
                        setLogs(prev => prev + '\n' + _("Error following logs: ") + streamErr.message);
                        isFollowingRef.current = false;
                        setFollow(false);
                    }
                );

                followProcessRef.current = handle;
                isFollowingRef.current = true;

                setLoading(false);
            } else {
                // Stop following if active
                stopFollowing();

                // Load last 1000 lines
                const text = await containerLogs(containerName, 1000);
                setLogs(stripAnsiCodes(text));
                setLoading(false);
            }
        } catch (err) {
            console.error('Failed to load logs:', err);
            setLogs(_("Error loading logs: ") + (err instanceof Error ? err.message : String(err)));
            setLoading(false);
            isFollowingRef.current = false;
        }
    }, [containerName, stopFollowing]);

    useEffect(() => {
        if (!isOpen) {
            // Reset state when modal closes
            stopFollowing();
            setFollow(false);
            setLogs('');
            return;
        }

        // Load initial logs when modal opens
        if (!isFollowingRef.current) {
            loadLogs(false);
        }

        return () => {
            // Cleanup on unmount
            stopFollowing();
        };
    }, [isOpen, containerName, loadLogs, stopFollowing]);

    useEffect(() => {
        if (!isOpen) return;

        if (follow) {
            // Clear logs and start following
            setLogs('');
            loadLogs(true);
        } else {
            // Stop following and reload static logs
            if (isFollowingRef.current) {
                stopFollowing();
                loadLogs(false);
            }
        }
    }, [follow, isOpen, loadLogs, stopFollowing]);

    const handleDownload = () => {
        const blob = new Blob([logs], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${containerName}-logs.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleClose = () => {
        stopFollowing();
        setFollow(false);
        setLogs('');
        onClose();
    };

    return (
        <Modal
            width="85%"
            title={_("Container Logs: ") + containerName}
            isOpen={isOpen}
            onClose={handleClose}
        >
            {/* Toolbar oben */}
            <div
                style={{
                    display: 'flex',
                    gap: '1.5rem',
                    alignItems: 'center',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid var(--pf-t--global--border--color--default)',
                    marginBottom: '0.75rem'
                }}
            >
                <Checkbox
                    id="follow-logs"
                    label={follow ? _("Following logs...") : _("Follow logs")}
                    isChecked={follow}
                    onChange={(_event, checked) => setFollow(checked)}
                />
                {follow && (
                    <span
                        style={{
                            fontSize: '0.875rem',
                            color: 'var(--pf-t--global--icon--color--status--success--default)',
                            fontWeight: 600
                        }}
                    >
                        🟢 Live
                    </span>
                )}
            </div>

            {/* Logs Content */}
            <div
                ref={logsContainerRef}
                style={{
                    height: 'calc(85vh - 160px)',
                    overflow: 'auto',
                    background: 'var(--pf-t--global--background--color--secondary--default)',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginBottom: '1rem'
                }}
            >
                <CodeBlock>
                    <CodeBlockCode style={{ fontSize: '13px', lineHeight: '1.4', fontFamily: 'monospace' }}>
                        {loading && !logs ? _("Loading logs...") : logs || _("No logs available")}
                        <div ref={logsEndRef} />
                    </CodeBlockCode>
                </CodeBlock>
            </div>

            {/* Footer mit Buttons */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '0.5rem',
                    padding: '1rem',
                    borderTop: '1px solid var(--pf-t--global--border--color--default)'
                }}
            >
                <Button
                    variant="secondary"
                    icon={<DownloadIcon />}
                    onClick={handleDownload}
                    isDisabled={!logs}
                    size="sm"
                >
                    {_("Download")}
                </Button>
                <Button variant="primary" onClick={handleClose} size="sm">
                    {_("Close")}
                </Button>
            </div>
        </Modal>
    );
};
