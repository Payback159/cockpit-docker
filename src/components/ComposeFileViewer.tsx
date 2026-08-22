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
    Modal,
    ModalHeader,
    ModalBody,
    ModalFooter
} from "@patternfly/react-core/dist/esm/components/Modal/index.js";
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
import { readComposeFile } from '../client';

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

                // Highlighting is purely cosmetic and must not report a
                // successfully read file as an error. A try/catch of its own
                // keeps an hljs crash away from the read-error path -- if it
                // fails, highlightedCode stays empty and the display falls
                // back to the plain-text branch below.
                try {
                    const highlighted = hljs.highlight(fileContent, { language: 'yaml' }).value;
                    setHighlightedCode(highlighted);
                } catch {
                    setHighlightedCode('');
                }
            } catch (err) {
                // readComposeFile() passes on whatever cockpit.file().read()
                // rejects with -- a BasicError of the channel, not a
                // DockerError. It is not an Error instance, but does carry a
                // .message field.
                const message = err instanceof Error
                    ? err.message
                    : (err !== null && typeof err === 'object' && 'message' in err
                        ? String((err as { message: unknown }).message)
                        : String(err));
                setError(message);
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
            isOpen={isOpen}
            onClose={handleClose}
            width="85%"
        >
            {/* The path is the modal's subtitle: it identifies which file this is. */}
            <ModalHeader
                title={cockpit.format(_("Compose file: $0"), projectName)}
                description={configPath}
            />
            <ModalBody>

                {loading && (
                    <div className="ct-centered-status">
                        <Spinner size="lg" /> {_("Loading compose file...")}
                    </div>
                )}

                {error && (
                    <Alert variant={AlertVariant.danger} title={_("Error loading compose file")} isInline>
                        {error}
                    </Alert>
                )}

                {!loading && !error && (
                    <div className="ct-scroll-pane">
                        <CodeBlock>
                            <CodeBlockCode className="ct-code-file">
                                <pre className="ct-code-pre">
                                    {highlightedCode
                                        ? <code className="hljs language-yaml" dangerouslySetInnerHTML={{ __html: highlightedCode }} />
                                        : <code className="hljs language-yaml">{content}</code>}
                                </pre>
                            </CodeBlockCode>
                        </CodeBlock>
                    </div>
                )}

            </ModalBody>

            <ModalFooter>
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
            </ModalFooter>
        </Modal>
    );
};
