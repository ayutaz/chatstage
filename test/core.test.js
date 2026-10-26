import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIRC, IRCFramer, isModerator, canRead } from '../src/irc.js';
import { cleanText, removeEmotes } from '../src/text.js';
import { detectLanguage, chooseLanguage } from '../src/language.js';
import { voiceFor, VOICES, synthesisSettings } from '../src/voices.js';
import { Preferences } from '../src/preferences.js';
import { ChatController } from '../src/controller.js';
import { visemeFor, timingFrame } from '../src/visemes.js';
import { readOptions, overlayURL } from '../src/config.js';

let sequence = 0;
const chat = (text, tags = '', login = 'alice') =>
  parseIRC(
    `@user-id=42;id=auto${++sequence};display-name=Alice;${tags} :${login}!${login}@host PRIVMSG #room :${text}`,
  );
test('IRC parses tags, escapes, badges, emotes, and colons in trailing text', () => {
  const m = chat(
    'hello : world',
    'display-name=Alice\\sCat;badges=subscriber/12,vip/1;emotes=25:0-4,6-10/1902:12-16;color=#FF00FF',
  );
  assert.equal(m.text, 'hello : world');
  assert.equal(m.tags['display-name'], 'Alice Cat');
  assert.equal(m.login, 'alice');
  assert.equal(m.channel, 'room');
  assert.deepEqual(m.badges, { subscriber: '12', vip: '1' });
  assert.deepEqual(m.emotes, [
    { id: '25', start: 0, end: 4 },
    { id: '25', start: 6, end: 10 },
    { id: '1902', start: 12, end: 16 },
  ]);
  assert.equal(parseIRC('@x=a\\:b\\\\c\\rd\\ne :server NOTICE #room :ok').tags.x, 'a;b\\c\rd\ne');
});
test('IRC handles moderation, ping, malformed input, and fragmented frames', () => {
  const ban = parseIRC('@ban-duration=60;target-user-id=42 :tmi.twitch.tv CLEARCHAT #room :alice');
  assert.equal(ban.command, 'CLEARCHAT');
  assert.equal(ban.tags['target-user-id'], '42');
  assert.equal(
    parseIRC('@target-msg-id=m1 :tmi.twitch.tv CLEARMSG #room :bad').tags['target-msg-id'],
    'm1',
  );
  assert.equal(parseIRC('PING :tmi.twitch.tv').text, 'tmi.twitch.tv');
  assert.equal(parseIRC(''), null);
  assert.equal(parseIRC('@broken'), null);
  const framer = new IRCFramer();
  assert.equal(framer.push('PING :tmi\r').length, 0);
  assert.equal(framer.push('\n:server RECONNECT\r\n').length, 2);
});
test('roles trust Twitch badges and mod tags, not a display name', () => {
  assert.equal(isModerator(chat('x', 'mod=1')), true);
  assert.equal(isModerator(chat('x', 'badges=broadcaster/1')), true);
  assert.equal(isModerator(chat('x', 'display-name=moderator')), false);
  assert.equal(canRead(chat('x', 'subscriber=1'), 'subs'), true);
  assert.equal(canRead(chat('x', 'badges=vip/1'), 'vips'), true);
  assert.equal(canRead(chat('x'), 'subs'), false);
  assert.equal(canRead(chat('x', 'mod=1'), 'subs'), true);
});
test('emote positions are inclusive Unicode code points, before normalization', () => {
  assert.equal(removeEmotes('😀 Kappa hi', [{ start: 2, end: 6 }]), '😀   hi');
  assert.equal(cleanText('😀 Kappa hi', { emotes: [{ start: 2, end: 6 }] }), 'hi');
  assert.equal(
    removeEmotes('Kappa Kappa', [
      { start: 0, end: 4 },
      { start: 6, end: 10 },
    ]).trim(),
    '',
  );
});
test('cleaning removes URLs, emoji sequences, controls and excessive repetition', () => {
  assert.equal(
    cleanText('hello https://example.com/a?q=1 👨‍👩‍👧‍👦 wwwwwww 888888 草草草草'),
    'hello link www 888 草草草',
  );
  assert.equal(cleanText('go www.example.com now'), 'go link now');
  assert.equal(cleanText('ＡＢＣ\u0000\u202E  hi'), 'ABC hi');
  assert.equal(cleanText('👍🏽🇯🇵1️⃣'), '');
  assert.equal(cleanText('!other bot'), '');
  assert.equal(cleanText('abcdef', { maxLength: 4 }), 'abcd');
  assert.equal(cleanText('あいうえお', { maxLength: 3 }), 'あいう');
});
test('language uses scripts and confident Latin heuristics with sticky override', () => {
  assert.equal(detectLanguage('Olá!'), 'pt');
  assert.equal(detectLanguage('você'), 'pt');
  for (const [text, expected] of [
    ['今日は楽しい', 'ja'],
    ['안녕하세요', 'ko'],
    ['你好世界', 'zh'],
    ['Hello everyone', 'en'],
    ['¡Hola amigos!', 'es'],
    ['Bonjour à tous', 'fr'],
    ['Olá, obrigado!', 'pt'],
    ['Hej, tack så mycket', 'sv'],
  ])
    assert.equal(detectLanguage(text), expected, text);
  assert.equal(chooseLanguage('bonjour', 'ja', 'en'), 'ja');
  assert.equal(chooseLanguage('123', null, 'pt'), 'pt');
  assert.equal(chooseLanguage('hello', null, 'ja'), 'en');
});
test('voices are stable, bounded, distinct, and pitch compensation preserves pace', () => {
  assert.deepEqual(voiceFor('42'), voiceFor('42'));
  assert.equal(new Set(Array.from({ length: 100 }, (_, i) => voiceFor(String(i)).id)).size, 8);
  assert.equal(voiceFor('42', 3).id, 3);
  assert.equal(voiceFor('42', 3, 'css10').model, 'css10');
  assert.equal(VOICES.length, 8);
  for (const voice of VOICES) {
    const s = synthesisSettings(voice);
    assert.equal(s.playbackRate, voice.pitch);
    assert.ok(Math.abs(s.lengthScale / s.playbackRate - 1.5 / voice.speed) < 1e-9);
  }
});
test('preferences persist per channel, migrate login to id, and survive broken storage', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k), setItem: (k, v) => data.set(k, v) };
  const prefs = new Preferences('room', storage);
  prefs.update('alice', 'alice', { language: 'fr', quiet: true });
  assert.equal(prefs.get('42', 'alice').language, 'fr');
  prefs.update('42', 'alice', { voice: 8 });
  assert.equal(new Preferences('room', storage).get('42', 'alice').voice, 8);
  assert.equal(new Preferences('other', storage).get('42', 'alice').voice, undefined);
  assert.doesNotThrow(() =>
    new Preferences('room', {
      getItem() {
        throw Error();
      },
      setItem() {
        throw Error();
      },
    }).update('42', 'alice', { quiet: true }),
  );
});

