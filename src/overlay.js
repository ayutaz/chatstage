import { readOptions } from './config.js';
import { Preferences } from './preferences.js';
import { ChatController } from './controller.js';
import { SpeechQueue } from './queue.js';
import { LocalTTS, AudioPlayer } from './tts.js';
import { TwitchChat } from './twitch.js';
import { Stage } from './stage.js';
import { startDemo } from './demo.js';

const options = readOptions(location.search);
const preview = new URLSearchParams(location.search).get('preview') === '1';
const compareVoices = new URLSearchParams(location.search).get('voices') === '1';
const $ = (selector) => document.querySelector(selector);
const stage = new Stage(document);
let context,
  player,
  client,
  stopDemo,
  starting = false,
  started = false,
  destroyed = false,
  noticeTimer;
let storage;
try {
  storage = localStorage;
} catch {
  storage = null;
}
const prefs = new Preferences(options.demo ? '__demo__' : options.channel, storage);
const notice = (message) => {
  $('#notice').textContent = message;
  $('#notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    $('#notice').hidden = true;
  }, 8000);
};
const tts = new LocalTTS({
  onProgress: (info) => {
    $('#loading-detail').textContent = `CSS10 · ${info.message || info.stage}`;
    $('#load-progress').value = info.overall;
  },
});
const queue = new SpeechQueue({
  maxLength: options.queue,
  synthesize: (item) => tts.synthesize(item),
  play: (audio, item) => player.play(audio, item),
  onPauseChange: (paused) => (paused ? context?.suspend() : context?.resume()),
  onStart: (item, audio, handle) => {
    stage.lastItem = item;
    stage.start(item, audio, handle);
  },
  onEnd: () => stage.end(),
  onError: (error, item) => notice(`${item ? `${item.name}: ` : ''}${error.message}`),
  onChange: (state) => {
    $('#queue-count').textContent = `${state.waiting} in queue`;
    $('#play-state').textContent = state.paused
      ? 'PAUSED'
      : state.current
        ? 'ON THE MIC'
        : state.preparing
          ? 'PREPARING VOICE'
          : 'WAITING FOR CHAT';
    $('#dropped').hidden = !state.dropped;
    $('#dropped').textContent = `+${state.dropped} dropped`;
    $('#pause').textContent = state.paused ? 'Resume' : 'Pause';
  },
});
const controller = new ChatController({
  queue,
  prefs,
  options,
  onNotice: notice,
  onRemove: (predicate) => stage.remove(predicate),
});

function status(state, text) {
  $('#connection').dataset.state = state;
  $('#connection span').textContent = text;
}
if (options.demo) {
  document.body.classList.add('demo');
  stage.seed();
  $('.demo-heading').hidden = false;
  $('.demo-controls').hidden = false;
  $('#demo-label').hidden = false;
  if (compareVoices) $('#demo-label').textContent = 'EIGHT CSS10 VOICES';
  status('demo', 'Demo · no Twitch connection');
}
if (preview) document.body.classList.add('preview');
if (!options.demo && !options.channel) {
  $('#gate-title').textContent = 'Your stage needs a channel.';
  $('#gate-description').textContent =
    'Open the setup page to create your OBS URL, or try ?demo=1.';
  $('#start-audio').textContent = 'Open setup ↗';
  $('#start-audio').onclick = () => {
    location.href = 'index.html';
  };
  status('notice', 'No channel selected');
} else {
  $('#start-audio').onclick = () => void startAudio(true);
  // OBS permits autoplay. A normal browser with a suspended AudioContext
  // retains the click gate; no synthesis or queue playback begins until ready.
  try {
    context = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    if (context.state === 'running' && !preview) void startAudio(false);
  } catch (error) {
    notice(`Web Audio is unavailable: ${error.message}`);
  }
}
async function startAudio(userGesture) {
  if (starting || destroyed) return;
  if (started) {
    try {
      await context.resume();
      $('#gate').hidden = true;
    } catch (error) {
      notice(error.message);
    }
    return;
  }
  starting = true;
  try {
    if (!context || context.state === 'closed')
      context = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    if (userGesture || context.state !== 'running') await context.resume();
    if (context.state !== 'running') {
      starting = false;
      return;
    }
    player ||= new AudioPlayer(context, options.volume);
    $('#gate').hidden = true;
    $('#loading').hidden = false;
    await tts.initialize();
    if (destroyed) {
      tts.dispose();
      return;
    }
    $('#loading').hidden = true;
    started = true;
    starting = false;
    if (options.demo) {
      for (const id of [...stage.actors.keys()]) stage.leave(id);
      stopDemo = startDemo(
        (message) => controller.handle(message),
        options.channel || 'chatstage',
        compareVoices,
      );
    } else {
      client = new TwitchChat(options.channel, {
        onMessage: (m) => controller.handle(m),
        onStatus: status,
      });
      client.connect();
    }
    queue.start();
  } catch (error) {
    starting = false;
    $('#loading').hidden = true;
    $('#gate').hidden = false;
    $('#gate-title').textContent = 'The voices need another try.';
    $('#gate-description').textContent =
      'Check your connection and allow unpkg, jsDelivr, and Hugging Face. Then retry.';
    $('#start-audio').textContent = 'Retry audio ↗';
    notice(error.message);
  }
}
$('#pause').onclick = () => queue.setPaused(!queue.paused);
$('#skip').onclick = () => queue.skip();
$('#clear').onclick = () => {
  queue.clear();
  stage.remove(() => true);
  stage.resetBubble();
};
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== parent) return;
  if (event.data?.type === 'chatstage:volume' && Number.isFinite(Number(event.data.volume)))
    player?.setVolume(Number(event.data.volume));
});
context?.addEventListener('statechange', () => {
  if (started && context.state === 'suspended' && !queue.paused) {
    $('#gate').hidden = false;
    $('#start-audio').textContent = 'Resume audio ↗';
  }
});
window.addEventListener('pagehide', () => {
  destroyed = true;
  clearTimeout(noticeTimer);
  client?.disconnect();
  stopDemo?.();
  queue.enabled = false;
  queue.clear();
  tts.dispose();
  void context?.close();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});
