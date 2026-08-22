import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    setSpawnHandler, recordedCalls, resetMock, FakeProcessError,
} from './test-support/cockpit-mock';
import {
    probeAccess, getAccessMode, resetAccessMode, run, setSuperuserAllowedSource,
} from './spawn';

beforeEach(() => {
    resetMock();
    resetAccessMode();
    setSuperuserAllowedSource(() => false);
});

// Situation 1: user is in the docker group. Access succeeds without
// escalation, and no admin prompt must be triggered.
test('when access succeeds without escalation, the mode is none', async () => {
    setSpawnHandler(() => '{}');
    const mode = await probeAccess();
    assert.equal(mode, 'none');
    assert.equal(getAccessMode(), 'none');
    assert.equal(recordedCalls().length, 1);
    assert.equal(recordedCalls()[0].superuser, null);
});

// Situation 2: user is an administrator, but not in the docker group.
test('when the first attempt fails, it is retried with superuser', async () => {
    setSpawnHandler(call => {
        if (call.superuser === 'require')
            return '{}';
        throw new FakeProcessError('permission denied while trying to connect to the docker API', null, 1);
    });
    const mode = await probeAccess({ superuserAllowed: true });
    assert.equal(mode, 'require');
    assert.equal(recordedCalls().length, 2);
    assert.equal(recordedCalls()[1].superuser, 'require');
});

// Situation 3: neither group membership nor admin access.
test('when both paths fail, the probe throws a classified error', async () => {
    setSpawnHandler(() => {
        throw new FakeProcessError('permission denied while trying to connect to the docker API', null, 1);
    });
    await assert.rejects(
        () => probeAccess({ superuserAllowed: true }),
        (e: unknown) => (e as { kind?: string }).kind === 'permission-denied');
});

test('without admin access no escalation is attempted at all', async () => {
    setSpawnHandler(() => {
        throw new FakeProcessError('permission denied while trying to connect to the docker API', null, 1);
    });
    await assert.rejects(() => probeAccess({ superuserAllowed: false }));
    assert.equal(recordedCalls().length, 1);
});

test('a missing binary is reported as not-installed', async () => {
    setSpawnHandler(() => {
        throw new FakeProcessError('not found', 'not-found', null);
    });
    await assert.rejects(
        () => probeAccess({ superuserAllowed: true }),
        (e: unknown) => (e as { kind?: string }).kind === 'not-installed');
});

test('run uses the determined mode for subsequent calls', async () => {
    setSpawnHandler(call => {
        if (call.args[1] === 'info' && call.superuser !== 'require')
            throw new FakeProcessError('permission denied while trying to connect to the docker API', null, 1);
        return 'ok';
    });
    await probeAccess({ superuserAllowed: true });
    resetMock();
    setSpawnHandler(() => 'ok');
    await run(['docker', 'ps']);
    assert.equal(recordedCalls()[0].superuser, 'require');
});

test('run passes environ through', async () => {
    setSpawnHandler(() => 'ok');
    await probeAccess();
    resetMock();
    setSpawnHandler(() => 'ok');
    await run(['docker', 'ps'], { environ: ['A=1'] });
    assert.deepEqual(recordedCalls()[0].environ, ['A=1']);
});

test('run converts a failure into a DockerError', async () => {
    setSpawnHandler(() => 'ok');
    await probeAccess();
    setSpawnHandler(() => {
        throw new FakeProcessError('Error response from daemon: no such volume: x', null, 1);
    });
    await assert.rejects(
        () => run(['docker', 'volume', 'inspect', 'x']),
        (e: unknown) => (e as { kind?: string }).kind === 'not-found');
});

test('run without a prior probe runs one itself', async () => {
    setSpawnHandler(() => 'ok');
    await run(['docker', 'ps']);
    assert.equal(getAccessMode(), 'none');
});

// Without its own superuserAllowed the probe must consult the configured
// source -- and only at the moment of escalation. While the page is loading,
// superuser.allowed is null at first and only becomes true afterwards; a value
// read at call time would never let the escalation happen.
test('without an argument the probe consults the configured source -- only on escalation', async () => {
    let allowed = false;
    setSuperuserAllowedSource(() => allowed);
    setSpawnHandler(call => {
        if (call.superuser === 'require')
            return '{}';
        // Between the call and the escalation, admin access becomes known.
        allowed = true;
        throw new FakeProcessError('permission denied while trying to connect to the docker API', null, 1);
    });
    assert.equal(await probeAccess(), 'require');
    assert.equal(recordedCalls().length, 2);
});

test('when the source reports no admin access, nothing is escalated', async () => {
    setSuperuserAllowedSource(() => false);
    setSpawnHandler(() => {
        throw new FakeProcessError('permission denied while trying to connect to the docker API', null, 1);
    });
    await assert.rejects(() => probeAccess());
    assert.equal(recordedCalls().length, 1);
});

// run() must not start a second probe while one is in flight (after
// resetAccessMode(), say): both would set the mode, and the later one could
// take the already escalated mode back down to 'none'.
test('concurrent probes share a single run', async () => {
    setSuperuserAllowedSource(() => true);
    setSpawnHandler(call => {
        if (call.superuser === 'require')
            return '{}';
        throw new FakeProcessError('permission denied while trying to connect to the docker API', null, 1);
    });
    const [a, b, c] = await Promise.all([probeAccess(), probeAccess(), run(['docker', 'ps'])]);
    assert.equal(a, 'require');
    assert.equal(b, 'require');
    assert.equal(c, '{}');
    // exactly one probe (2 calls) plus the actual `docker ps`
    assert.equal(recordedCalls().length, 3);
    assert.equal(getAccessMode(), 'require');
});

// Once finished, the next probe must really run again (otherwise a result
// determined once would stand forever).
test('after completion the probe can run again', async () => {
    setSpawnHandler(() => '{}');
    await probeAccess();
    resetAccessMode();
    resetMock();
    setSpawnHandler(() => '{}');
    await probeAccess();
    assert.equal(recordedCalls().length, 1);
});
