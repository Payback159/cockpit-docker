import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { setSpawnHandler, resetMock, FakeProcessError } from './test-support/cockpit-mock';
import { resetAccessMode } from './spawn';
import { checkDocker, checkCompose, getInfo } from './system';

beforeEach(() => {
    resetMock();
    resetAccessMode();
});

test('checkDocker reads the version', async () => {
    setSpawnHandler(call => {
        if (call.args[1] === 'info')
            return '{}';
        return 'Docker version 29.1.3, build abc\n';
    });
    const info = await checkDocker();
    assert.equal(info.installed, true);
    assert.equal(info.version, '29.1.3');
});

test('checkDocker reports a missing binary', async () => {
    setSpawnHandler(() => {
        throw new FakeProcessError('not found', 'not-found', null);
    });
    const info = await checkDocker();
    assert.equal(info.installed, false);
    assert.equal(info.kind, 'not-installed');
});

test('checkCompose recognises the v2 plugin', async () => {
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

// Compose v1 has no `docker compose ls`, which listComposeProjects is built
// on. Reporting it as "installed" would be misleading: every subsequent
// operation fails.
test('checkCompose rejects v1 explicitly instead of reporting it as installed', async () => {
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

test('checkCompose reports missing Compose', async () => {
    setSpawnHandler(call => {
        if (call.args[1] === 'info')
            return '{}';
        throw new FakeProcessError('not found', 'not-found', null);
    });
    const info = await checkCompose();
    assert.equal(info.installed, false);
    assert.equal(info.isLegacyV1, false);
});

test('getInfo parses the metrics', async () => {
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

test('getInfo throws instead of returning an empty value', async () => {
    setSpawnHandler(call => {
        if (call.args[1] === 'info' && call.args.length === 2)
            return '{}';
        throw new FakeProcessError('failed to connect to the docker API at unix://x', null, 1);
    });
    await assert.rejects(
        () => getInfo(),
        (e: unknown) => (e as { kind?: string }).kind === 'daemon-unreachable');
});
