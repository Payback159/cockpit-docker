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

// Ohne eigenes superuserAllowed muss die Probe die hinterlegte Quelle
// befragen -- und zwar erst im Moment der Eskalation. Beim Seitenaufbau ist
// superuser.allowed zunaechst null und wird erst danach true; ein beim Aufruf
// abgelesener Wert liesse die Eskalation nie zustande kommen.
test('ohne Argument fragt die Probe die hinterlegte Quelle -- erst bei der Eskalation', async () => {
    let allowed = false;
    setSuperuserAllowedSource(() => allowed);
    setSpawnHandler(call => {
        if (call.superuser === 'require')
            return '{}';
        // Zwischen Aufruf und Eskalation wird der Admin-Zugriff bekannt.
        allowed = true;
        throw new FakeProcessError('permission denied while trying to connect to the docker API', null, 1);
    });
    assert.equal(await probeAccess(), 'require');
    assert.equal(recordedCalls().length, 2);
});

test('meldet die Quelle keinen Admin-Zugriff, wird nicht eskaliert', async () => {
    setSuperuserAllowedSource(() => false);
    setSpawnHandler(() => {
        throw new FakeProcessError('permission denied while trying to connect to the docker API', null, 1);
    });
    await assert.rejects(() => probeAccess());
    assert.equal(recordedCalls().length, 1);
});

// run() darf waehrend einer laufenden Probe (etwa nach resetAccessMode())
// keine zweite starten: beide wuerden den Modus setzen, und die spaetere
// koennte den bereits eskalierten Modus wieder auf 'none' zuruecknehmen.
test('gleichzeitige Proben teilen sich einen Lauf', async () => {
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
    // genau eine Probe (2 Aufrufe) plus das eigentliche `docker ps`
    assert.equal(recordedCalls().length, 3);
    assert.equal(getAccessMode(), 'require');
});

// Nach Abschluss darf die naechste Probe wieder wirklich laufen (sonst
// bliebe ein einmal ermitteltes Ergebnis fuer immer stehen).
test('nach Abschluss ist die Probe wieder ausfuehrbar', async () => {
    setSpawnHandler(() => '{}');
    await probeAccess();
    resetAccessMode();
    resetMock();
    setSpawnHandler(() => '{}');
    await probeAccess();
    assert.equal(recordedCalls().length, 1);
});
