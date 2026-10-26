// Optional real-browser check; not part of dependency-free node --test.
// npm install --prefix .artifacts --no-save playwright
// node scripts/check-live.mjs fps_shaka http://localhost:4175/chatstage/
// Append --patched to verify local modules at the deployed Pages origin without
// publishing. The report explicitly identifies that request interception.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

let playwright;
try {
  playwright = await import('playwright');
} catch {
  playwright = await import('../.artifacts/node_modules/playwright/index.mjs');
}
const channel = process.argv[2] || 'fps_shaka';
const base = new URL(process.argv[3] || 'http://localhost:4175/chatstage/');
const patched = process.argv.includes('--patched');
const gesture = process.argv.includes('--gesture');
const demo = process.argv.includes('--demo');
const label = demo
  ? 'local-demo-autoplay'
  : patched
    ? 'pages-origin-patched'
    : gesture
      ? 'local-click'
      : 'local-obs-autoplay';
const { chromium } = playwright;
const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    `--autoplay-policy=${gesture ? 'document-user-activation-required' : 'no-user-gesture-required'}`,
  ],
});
const report = {
  label,
  channel,
  base: base.href,
  patched,
  gesture,
  demo,
  chrome: browser.version(),
  frames: 0,
  privmsgs: 0,
  sentCommands: [],
  errors: [],
  warnings: [],
  failedRequests: [],
  modelRequests: [],
  timings: {},
};
const started = Date.now();
let page;
try {
  page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  if (patched) {
    await page.route(`${base.origin}${base.pathname}src/**`, async (route) => {
      const name = new URL(route.request().url()).pathname.slice(base.pathname.length);
      if (!/^src\/[a-z-]+\.js$/.test(name)) return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: await readFile(new URL(`../${name}`, import.meta.url)),
      });
    });
  }
  await page.addInitScript(() => {
    window.__liveCheck = { speech: [], ended: 0 };
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const pcm = this.buffer?.getChannelData(0);
      if (pcm?.length) {
        let sum = 0;
        for (const sample of pcm) sum += sample * sample;
        window.__liveCheck.speech.push({
          samples: pcm.length,
          sampleRate: this.buffer.sampleRate,
          duration: this.buffer.duration,
          rate: this.playbackRate.value,
          rms: Math.sqrt(sum / pcm.length),
          state: this.context.state,
        });
        this.addEventListener(
          'ended',
          () => {
            window.__liveCheck.ended++;
          },
          { once: true },
        );
      }
      return original.apply(this, args);
    };
  });
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(message.text());
    if (message.type() === 'warning') report.warnings.push(message.text());
  });
  page.on('requestfailed', (request) =>
    report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }),
  );
  page.on('request', (request) => {
    if (/huggingface.co/.test(request.url())) report.modelRequests.push(request.url());
  });
  page.on('websocket', (socket) => {
    socket.on('framesent', (frame) =>
      report.sentCommands.push(String(frame.payload).split(' ')[0]),
    );
    socket.on('framereceived', (frame) => {
      report.frames++;
      report.privmsgs += (String(frame.payload).match(/ PRIVMSG /g) || []).length;
    });
  });
  await page.goto(
    new URL(
      demo ? 'overlay.html?demo=1' : `overlay.html?channel=${encodeURIComponent(channel)}`,
      base,
    ).href,
  );
  if (gesture) {
    await page.locator('#start-audio').waitFor({ state: 'visible' });
    report.gateBeforeClick = await page.locator('#gate').isVisible();
    await page.locator('#start-audio').click();
  }
  await page.waitForFunction(
    (isDemo) =>
      document.querySelector('#connection').dataset.state === (isDemo ? 'demo' : 'connected') &&
      document.querySelector('#loading').hidden &&
      document.querySelector('#gate').hidden,
    demo,
    { timeout: 180000 },
  );
  report.timings.connectedMs = Date.now() - started;
  console.log(
    `[${label}] ${demo ? 'Demo ready' : 'Joined real Twitch chat'} after ${report.timings.connectedMs} ms`,
  );
  await page.waitForFunction(
    () =>
      window.__liveCheck.speech.some((audio) => audio.rms > 0.0001 && audio.state === 'running'),
    null,
    { timeout: 90000 },
  );
  report.timings.speechMs = Date.now() - started;
  await page.waitForFunction(() => window.__liveCheck.ended > 0, null, { timeout: 90000 });
  report.timings.endedMs = Date.now() - started;
  const state = await page.evaluate(() => ({
    status: document.querySelector('#connection').textContent.trim(),
    gateHidden: document.querySelector('#gate').hidden,
    loadingHidden: document.querySelector('#loading').hidden,
    playState: document.querySelector('#play-state').textContent,
    speakers: document.querySelectorAll('#cast .actor:not(.leaving)').length,
    audio: window.__liveCheck,
  }));
  Object.assign(report, state);
  if (!demo && !report.privmsgs) throw Error('No real Twitch PRIVMSG received');
  if (demo && report.frames) throw Error('Demo unexpectedly connected to Twitch');
  if (report.errors.length) throw Error('Browser errors captured');
  if (report.modelRequests.some((url) => /tsukuyomi/i.test(url)))
    throw Error('Unexpected voice model requested');
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  if (page)
    report.ui = await page
      .evaluate(() =>
        Object.fromEntries(
          ['connection', 'gate-title', 'gate-description', 'notice'].map((id) => [
            id,
            document.getElementById(id)?.textContent,
          ]),
        ),
      )
      .catch(() => 'unavailable');
  process.exitCode = 1;
} finally {
  await mkdir(new URL('../.artifacts/', import.meta.url), { recursive: true });
  if (page)
    await page
      .screenshot({
        path: fileURLToPath(new URL(`../.artifacts/${label}.png`, import.meta.url)),
      })
      .catch(() => {});
  await writeFile(
    new URL(`../.artifacts/${label}.json`, import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
