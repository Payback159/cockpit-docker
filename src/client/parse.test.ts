import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseJsonList, parseJson, parseLabels } from './parse';

// Docker mischt die Formate: `docker compose ls` liefert ein Array,
// `docker ps` und `docker compose ps` liefern NDJSON. Ueber die
// unterstuetzte Versionsspanne ist das nicht zugesichert, deshalb muss
// derselbe Aufruf beide Formate vertragen.
test('parseJsonList nimmt ein JSON-Array', () => {
    const out = parseJsonList<{ Name: string }>('[{"Name":"a"},{"Name":"b"}]');
    assert.deepEqual(out.map(o => o.Name), ['a', 'b']);
});

test('parseJsonList nimmt NDJSON', () => {
    const out = parseJsonList<{ Name: string }>('{"Name":"a"}\n{"Name":"b"}');
    assert.deepEqual(out.map(o => o.Name), ['a', 'b']);
});

test('parseJsonList liefert fuer beide Formate dasselbe Ergebnis', () => {
    const asArray = parseJsonList('[{"x":1},{"x":2}]');
    const asNdjson = parseJsonList('{"x":1}\n{"x":2}');
    assert.deepEqual(asArray, asNdjson);
});

test('parseJsonList behandelt leere Ausgabe als leere Liste', () => {
    assert.deepEqual(parseJsonList(''), []);
    assert.deepEqual(parseJsonList('   \n  \n'), []);
});

test('parseJsonList ignoriert Leerzeilen in NDJSON', () => {
    const out = parseJsonList<{ x: number }>('{"x":1}\n\n{"x":2}\n');
    assert.equal(out.length, 2);
});

test('parseJsonList erkennt das Array auch mit fuehrendem Leerraum', () => {
    const out = parseJsonList<{ x: number }>('\n  [{"x":1}]');
    assert.deepEqual(out, [{ x: 1 }]);
});

test('parseJsonList wirft bei kaputtem JSON', () => {
    assert.throws(() => parseJsonList('{nicht json}'));
});

test('parseJson liefert ein einzelnes Objekt', () => {
    const out = parseJson<{ Containers: number }>('{"Containers":3}');
    assert.equal(out.Containers, 3);
});

test('parseJson wirft bei leerer Ausgabe', () => {
    assert.throws(() => parseJson(''));
});

// Docker liefert Labels als kommagetrennten key=value-String. Werte duerfen
// selbst '=' enthalten (etwa Pfade in com.docker.compose.project.config_files).
test('parseLabels zerlegt kommagetrennte Labels', () => {
    const out = parseLabels('a=1,b=2');
    assert.deepEqual(out, { a: '1', b: '2' });
});

test('parseLabels behaelt Gleichheitszeichen im Wert', () => {
    const out = parseLabels('com.docker.compose.project.config_files=/a/b.yaml=x');
    assert.equal(out['com.docker.compose.project.config_files'], '/a/b.yaml=x');
});

test('parseLabels liefert bei fehlenden Labels ein leeres Objekt', () => {
    assert.deepEqual(parseLabels(undefined), {});
    assert.deepEqual(parseLabels(''), {});
});

test('parseLabels ignoriert Eintraege ohne Wert', () => {
    assert.deepEqual(parseLabels('a=1,kaputt,b=2'), { a: '1', b: '2' });
});
