import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyError, DockerError, isDockerError } from './errors';

// All Docker errors exit with status 1; the stderr text is the only thing
// that tells them apart. The patterns below were measured for real (see the
// spec's appendix), not assumed.

test('a missing binary is recognised through the cockpit problem', () => {
    const e = classifyError('not-found', 'docker: command not found', null);
    assert.equal(e.kind, 'not-installed');
});

test('access-denied from the cockpit channel is recognised', () => {
    const e = classifyError('access-denied', 'not permitted', null);
    assert.equal(e.kind, 'permission-denied');
});

test('an unreachable daemon is recognised from the stderr text', () => {
    const e = classifyError(
        null,
        'failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running',
        1);
    assert.equal(e.kind, 'daemon-unreachable');
});

test('a missing permission is recognised from the stderr text', () => {
    const e = classifyError(
        null,
        'permission denied while trying to connect to the docker API at unix:///var/run/docker.sock',
        1);
    assert.equal(e.kind, 'permission-denied');
});

test('a volume that was not found is recognised', () => {
    const e = classifyError(null, 'Error response from daemon: get x: no such volume', 1);
    assert.equal(e.kind, 'not-found');
});

test('an object that was not found is recognised', () => {
    const e = classifyError(null, 'error: no such object: x', 1);
    assert.equal(e.kind, 'not-found');
});

test('a container that was not found is recognised, capital N included', () => {
    const e = classifyError(null, 'Error response from daemon: No such container: x', 1);
    assert.equal(e.kind, 'not-found');
});

test('an unknown error stays command-failed', () => {
    const e = classifyError(null, 'Error response from daemon: invalid reference format', 1);
    assert.equal(e.kind, 'command-failed');
});

test('the original text is preserved in raw', () => {
    const text = 'Error response from daemon: something';
    const e = classifyError(null, text, 1);
    assert.equal(e.raw, text);
});

test('the exit status is carried over', () => {
    const e = classifyError(null, 'x', 1);
    assert.equal(e.exitStatus, 1);
});

test('DockerError is an Error and recognisable through isDockerError', () => {
    const e = classifyError(null, 'x', 1);
    assert.ok(e instanceof Error);
    assert.ok(e instanceof DockerError);
    assert.ok(isDockerError(e));
    assert.ok(!isDockerError(new Error('x')));
    assert.ok(!isDockerError(null));
});

test('the classification is robust against upper and lower case', () => {
    const a = classifyError(null, 'PERMISSION DENIED WHILE TRYING TO CONNECT to the docker API', 1);
    assert.equal(a.kind, 'permission-denied');
    const b = classifyError(null, 'Failed To Connect To The Docker API at unix://x', 1);
    assert.equal(b.kind, 'daemon-unreachable');
});

test('the cockpit problem takes priority over the text', () => {
    // If the channel already says the binary is missing, the stderr text is
    // secondary.
    const e = classifyError('not-found', 'no such container: x', null);
    assert.equal(e.kind, 'not-installed');
});
