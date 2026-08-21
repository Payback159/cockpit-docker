import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { setSpawnHandler, recordedCalls, resetMock } from './test-support/cockpit-mock';
import { resetAccessMode, probeAccess } from './spawn';
import { listProjects, listServices, stopProject, downProject, restartProject, upProject } from './compose';

beforeEach(() => {
    resetMock();
    resetAccessMode();
});

async function primeAccess() {
    setSpawnHandler(() => '{}');
    await probeAccess();
    resetMock();
}

// `docker compose ls` liefert ein Array ...
test('listProjects parst die Array-Ausgabe', async () => {
    await primeAccess();
    setSpawnHandler(() => '[{"Name":"a","Status":"running(2)","ConfigFiles":"/x/compose.yaml"}]');
    const out = await listProjects();
    assert.equal(out.length, 1);
    assert.equal(out[0].Name, 'a');
});

// ... aber der Aufrufer verlaesst sich nicht darauf.
test('listProjects parst dieselbe Nutzlast auch als NDJSON', async () => {
    await primeAccess();
    setSpawnHandler(() => '{"Name":"a","Status":"running(2)","ConfigFiles":"/x/compose.yaml"}');
    const out = await listProjects();
    assert.equal(out[0].Name, 'a');
});

test('listProjects liefert bei leerer Ausgabe eine leere Liste', async () => {
    await primeAccess();
    setSpawnHandler(() => '');
    assert.deepEqual(await listProjects(), []);
});

// `docker compose ps` liefert NDJSON: eine Zeile je Service. Ein JSON.parse
// ueber die Gesamtausgabe scheitert ab dem zweiten Service -- genau der
// Fehler, den die alte Implementierung hatte.
test('listServices parst mehrzeiliges NDJSON', async () => {
    await primeAccess();
    setSpawnHandler(() =>
        '{"ID":"1","Name":"a-one-1","Service":"one","State":"running"}\n' +
        '{"ID":"2","Name":"a-two-1","Service":"two","State":"running"}');
    const out = await listServices('a');
    assert.equal(out.length, 2);
    assert.deepEqual(out.map(s => s.Service), ['one', 'two']);
});

test('listServices spricht das Projekt ueber --project-name an', async () => {
    await primeAccess();
    setSpawnHandler(() => '');
    await listServices('meinprojekt');
    const args = recordedCalls()[0].args;
    assert.ok(args.includes('--project-name'));
    assert.equal(args[args.indexOf('--project-name') + 1], 'meinprojekt');
    // ConfigFiles darf nie als -f-Argument auftauchen.
    assert.ok(!args.includes('-f'));
});

test('ein unbekanntes Projekt ist kein Fehler, sondern eine leere Liste', async () => {
    await primeAccess();
    setSpawnHandler(() => '');
    assert.deepEqual(await listServices('gibtsnicht'), []);
});

for (const [fn, expected] of [
    [upProject, ['up', '-d']],
    [stopProject, ['stop']],
    [downProject, ['down']],
    [restartProject, ['restart']],
] as const) {
    test(`${expected[0]} verwendet --project-name und kein -f`, async () => {
        await primeAccess();
        setSpawnHandler(() => '');
        await fn('p');
        const args = recordedCalls()[0].args;
        assert.deepEqual(args.slice(0, 4), ['docker', 'compose', '--project-name', 'p']);
        assert.deepEqual(args.slice(4), [...expected]);
        assert.ok(!args.includes('-f'));
    });
}
