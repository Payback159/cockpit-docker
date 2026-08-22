import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { setSpawnHandler, resetMock, FakeProcessError } from './test-support/cockpit-mock';
import { resetAccessMode } from './spawn';
import { checkDocker, checkCompose, getInfo } from './system';

beforeEach(() => {
    resetMock();
    resetAccessMode();
});

test('checkDocker liest die Version', async () => {
    setSpawnHandler(call => {
        if (call.args[1] === 'info')
            return '{}';
        return 'Docker version 29.1.3, build abc\n';
    });
    const info = await checkDocker();
    assert.equal(info.installed, true);
    assert.equal(info.version, '29.1.3');
});

test('checkDocker meldet ein fehlendes Binary', async () => {
    setSpawnHandler(() => {
        throw new FakeProcessError('not found', 'not-found', null);
    });
    const info = await checkDocker();
    assert.equal(info.installed, false);
    assert.equal(info.kind, 'not-installed');
});

test('checkCompose erkennt das v2-Plugin', async () => {
    setSpawnHandler(call => {
        if (call.args[1] === 'info')
            return '{}';
        return 'Docker Compose version v2.40.3\n';
    });
    const info = await checkCompose();
    assert.equal(info.installed, true);
    assert.equal(info.version, '2.40.3');
    assert.equal(info.isPlugin, true);
});

// Compose v1 kennt kein `docker compose ls`, auf dem listComposeProjects
// aufbaut. Es als "installiert" zu melden waere irrefuehrend: jede
// Folgeoperation scheitert.
test('checkCompose lehnt v1 ausdruecklich ab statt es als installiert zu melden', async () => {
    setSpawnHandler(call => {
        if (call.args[1] === 'info')
            return '{}';
        if (call.args[1] === 'compose')
            throw new FakeProcessError('unknown command', null, 1);
        // docker-compose (standalone, v1)
        return 'docker-compose version 1.29.2, build unknown\n';
    });
    const info = await checkCompose();
    assert.equal(info.installed, false);
    assert.equal(info.isLegacyV1, true);
});

test('checkCompose meldet fehlendes Compose', async () => {
    setSpawnHandler(call => {
        if (call.args[1] === 'info')
            return '{}';
        throw new FakeProcessError('not found', 'not-found', null);
    });
    const info = await checkCompose();
    assert.equal(info.installed, false);
    assert.equal(info.isLegacyV1, false);
});

test('getInfo parst die Kennzahlen', async () => {
    setSpawnHandler(() => JSON.stringify({
        Containers: 11,
        ContainersRunning: 10,
        ContainersStopped: 1,
        Images: 2,
        Driver: 'overlayfs',
        NCPU: 16,
        MemTotal: 123,
    }));
    const info = await getInfo();
    assert.equal(info.Containers, 11);
    assert.equal(info.ContainersRunning, 10);
    assert.equal(info.Driver, 'overlayfs');
});

test('getInfo wirft statt einen leeren Wert zu liefern', async () => {
    setSpawnHandler(call => {
        if (call.args[1] === 'info' && call.args.length === 2)
            return '{}';
        throw new FakeProcessError('failed to connect to the docker API at unix://x', null, 1);
    });
    await assert.rejects(
        () => getInfo(),
        (e: unknown) => (e as { kind?: string }).kind === 'daemon-unreachable');
});
