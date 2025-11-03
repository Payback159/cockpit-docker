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
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { CodeBlock, CodeBlockCode } from "@patternfly/react-core/dist/esm/components/CodeBlock/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";
import {
    Alert,
    AlertVariant
} from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import DownloadIcon from '@patternfly/react-icons/dist/esm/icons/download-icon';
import hljs from 'highlight.js/lib/core';
import yaml from 'highlight.js/lib/languages/yaml';
import 'highlight.js/styles/github-dark.css';

import cockpit from 'cockpit';
import { readComposeFile } from '../docker';

// Register YAML language
hljs.registerLanguage('yaml', yaml);

const _ = cockpit.gettext;

interface ComposeFileViewerProps {
    isOpen: boolean;
    onClose: () => void;
    projectName: string;
    configPath: string;
}

export const ComposeFileViewer: React.FC<ComposeFileViewerProps> = ({
    isOpen,
    onClose,
    projectName,
    configPath
}) => {
    const [content, setContent] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [highlightedCode, setHighlightedCode] = useState<string>('');

    useEffect(() => {
        if (!isOpen) {
            setContent('');
            setError(null);
            setHighlightedCode('');
            return;
        }

        const loadContent = async () => {
            setLoading(true);
            setError(null);
            try {
                const fileContent = await readComposeFile(configPath);
                setContent(fileContent);
                
                // Highlight the YAML content
                const highlighted = hljs.highlight(fileContent, { language: 'yaml' }).value;
                setHighlightedCode(highlighted);
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        };

        loadContent();
    }, [isOpen, configPath]);

    const handleDownload = () => {
        const blob = new Blob([content], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectName}-compose.yml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleClose = () => {
        setContent('');
        setError(null);
        onClose();
    };

    return (
        <Modal
            title={_(`Compose File: ${projectName}`)}
            isOpen={isOpen}
            onClose={handleClose}
            width="85%"
        >
            {/* Header mit Dateipfad */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid var(--pf-v6-global--BorderColor--100)',
                    marginBottom: '0.75rem'
                }}
            >
                <div
                    style={{
                        fontSize: '0.875rem',
                        color: 'var(--pf-v6-global--Color--200)',
                        fontFamily: 'monospace',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}
                >
                    📄 {configPath}
                </div>
            </div>

            {loading && (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <Spinner size="lg" /> {_("Loading compose file...")}
                </div>
            )}

            {error && (
                <Alert variant={AlertVariant.danger} title={_("Error loading compose file")} isInline>
                    {error}
                </Alert>
            )}

            {!loading && !error && (
                <div
                    style={{
                        height: 'calc(85vh - 160px)',
                        overflow: 'auto',
                        marginBottom: '1rem',
                        padding: '1rem',
                        background: 'var(--pf-v6-global--BackgroundColor--dark--100)',
                        borderRadius: '8px'
                    }}
                >
                    <CodeBlock>
                        <CodeBlockCode style={{ fontSize: '13px', lineHeight: '1.6' }}>
                            <pre style={{ margin: 0 }}>
                                <code
                                    className="hljs language-yaml"
                                    dangerouslySetInnerHTML={{ __html: highlightedCode || content }}
                                />
                            </pre>
                        </CodeBlockCode>
                    </CodeBlock>
                </div>
            )}

            {/* Footer mit Buttons */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '0.5rem',
                    padding: '1rem',
                    borderTop: '1px solid var(--pf-v6-global--BorderColor--100)'
                }}
            >
                <Button
                    variant="secondary"
                    icon={<DownloadIcon />}
                    onClick={handleDownload}
                    isDisabled={!content}
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
