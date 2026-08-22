import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { setSpawnHandler, recordedCalls, resetMock } from './test-support/cockpit-mock';
import { resetAccessMode, probeAccess } from './spawn';
import { listProjects, listServices, stopProject, downProject, restartProject, upProject, startProject } from './compose';

beforeEach(() => {
    resetMock();
    resetAccessMode();
});

async function primeAccess() {
    setSpawnHandler(() => '{}');
    await probeAccess();
    resetMock();
}

// `docker compose ls` returns an array ...
test('listProjects parses the array output', async () => {
    await primeAccess();
    setSpawnHandler(() => '[{"Name":"a","Status":"running(2)","ConfigFiles":"/x/compose.yaml"}]');
    const out = await listProjects();
    assert.equal(out.length, 1);
    assert.equal(out[0].Name, 'a');
});

// ... but the caller does not rely on that.
test('listProjects parses the same payload as NDJSON too', async () => {
    await primeAccess();
    setSpawnHandler(() => '{"Name":"a","Status":"running(2)","ConfigFiles":"/x/compose.yaml"}');
    const out = await listProjects();
    assert.equal(out[0].Name, 'a');
});

test('listProjects returns an empty list for empty output', async () => {
    await primeAccess();
    setSpawnHandler(() => '');
    assert.deepEqual(await listProjects(), []);
});

// `docker compose ps` returns NDJSON: one line per service. A JSON.parse over
// the whole output fails from the second service onwards -- exactly the bug the
// old implementation had.
test('listServices parses multi-line NDJSON', async () => {
    await primeAccess();
    setSpawnHandler(() =>
        '{"ID":"1","Name":"a-one-1","Service":"one","State":"running"}\n' +
        '{"ID":"2","Name":"a-two-1","Service":"two","State":"running"}');
    const out = await listServices('a');
    assert.equal(out.length, 2);
    assert.deepEqual(out.map(s => s.Service), ['one', 'two']);
});

test('listServices addresses the project through --project-name', async () => {
    await primeAccess();
    setSpawnHandler(() => '');
    await listServices('myproject');
    const args = recordedCalls()[0].args;
    assert.ok(args.includes('--project-name'));
    assert.equal(args[args.indexOf('--project-name') + 1], 'myproject');
    // ConfigFiles must never show up as a -f argument.
    assert.ok(!args.includes('-f'));
});

test('an unknown project is not an error but an empty list', async () => {
    await primeAccess();
    setSpawnHandler(() => '');
    assert.deepEqual(await listServices('does-not-exist'), []);
});

for (const [fn, expected] of [
    [upProject, ['up', '-d']],
    [startProject, ['start']],
    [stopProject, ['stop']],
    [downProject, ['down']],
    [restartProject, ['restart']],
] as const) {
    test(`${expected[0]} uses --project-name and no -f`, async () => {
        await primeAccess();
        setSpawnHandler(() => '');
        await fn('p');
        const args = recordedCalls()[0].args;
        assert.deepEqual(args.slice(0, 4), ['docker', 'compose', '--project-name', 'p']);
        assert.deepEqual(args.slice(4), [...expected]);
        assert.ok(!args.includes('-f'));
    });
}
