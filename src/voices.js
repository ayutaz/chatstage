export function hash(value) {
  let result = 2166136261;
  for (const c of String(value).toLowerCase()) {
    result ^= c.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
export const VOICES = [
  ['Velvet', 0.8, 0.88],
  ['Peach', 1.08, 1.06],
  ['Pip', 1.3, 1.13],
  ['Moon', 0.94, 0.84],
  ['Cedar', 0.87, 1.02],
  ['Sunny', 1.15, 0.96],
  ['Pixel', 1.22, 1.18],
  ['Moss', 1.01, 0.91],
].map(([name, pitch, speed], i) =>
  Object.freeze({ id: i + 1, name, model: 'css10', pitch, speed }),
);
export function voiceFor(identity, selected) {
  const base =
    VOICES[
      Number.isInteger(selected) && selected >= 1 && selected <= 8
        ? selected - 1
        : hash(identity) % 8
    ];
  return { ...base };
}
export function synthesisSettings(voice) {
  // Synthesize proportionally longer, then speed playback up to shift pitch
  // without also accelerating the chatter's chosen overall speaking pace.
  return { lengthScale: (1.5 * voice.pitch) / voice.speed, playbackRate: voice.pitch };
}
