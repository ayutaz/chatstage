import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createStaticServer } from '../scripts/serve.js';
import { DEMO_SCRIPT, VOICE_DEMO_SCRIPT, demoMessage } from '../src/demo.js';
import { ChatController } from '../src/controller.js';
import { Preferences } from '../src/preferences.js';
import { readOptions } from '../src/config.js';

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
test('setup and overlay omit the unused voice and model selector', async () => {
  const setup = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const overlay = await readFile(new URL('../overlay.html', import.meta.url), 'utf8');
  assert.doesNotMatch(setup, /tsukuyomi|name="models"|id="models"/i);
  assert.doesNotMatch(overlay, /tsukuyomi/i);
  assert.match(setup, /CSS10 voice credit/);
  assert.match(overlay, /Voice: CSS10/);
});
test('GitHub Pages project mount resolves every local HTML asset and module import', async (t) => {
  const server = createStaticServer(undefined, '/chatstage/');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const redirect = await fetch(`${origin}/chatstage?demo=1`, { redirect: 'manual' });
  assert.equal(redirect.headers.get('location'), '/chatstage/?demo=1');
  assert.equal((await fetch(`${origin}/src/setup.js`)).status, 404);
  const pending = [
    new URL('/chatstage/index.html', origin),
    new URL('/chatstage/overlay.html', origin),
  ];
  const seen = new Set();
  while (pending.length) {
    const url = pending.pop();
    url.search = '';
    url.hash = '';
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    assert.ok(url.pathname.startsWith('/chatstage/'), url.href);
    const response = await fetch(url);
    assert.equal(response.status, 200, url.href);
    const source = await response.text();
    const references = url.pathname.endsWith('.html')
      ? [...source.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
      : url.pathname.endsWith('.js')
        ? [...source.matchAll(/(?:from\s*|import\s*\()['"](\.[^'"]+)['"]/g)].map((m) => m[1])
        : [];
    for (const reference of references) {
      if (reference.startsWith('#') || /^[a-z]+:/i.test(reference)) continue;
      assert.ok(!reference.startsWith('/'), 'Project resources must be relative: ' + reference);
      pending.push(new URL(reference, url));
    }
  }
  assert.ok(seen.has(`${origin}/chatstage/src/tts.js`));
  assert.ok(seen.has(`${origin}/chatstage/src/stage.js`));
  assert.ok(seen.has(`${origin}/chatstage/assets/overlay.css`));
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
test('voice comparison demo queues all eight CSS10 presets with the same English sentence', () => {
  const queued = [];
  const controller = new ChatController({
    options: readOptions('demo=1'),
    prefs: new Preferences('__demo__', null),
    queue: { enqueue: (item) => queued.push(item) },
  });
  VOICE_DEMO_SCRIPT.forEach(([, person, text, extra], index) =>
    controller.handle(demoMessage(person, text, index, extra)),
  );
  assert.deepEqual(
    queued.map((item) => item.voice.id),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.equal(new Set(queued.map((item) => item.spokenText)).size, 1);
  assert.ok(queued.every((item) => item.voice.model === 'css10' && item.language === 'en'));
});
