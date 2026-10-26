export function hash(value) {
  let result = 2166136261;
  for (const c of String(value).toLowerCase()) {
    result ^= c.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
export const VOICES = [
  ['Velvet', 'tsukuyomi', 0.85, 0.96],
  ['Peach', 'tsukuyomi', 1, 1.03],
  ['Pip', 'tsukuyomi', 1.18, 1.08],
  ['Moon', 'tsukuyomi', 0.94, 0.9],
  ['Cedar', 'css10', 0.82, 0.96],
  ['Sunny', 'css10', 1.04, 1.03],
  ['Pixel', 'css10', 1.2, 1.1],
  ['Moss', 'css10', 0.93, 0.9],
].map(([name, model, pitch, speed], i) => Object.freeze({ id: i + 1, name, model, pitch, speed }));
export function voiceFor(identity, selected, models = 'both') {
  const base =
    VOICES[
      Number.isInteger(selected) && selected >= 1 && selected <= 8
        ? selected - 1
        : hash(identity) % 8
    ];
  return { ...base, model: models === 'both' ? base.model : models };
}
export function synthesisSettings(voice) {
  // Synthesize proportionally longer, then speed playback up to shift pitch
  // without also accelerating the chatter's chosen overall speaking pace.
  return { lengthScale: (1.5 * voice.pitch) / voice.speed, playbackRate: voice.pitch };
}
