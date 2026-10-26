import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createStaticServer } from '../scripts/serve.js';
import { DEMO_SCRIPT, demoMessage } from '../src/demo.js';

test('static site serves real modules and blocks private/developer files', async (t) => {
  const server = createStaticServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [path, type] of [
    ['/', 'text/html'],
    ['/overlay.html', 'text/html'],
    ['/src/overlay.js', 'text/javascript'],
    ['/assets/icon.svg', 'image/svg+xml'],
  ]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get('content-type').startsWith(type));
  }
  for (const path of [
    '/.git/config',
    '/node_modules/piper-plus/package.json',
    '/scripts/serve.js',
    '/%2e%67it/config',
    '/%zz',
  ])
    assert.equal((await fetch(origin + path)).status, 404, path);
});
test('importmap uses the brief-pinned real CDN locations', async () => {
  const html = await readFile(new URL('../overlay.html', import.meta.url), 'utf8');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  assert.equal(map['piper-plus'], 'https://unpkg.com/piper-plus@0.8.2/src/index.js');
  assert.equal(
    map['@piper-plus/g2p'],
    'https://cdn.jsdelivr.net/npm/@piper-plus/g2p@0.4.2/src/index.js',
  );
  assert.equal(
    map['onnxruntime-web'],
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.min.mjs',
  );
});
test('demo fixtures include real cleaning and moderator events', () => {
  const messages = DEMO_SCRIPT.map(([, person, text, extra], i) =>
    demoMessage(person, text, i, extra),
  );
  assert.ok(messages.some((m) => m.text === '!skip' && m.tags.mod === '1'));
  assert.ok(messages.some((m) => m.command === 'CLEARCHAT' && m.tags['target-user-id'] === '103'));
  const emote = messages.find((m) => m.emotes.length);
  assert.equal(
    Array.from(emote.text)
      .slice(emote.emotes[0].start, emote.emotes[0].end + 1)
      .join(''),
    'Kappa',
  );
});
