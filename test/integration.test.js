import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TwitchChat } from '../src/twitch.js';
import { LocalTTS, AudioPlayer } from '../src/tts.js';
import { voiceFor } from '../src/voices.js';

test('native browser timers retain their Window receiver through watchdog and reconnect', (t) => {
  const timers = [];
  const cancelled = [];
  t.mock.method(globalThis, 'setTimeout', function (callback, delay) {
    assert.equal(this, globalThis, 'Window.setTimeout requires its host receiver');
    const timer = { callback, delay };
    timers.push(timer);
    return timer;
  });
  t.mock.method(globalThis, 'clearTimeout', function (timer) {
    assert.equal(this, globalThis, 'Window.clearTimeout requires its host receiver');
    cancelled.push(timer);
  });
  const sockets = [];
  class Socket {
    constructor() {
      sockets.push(this);
    }
    send() {}
    close() {
      this.onclose?.();
    }
  }
  const client = new TwitchChat('room', { WebSocketClass: Socket, random: () => 0 });
  client.connect();
  sockets[0].onopen();
  sockets[0].onmessage({ data: ':server ROOMSTATE #room\r\n' });
  assert.ok(cancelled.includes(timers[0]));
  sockets[0].close();
  assert.equal(timers.at(-1).delay, 1000);
  timers.at(-1).callback();
  assert.equal(sockets.length, 2);
  client.disconnect();
  assert.ok(cancelled.includes(timers[2]));
});

test('anonymous Twitch handshake, PONG, join status, backoff, shutdown', () => {
  const sockets = [],
    scheduled = [],
    statuses = [],
    messages = [];
  class Socket {
    constructor(url) {
      this.url = url;
      this.sent = [];
      sockets.push(this);
    }
    send(line) {
      this.sent.push(line);
    }
    close() {
      this.onclose?.();
    }
  }
  const client = new TwitchChat('room', {
    WebSocketClass: Socket,
    random: () => 0,
    schedule: (callback, delay) => {
      const task = { callback, delay };
      scheduled.push(task);
      return task;
    },
    cancel: (task) => {
      if (task) task.cancelled = true;
    },
    onStatus: (...s) => statuses.push(s),
    onMessage: (m) => messages.push(m),
  });
  client.connect();
  const socket = sockets[0];
  socket.onopen();
  assert.equal(socket.url, 'wss://irc-ws.chat.twitch.tv:443');
  assert.deepEqual(socket.sent, [
    'CAP REQ :twitch.tv/tags twitch.tv/commands\r\n',
    'PASS SCHMOOPIIE\r\n',
    'NICK justinfan100000000\r\n',
    'JOIN #room\r\n',
  ]);
  socket.onmessage({ data: 'PING :tmi.twitch.tv\r\n:server 366 user #room :End\r\n' });
  assert.equal(socket.sent.at(-1), 'PONG :tmi.twitch.tv\r\n');
  assert.equal(statuses.at(-1)[0], 'connected');
  assert.equal(scheduled[0].cancelled, true);
  socket.onmessage({ data: ':server ROOMSTATE #room\r\n' });
  assert.equal(statuses.filter(([state]) => state === 'connected').length, 1);
  socket.close();
  assert.equal(scheduled.at(-1).delay, 1000);
  scheduled.at(-1).callback();
  sockets[1].close();
  assert.equal(scheduled.at(-1).delay, 2000);
  client.disconnect();
  assert.equal(scheduled.at(-1).cancelled, true);
  assert.throws(() => new TwitchChat('bad\r\nJOIN #evil'), /valid/);
});
test('TTS uses verified public API, progress, real sample rate, explicit plain text and language guard', async () => {
  const init = [],
    synth = [],
    progress = [];
  const tts = new LocalTTS({
    models: 'tsukuyomi', // An obsolete caller must still initialize only CSS10.
    onProgress: (p) => progress.push(p),
    loader: async () => ({
      ort: {},
      PiperPlus: {
        initialize: async (options) => {
          init.push(options);
          options.onProgress({ stage: 'ready', progress: 1 });
          return {
            config: { language_id_map: { ja: 0, en: 1 } },
            synthesize: async (text, options) => {
              synth.push({ text, options });
              return {
                samples: new Float32Array(24000),
                sampleRate: 24000,
                hasTimingInfo: true,
                timing: { phonemes: [] },
              };
            },
            dispose() {},
          };
        },
      },
    }),
  });
  await Promise.all([tts.initialize(), tts.initialize()]);
  assert.equal(init.length, 1);
  assert.equal(init[0].model, 'css10');
  assert.match(init[0].wasmG2pUrl, /unpkg/);
  const item = { spokenText: '<speak>Hello</speak>', language: 'en', voice: voiceFor('x', 3) };
  const result = await tts.synthesize(item);
  assert.equal(synth[0].options.ssml, false);
  assert.equal(result.duration, 1);
  assert.equal(result.sampleRate, 24000);
  assert.equal(progress.at(-1).overall, 1);
  for (let id = 1; id <= 8; id++) await tts.synthesize({ ...item, voice: voiceFor('x', id) });
  assert.equal(init.length, 1);
  assert.equal(synth.length, 9);
  await assert.rejects(tts.synthesize({ ...item, language: 'ko' }), /unavailable/);
});
test('audio playback uses PCM rate, gain, playbackRate, and actual audio clock', async () => {
  const source = {
    playbackRate: {},
    connect() {},
    disconnect() {},
    start() {
      this.started = true;
    },
    stop() {
      this.onended();
    },
  };
  const context = {
    currentTime: 10,
    createGain: () => ({ gain: {}, connect() {} }),
    createBuffer: (channels, length, rate) => {
      assert.equal(rate, 24000);
      assert.equal(length, 2);
      return { copyToChannel() {} };
    },
    createBufferSource: () => source,
    suspend: () => 'paused',
    resume: () => 'resumed',
  };
  const player = new AudioPlayer(context, 0.7);
  const handle = player.play(
    { samples: new Float32Array(2), sampleRate: 24000 },
    { voice: { pitch: 1.2 } },
  );
  assert.equal(source.playbackRate.value, 1.2);
  assert.equal(player.gain.gain.value, 0.7);
  context.currentTime = 10.25;
  assert.equal(handle.elapsed(), 0.25);
  assert.equal(handle.pause(), 'paused');
  assert.equal(handle.resume(), 'resumed');
  handle.stop();
  await handle.finished;
});
