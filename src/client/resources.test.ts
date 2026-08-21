import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { setSpawnHandler, recordedCalls, resetMock } from './test-support/cockpit-mock';
import { probeAccess, resetAccessMode } from './spawn';
import { listContainers } from './containers';
import { listVolumes, pruneVolumes, removeVolume } from './volumes';
import { listImages } from './images';

beforeEach(() => {
    resetMock();
    resetAccessMode();
});

async function primeAccess() {
    setSpawnHandler(() => '{}');
    await probeAccess();
    resetMock();
}

test('listContainers zerlegt die Compose-Labels', async () => {
    await primeAccess();
    setSpawnHandler(() => JSON.stringify({
        ID: 'abc', Names: 'simple-web-1', Image: 'busybox', State: 'running',
        Status: 'Up 2 minutes', Ports: '127.0.0.1:8080->80/tcp',
        Labels: 'com.docker.compose.project=simple,com.docker.compose.service=web',
    }));
    const out = await listContainers();
    assert.equal(out[0].Project, 'simple');
    assert.equal(out[0].Service, 'web');
    assert.equal(out[0].Name, 'simple-web-1');
});

test('listContainers meldet fehlende Labels als unknown', async () => {
    await primeAccess();
    setSpawnHandler(() => JSON.stringify({
        ID: 'abc', Names: 'standalone', Image: 'busybox', State: 'running',
        Status: 'Up', Ports: '', Labels: '',
    }));
    const out = await listContainers();
    assert.equal(out[0].Project, 'unknown');
});

test('listContainers filtert auf Compose, wenn verlangt', async () => {
    await primeAccess();
    setSpawnHandler(() => '');
    await listContainers({ composeOnly: true });
    const args = recordedCalls()[0].args;
    assert.ok(args.includes('--filter'));
    assert.ok(args.includes('label=com.docker.compose.project'));
});

test('listContainers sortiert nach Projekt, dann Service', async () => {
    await primeAccess();
    const mk = (p: string, s: string) => JSON.stringify({
        ID: p + s, Names: `${p}-${s}-1`, Image: 'busybox', State: 'running',
        Status: 'Up', Ports: '',
        Labels: `com.docker.compose.project=${p},com.docker.compose.service=${s}`,
    });
    setSpawnHandler(() => [mk('b', 'z'), mk('a', 'y'), mk('a', 'x')].join('\n'));
    const out = await listContainers();
    assert.deepEqual(out.map(c => `${c.Project}/${c.Service}`), ['a/x', 'a/y', 'b/z']);
});

// Der alte Code inspizierte jedes Volume einzeln: bei 152 Volumes waren das
// 153 Prozesse je Ladevorgang. `docker volume inspect` nimmt mehrere Namen.
test('listVolumes inspiziert alle Volumes in EINEM Aufruf', async () => {
    await primeAccess();
    setSpawnHandler(call => {
        if (call.args.includes('ls'))
            return 'v1\nv2\nv3\n';
        return JSON.stringify([
            { Name: 'v1', Driver: 'local', Mountpoint: '/m/v1', Scope: 'local' },
            { Name: 'v2', Driver: 'local', Mountpoint: '/m/v2', Scope: 'local' },
            { Name: 'v3', Driver: 'local', Mountpoint: '/m/v3', Scope: 'local' },
        ]);
    });
    const out = await listVolumes();
    assert.equal(out.length, 3);
    // ls + genau ein inspect
    assert.equal(recordedCalls().length, 2);
    const inspect = recordedCalls()[1].args;
    assert.deepEqual(inspect.slice(-3), ['v1', 'v2', 'v3']);
});

test('listVolumes liefert bei keinem Volume eine leere Liste ohne inspect', async () => {
    await primeAccess();
    setSpawnHandler(() => '');
    assert.deepEqual(await listVolumes(), []);
    assert.equal(recordedCalls().length, 1);
});

test('removeVolume haengt -f nur bei force an', async () => {
    await primeAccess();
    setSpawnHandler(() => '');
    await removeVolume('v1');
    assert.ok(!recordedCalls()[0].args.includes('-f'));
    resetMock();
    setSpawnHandler(() => '');
    await removeVolume('v1', true);
    assert.ok(recordedCalls()[0].args.includes('-f'));
});

// Die alte pruneVolumes hing in BEIDEN Zweigen ein Force-Flag an, sodass der
// Parameter wirkungslos war.
test('pruneVolumes laeuft immer nicht-interaktiv, aber ohne zweites Flag', async () => {
    await primeAccess();
    setSpawnHandler(() => 'Total reclaimed space: 0B');
    await pruneVolumes();
    const args = recordedCalls()[0].args;
    assert.deepEqual(args, ['docker', 'volume', 'prune', '--force']);
});

test('listImages markiert von Compose genutzte Images', async () => {
    await primeAccess();
    setSpawnHandler(call => {
        if (call.args[1] === 'images')
            return JSON.stringify({
                ID: 'i1', Repository: 'busybox', Tag: 'latest',
                Size: '4MB', CreatedAt: 'x',
            });
        return JSON.stringify({
            ID: 'c1', Names: 'simple-web-1', Image: 'busybox:latest',
            State: 'running', Status: 'Up', Ports: '',
            Labels: 'com.docker.compose.project=simple,com.docker.compose.service=web',
        });
    });
    const out = await listImages();
    assert.equal(out[0].UsedByCompose, true);
    assert.deepEqual(out[0].ComposeProjects, ['simple']);
});
