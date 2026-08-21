import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    setSpawnHandler, recordedCalls, resetMock, FakeProcessError,
} from './test-support/cockpit-mock';
import { probeAccess, getAccessMode, resetAccessMode, run } from './spawn';

beforeEach(() => {
    resetMock();
    resetAccessMode();
});

// Lage 1: Nutzer ist in der Gruppe docker. Der Zugriff gelingt ohne
// Rechteerhoehung, es darf kein Admin-Prompt ausgeloest werden.
test('gelingt der Zugriff ohne Rechteerhoehung, ist der Modus none', async () => {
    setSpawnHandler(() => '{}');
    const mode = await probeAccess();
    assert.equal(mode, 'none');
    assert.equal(getAccessMode(), 'none');
    assert.equal(recordedCalls().length, 1);
    assert.equal(recordedCalls()[0].superuser, null);
});

// Lage 2: Nutzer ist Administrator, aber nicht in der Gruppe docker.
test('scheitert der erste Versuch, wird mit superuser wiederholt', async () => {
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

// Lage 3: weder Gruppe noch Admin-Zugriff.
test('scheitern beide Wege, wirft die Probe einen klassifizierten Fehler', async () => {
    setSpawnHandler(() => {
        throw new FakeProcessError('permission denied while trying to connect to the docker API', null, 1);
    });
    await assert.rejects(
        () => probeAccess({ superuserAllowed: true }),
        (e: unknown) => (e as { kind?: string }).kind === 'permission-denied');
});

test('ohne Admin-Zugriff wird gar nicht erst eskaliert', async () => {
    setSpawnHandler(() => {
        throw new FakeProcessError('permission denied while trying to connect to the docker API', null, 1);
    });
    await assert.rejects(() => probeAccess({ superuserAllowed: false }));
    assert.equal(recordedCalls().length, 1);
});

test('fehlendes Binary wird als not-installed gemeldet', async () => {
    setSpawnHandler(() => {
        throw new FakeProcessError('not found', 'not-found', null);
    });
    await assert.rejects(
        () => probeAccess({ superuserAllowed: true }),
        (e: unknown) => (e as { kind?: string }).kind === 'not-installed');
});

test('run verwendet den ermittelten Modus fuer Folgeaufrufe', async () => {
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

test('run reicht environ durch', async () => {
    setSpawnHandler(() => 'ok');
    await probeAccess();
    resetMock();
    setSpawnHandler(() => 'ok');
    await run(['docker', 'ps'], { environ: ['A=1'] });
    assert.deepEqual(recordedCalls()[0].environ, ['A=1']);
});

test('run wandelt einen Fehler in einen DockerError um', async () => {
    setSpawnHandler(() => 'ok');
    await probeAccess();
    setSpawnHandler(() => {
        throw new FakeProcessError('Error response from daemon: no such volume: x', null, 1);
    });
    await assert.rejects(
        () => run(['docker', 'volume', 'inspect', 'x']),
        (e: unknown) => (e as { kind?: string }).kind === 'not-found');
});

test('run ohne vorherige Probe fuehrt sie selbst aus', async () => {
    setSpawnHandler(() => 'ok');
    await run(['docker', 'ps']);
    assert.equal(getAccessMode(), 'none');
});
