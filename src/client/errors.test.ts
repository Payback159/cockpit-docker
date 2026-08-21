import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyError, DockerError, isDockerError } from './errors';

// Alle Docker-Fehler liefern exit=1; unterscheidbar sind sie nur am
// stderr-Text. Die folgenden Muster wurden real gemessen (siehe Anhang der
// Spec), nicht angenommen.

test('fehlendes Binary wird ueber das cockpit-problem erkannt', () => {
    const e = classifyError('not-found', 'docker: command not found', null);
    assert.equal(e.kind, 'not-installed');
});

test('access-denied vom cockpit-Kanal wird erkannt', () => {
    const e = classifyError('access-denied', 'nicht erlaubt', null);
    assert.equal(e.kind, 'permission-denied');
});

test('nicht erreichbarer Daemon wird am stderr-Text erkannt', () => {
    const e = classifyError(
        null,
        'failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running',
        1);
    assert.equal(e.kind, 'daemon-unreachable');
});

test('fehlende Berechtigung wird am stderr-Text erkannt', () => {
    const e = classifyError(
        null,
        'permission denied while trying to connect to the docker API at unix:///var/run/docker.sock',
        1);
    assert.equal(e.kind, 'permission-denied');
});

test('nicht gefundenes Volume wird erkannt', () => {
    const e = classifyError(null, 'Error response from daemon: get x: no such volume', 1);
    assert.equal(e.kind, 'not-found');
});

test('nicht gefundenes Objekt wird erkannt', () => {
    const e = classifyError(null, 'error: no such object: x', 1);
    assert.equal(e.kind, 'not-found');
});

test('nicht gefundener Container wird erkannt, auch mit grossem N', () => {
    const e = classifyError(null, 'Error response from daemon: No such container: x', 1);
    assert.equal(e.kind, 'not-found');
});

test('unbekannter Fehler bleibt command-failed', () => {
    const e = classifyError(null, 'Error response from daemon: invalid reference format', 1);
    assert.equal(e.kind, 'command-failed');
});

test('der Originaltext bleibt in raw erhalten', () => {
    const text = 'Error response from daemon: irgendwas';
    const e = classifyError(null, text, 1);
    assert.equal(e.raw, text);
});

test('der exit-Status wird uebernommen', () => {
    const e = classifyError(null, 'x', 1);
    assert.equal(e.exitStatus, 1);
});

test('DockerError ist ein Error und ueber isDockerError erkennbar', () => {
    const e = classifyError(null, 'x', 1);
    assert.ok(e instanceof Error);
    assert.ok(isDockerError(e));
    assert.ok(!isDockerError(new Error('x')));
    assert.ok(!isDockerError(null));
});

test('die Klassifizierung ist gegen Gross- und Kleinschreibung robust', () => {
    const a = classifyError(null, 'PERMISSION DENIED WHILE TRYING TO CONNECT to the docker API', 1);
    assert.equal(a.kind, 'permission-denied');
    const b = classifyError(null, 'Failed To Connect To The Docker API at unix://x', 1);
    assert.equal(b.kind, 'daemon-unreachable');
});

test('das cockpit-problem hat Vorrang vor dem Text', () => {
    // Wenn der Kanal schon sagt, dass das Binary fehlt, ist der stderr-Text
    // nachrangig.
    const e = classifyError('not-found', 'no such container: x', null);
    assert.equal(e.kind, 'not-installed');
});