function harness() {
  const queued = [];
  const actions = [];
  const queue = {
    enqueue: (m) => queued.push(m),
    remove: (fn) => {
      for (let i = queued.length - 1; i >= 0; i--) if (fn(queued[i])) queued.splice(i, 1);
    },
    skip: () => actions.push('skip'),
    clear: () => {
      queued.length = 0;
      actions.push('clear');
    },
    setPaused: (x) => actions.push(x ? 'pause' : 'resume'),
  };
  const prefs = new Preferences('room', null);
  const controller = new ChatController({ queue, prefs, options: readOptions('channel=room') });
  return { controller, prefs, queued, actions };
}
test('viewer commands are consumed, validated, sticky; quiet removes existing lines', () => {
  const h = harness();
  h.controller.handle(chat('!voice 3'));
  h.controller.handle(chat('!lang fr'));
  h.controller.handle(chat('hello'));
  assert.equal(h.queued[0].voice.id, 3);
  assert.equal(h.queued[0].language, 'fr');
  h.controller.handle(chat('!quiet'));
  assert.equal(h.queued.length, 0);
  h.controller.handle(chat('not read'));
  assert.equal(h.queued.length, 0);
  h.controller.handle(chat('!quiet off'));
  h.controller.handle(chat('!voice 99'));
  h.controller.handle(chat('!lang zz'));
  h.controller.handle(chat('!other'));
  assert.equal(h.prefs.get('42', 'alice').voice, 3);
  assert.equal(h.prefs.get('42', 'alice').language, 'fr');
  h.controller.handle(chat('!voice random'));
  assert.ok(h.prefs.get('42', 'alice').voice >= 1 && h.prefs.get('42', 'alice').voice <= 8);
});
test('only moderators control playback and persistent muting', () => {
  const h = harness();
  for (const command of ['!skip', '!pause', '!resume', '!clear', '!ttsmute alice'])
    h.controller.handle(chat(command));
  assert.equal(h.actions.length, 0);
  for (const command of ['!skip', '!pause', '!resume', '!clear'])
    h.controller.handle(chat(command, 'mod=1'));
  assert.deepEqual(h.actions, ['skip', 'pause', 'resume', 'clear']);
  h.controller.handle(chat('!ttsmute alice', 'badges=broadcaster/1'));
  h.controller.handle(chat('not read'));
  assert.equal(h.queued.length, 0);
  h.controller.handle(chat('!quiet off'));
  h.controller.handle(chat('still not read'));
  assert.equal(h.queued.length, 0);
  h.controller.handle(chat('!ttsunmute alice', 'mod=1'));
  h.controller.handle(chat('read'));
  assert.equal(h.queued.length, 1);
});
test('moderation drops queued/current by id or login, clear-all, and deduplicates', () => {
  const h = harness();
  h.controller.handle(chat('hello', 'id=m1'));
  h.controller.handle(chat('hello', 'id=m1'));
  assert.equal(h.queued.length, 1);
  h.controller.handle(parseIRC('@target-msg-id=m1 :tmi CLEARMSG #room :hello'));
  assert.equal(h.queued.length, 0);
  h.controller.handle(chat('next', 'id=m2'));
  h.controller.handle(parseIRC('@target-user-id=42 :tmi CLEARCHAT #room :alice'));
  assert.equal(h.queued.length, 0);
  h.controller.handle(chat('next', 'id=m3'));
  h.controller.handle(parseIRC(':tmi CLEARCHAT #room'));
  assert.equal(h.queued.length, 0);
});
test('captions and visemes use audio time adjusted for pitch, with closed silences', () => {
  for (const [p, v] of [
    ['a', 'A'],
    ['I', 'I'],
    ['ɯ', 'U'],
    ['ɔ', 'O'],
    ['m', 'M'],
    ['sh', 'S'],
    ['^', 'rest'],
    ['ph_123', 'rest'],
  ])
    assert.equal(visemeFor(p), v);
  const timing = {
    phonemes: [
      { phoneme: 'a', start_ms: 100, end_ms: 300 },
      { phoneme: 'i', start_ms: 300, end_ms: 500 },
    ],
  };
  assert.equal(timingFrame(timing, 0.1, 2, 10, 0.6).viseme, 'A');
  assert.equal(timingFrame(timing, 0.2, 2, 10, 0.6).viseme, 'I');
  assert.equal(timingFrame(timing, 0, 1, 10, 0.6).viseme, 'rest');
  assert.equal(timingFrame(timing, 1, 1, 10, 0.6).viseme, 'rest');
  assert.equal(timingFrame(null, 0.3, 1, 10, 0.6).viseme, 'rest');
});
test('URL options clamp unsafe values and preserve nested Pages paths', () => {
  const options = readOptions(
    'channel=%23My_Room&volume=9&maxLength=-3&queue=999&language=xx&models=nope',
  );
  assert.equal(options.channel, 'my_room');
  assert.equal(options.volume, 1);
  assert.equal(options.maxLength, 20);
  assert.equal(options.queue, 100);
  assert.equal(options.language, 'en');
  assert.equal(readOptions('channel=bad%0AJOIN').channel, '');
  const url = overlayURL('https://example.com/project/index.html', {
    ...options,
    channel: 'alice',
  });
  assert.equal(new URL(url).pathname, '/project/overlay.html');
  assert.equal(new URL(url).searchParams.get('channel'), 'alice');
});
