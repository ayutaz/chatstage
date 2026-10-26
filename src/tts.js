import { synthesisSettings } from './voices.js';
import { MODEL_LANGUAGES, LANGUAGES } from './config.js';

export async function loadRuntime() {
  const [{ PiperPlus }, ort] = await Promise.all([import('piper-plus'), import('onnxruntime-web')]);
  // GitHub Pages cannot set COOP/COEP. Single-thread WASM works without
  // SharedArrayBuffer and also works inside OBS's Chromium browser.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
  return { PiperPlus, ort };
}
export class LocalTTS {
  constructor({ onProgress = () => {}, loader = loadRuntime } = {}) {
    Object.assign(this, { onProgress, loader });
    this.engine = null;
    this.initializing = null;
  }
  initialize() {
    if (this.initializing) return this.initializing;
    this.initializing = this.load().catch((error) => {
      this.initializing = null;
      throw error;
    });
    return this.initializing;
  }
  async load() {
    if (this.engine) return;
    const { PiperPlus, ort } = await this.loader();
    // This is the only model permitted for chatter characters. Legacy model
    // options/URLs and stale per-message model fields cannot select another one.
    this.engine = await PiperPlus.initialize({
      model: 'css10',
      ort,
      wasmG2pUrl: 'https://unpkg.com/piper-plus@0.8.2/dist/rust-wasm/piper_plus_wasm.js',
      onProgress: (info) =>
        this.onProgress({
          ...info,
          model: 'css10',
          overall: info.stage === 'model' ? info.progress * 0.7 : info.stage === 'ready' ? 1 : 0.8,
        }),
    });
  }
  async synthesize(item) {
    await this.initialize();
    const engine = this.engine;
    if (!engine) throw new Error('The selected voice model is not loaded.');
    const supported = engine.config?.language_id_map
      ? Object.keys(engine.config.language_id_map)
      : MODEL_LANGUAGES;
    if (!supported.includes(item.language))
      throw new Error(
        `${LANGUAGES[item.language]} speech is unavailable in the CSS10 six-language model. Try !lang en or !lang ja.`,
      );
    const { lengthScale } = synthesisSettings(item.voice);
    // Explicitly disable Piper's automatic SSML parsing for untrusted chat.
    const result = await engine.synthesize(item.spokenText, {
      language: item.language,
      lengthScale,
      noiseScale: 0.4,
      noiseW: 0.5,
      ssml: false,
    });
    if (
      !(result.samples instanceof Float32Array) ||
      !result.samples.length ||
      !Number.isFinite(result.sampleRate) ||
      result.sampleRate <= 0
    )
      throw new Error('The local speech engine returned invalid audio.');
    return {
      samples: result.samples,
      sampleRate: result.sampleRate,
      duration: result.samples.length / result.sampleRate,
      timing: result.hasTimingInfo ? result.timing : null,
    };
  }
  dispose() {
    this.engine?.dispose();
    this.engine = null;
    this.initializing = null;
  }
}

export class AudioPlayer {
  constructor(context, volume = 0.8) {
    this.context = context;
    this.gain = context.createGain();
    this.gain.gain.value = volume;
    this.gain.connect(context.destination);
  }
  setVolume(value) {
    this.gain.gain.value = Math.max(0, Math.min(1, value));
  }
  play(audio, item) {
    const context = this.context;
    const buffer = context.createBuffer(1, audio.samples.length, audio.sampleRate);
    buffer.copyToChannel(audio.samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = item.voice.pitch;
    source.connect(this.gain);
    let done,
      stopped = false;
    const finished = new Promise((resolve) => {
      done = resolve;
    });
    const startedAt = context.currentTime;
    source.onended = () => {
      source.disconnect();
      done();
    };
    source.start();
    return {
      finished,
      elapsed: () => Math.max(0, context.currentTime - startedAt),
      stop: () => {
        if (!stopped) {
          stopped = true;
          source.stop();
          source.disconnect();
          done();
        }
      },
      pause: () => context.suspend(),
      resume: () => context.resume(),
    };
  }
}
