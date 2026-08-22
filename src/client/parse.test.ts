import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseJsonList, parseJson, parseLabels } from './parse';

// Docker mixes the formats: `docker compose ls` returns an array, `docker ps`
// and `docker compose ps` return NDJSON. That is not guaranteed across the
// supported version range, so the same call has to cope with both formats.
test('parseJsonList accepts a JSON array', () => {
    const out = parseJsonList<{ Name: string }>('[{"Name":"a"},{"Name":"b"}]');
    assert.deepEqual(out.map(o => o.Name), ['a', 'b']);
});

test('parseJsonList accepts NDJSON', () => {
    const out = parseJsonList<{ Name: string }>('{"Name":"a"}\n{"Name":"b"}');
    assert.deepEqual(out.map(o => o.Name), ['a', 'b']);
});

test('parseJsonList returns the same result for both formats', () => {
    const asArray = parseJsonList('[{"x":1},{"x":2}]');
    const asNdjson = parseJsonList('{"x":1}\n{"x":2}');
    assert.deepEqual(asArray, asNdjson);
});

test('parseJsonList treats empty output as an empty list', () => {
    assert.deepEqual(parseJsonList(''), []);
    assert.deepEqual(parseJsonList('   \n  \n'), []);
});

test('parseJsonList ignores blank lines in NDJSON', () => {
    const out = parseJsonList<{ x: number }>('{"x":1}\n\n{"x":2}\n');
    assert.equal(out.length, 2);
});

test('parseJsonList recognises the array even with leading whitespace', () => {
    const out = parseJsonList<{ x: number }>('\n  [{"x":1}]');
    assert.deepEqual(out, [{ x: 1 }]);
});

// `docker volume inspect` prints a multi-line formatted array.
test('parseJsonList accepts a multi-line formatted array', () => {
    const out = parseJsonList<{ Name: string }>('[\n  {\n    "Name": "v1"\n  },\n  {\n    "Name": "v2"\n  }\n]');
    assert.deepEqual(out.map(o => o.Name), ['v1', 'v2']);
});

test('parseJsonList throws on broken JSON', () => {
    assert.throws(() => parseJsonList('{not json}'));
});

test('parseJson returns a single object', () => {
    const out = parseJson<{ Containers: number }>('{"Containers":3}');
    assert.equal(out.Containers, 3);
});

test('parseJson throws on empty output', () => {
    assert.throws(() => parseJson(''));
});

// Docker returns labels as a comma-separated key=value string. Values may
// themselves contain '=' (paths in com.docker.compose.project.config_files, say).
test('parseLabels splits comma-separated labels', () => {
    const out = parseLabels('a=1,b=2');
    assert.deepEqual(out, { a: '1', b: '2' });
});

test('parseLabels keeps equals signs inside the value', () => {
    const out = parseLabels('com.docker.compose.project.config_files=/a/b.yaml=x');
    assert.equal(out['com.docker.compose.project.config_files'], '/a/b.yaml=x');
});

test('parseLabels returns an empty object when labels are missing', () => {
    assert.deepEqual(parseLabels(undefined), {});
    assert.deepEqual(parseLabels(''), {});
});

test('parseLabels ignores entries without a value', () => {
    assert.deepEqual(parseLabels('a=1,broken,b=2'), { a: '1', b: '2' });
});
