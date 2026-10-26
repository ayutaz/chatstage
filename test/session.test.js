import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OverlaySession } from '../src/session.js';

test('OBS autoplay prepares audio and starts chat and queue with no gesture', async () => {
  const calls = [];
  const session = new OverlaySession({
    prepareAudio: async (gesture) => {
      calls.push(['audio', gesture]);
      return true;
    },
    resumeAudio: async () => calls.push(['resume']),
    onReady: () => calls.push(['queue']),
    startChat: () => calls.push(['chat']),
  });
  await session.start(false);
  assert.equal(session.audioReady, true);
  assert.equal(session.chatReady, true);
  assert.deepEqual(calls, [['audio', false], ['queue'], ['chat']]);
  await session.start(true);
  assert.deepEqual(calls.slice(3), [['resume'], ['queue']]);
});

test('chat startup failure is not a TTS failure, and retry reuses the ready engine', async () => {
  let prepared = 0,
    chatAttempts = 0,
    queueStarts = 0;
  const chatErrors = [],
    audioErrors = [];
  const session = new OverlaySession({
    prepareAudio: async () => {
      prepared++;
      return true;
    },
    resumeAudio: async () => {},
    onReady: () => queueStarts++,
    startChat: () => {
      if (++chatAttempts === 1) throw Error('chat startup failed');
    },
    onAudioError: (error) => audioErrors.push(error),
    onChatError: (error) => chatErrors.push(error),
  });
  await session.start(false);
  assert.equal(session.audioReady, true);
  assert.equal(session.chatReady, false);
  assert.equal(audioErrors.length, 0);
  assert.equal(chatErrors.length, 1);
  assert.equal(queueStarts, 1);
  await session.start(true);
  assert.equal(prepared, 1);
  assert.equal(chatAttempts, 2);
  assert.equal(session.chatReady, true);
});

test('actual TTS failure retries preparation and never starts chat prematurely', async () => {
  let attempts = 0,
    chats = 0;
  const errors = [];
  const session = new OverlaySession({
    prepareAudio: async () => {
      if (++attempts === 1) throw Error('model download failed');
      return true;
    },
    startChat: () => chats++,
    onAudioError: (error) => errors.push(error),
  });
  await session.start(false);
  assert.equal(session.audioReady, false);
  assert.equal(chats, 0);
  await session.start(true);
  assert.equal(attempts, 2);
  assert.equal(chats, 1);
  assert.equal(errors.length, 1);
});

test('blocked audio waits for a gesture; concurrent starts initialize only once', async () => {
  let preparations = 0,
    chats = 0,
    resolve;
  const session = new OverlaySession({
    prepareAudio: (gesture) => {
      preparations++;
      if (!gesture) return false;
      return new Promise((done) => {
        resolve = done;
      });
    },
    startChat: () => chats++,
  });
  await session.start(false);
  assert.equal(chats, 0);
  const first = session.start(true);
  const second = session.start(true);
  assert.equal(preparations, 2);
  resolve(true);
  await Promise.all([first, second]);
  assert.equal(chats, 1);
});

test('leaving while TTS loads never starts a late socket or queue', async () => {
  let resolve,
    destroyed = false,
    started = false;
  const session = new OverlaySession({
    prepareAudio: () =>
      new Promise((done) => {
        resolve = done;
      }),
    isDestroyed: () => destroyed,
    startChat: () => {
      started = true;
    },
    onReady: () => {
      started = true;
    },
  });
  const pending = session.start(false);
  destroyed = true;
  resolve(true);
  await pending;
  assert.equal(started, false);
});
