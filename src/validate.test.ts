import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCAL_PART, idList, parseCursor, parseLimit, readJson } from './validate.ts';
import { makePreview } from './mail.ts';

const throwsStatus = (fn: () => unknown, status: number) => assert.throws(fn, (e: any) => e.status === status);

test('local part rule', () => {
  for (const ok of ['a', 'abc', 'a.b-c_d', '0x1', 'a'.repeat(64)]) assert.ok(LOCAL_PART.test(ok), ok);
  for (const bad of ['', '.a', 'a.', 'A', 'a+b', 'a@b', 'a b', 'a'.repeat(65), 'é'])
    assert.ok(!LOCAL_PART.test(bad), bad);
});

test('cursor and limit parsing', () => {
  assert.equal(parseCursor(undefined), null);
  assert.deepEqual(parseCursor('123_00000000-0000-0000-0000-000000000000'), [
    123,
    '00000000-0000-0000-0000-000000000000',
  ]);
  throwsStatus(() => parseCursor('x_1'), 400);
  throwsStatus(() => parseCursor("1_' OR 1=1 --"), 400);
  assert.equal(parseLimit(undefined), 50);
  assert.equal(parseLimit('100'), 100);
  for (const bad of ['0', '101', '1.5', 'abc', '-1']) throwsStatus(() => parseLimit(bad), 400);
});

test('id lists', () => {
  assert.deepEqual(idList(['12345', '12345', '67890'], 'x'), ['12345', '67890']);
  throwsStatus(() => idList('12345', 'x'), 400);
  throwsStatus(() => idList(['1234'], 'x'), 400);
  throwsStatus(() => idList([12345], 'x'), 400);
});

test('readJson requires a JSON object sent as application/json', async () => {
  const req = (body: string, type = 'application/json') =>
    new Request('http://x/', { method: 'POST', body, headers: { 'content-type': type } });
  assert.deepEqual(await readJson(req('{"a":1}', 'application/json; charset=utf-8')), { a: 1 });
  for (const [body, type, status] of [
    ['{"a":1}', 'text/plain', 415],
    ['{"a":1}', 'application/jsonx', 415],
    ['{', 'application/json', 400],
    ['[1]', 'application/json', 400],
    ['null', 'application/json', 400],
  ] as const)
    await assert.rejects(readJson(req(body, type)), (e: any) => e.status === status);
});

test('preview prefers text, strips HTML, decodes entities, caps length', () => {
  assert.equal(makePreview('  hello\n\n world ', '<b>x</b>'), 'hello world');
  assert.equal(
    makePreview(
      undefined,
      '<html><head><style>p{}</style><title>T</title></head><p>Hi&nbsp;&amp; <i>bye</i>&#33;</p><script>x()</script></html>',
    ),
    'Hi & bye!',
  );
  assert.equal(makePreview('x'.repeat(500), undefined).length, 200);
  assert.equal(makePreview(undefined, undefined), '');
});
