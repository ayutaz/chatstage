export function visemeFor(phoneme = '') {
  if (['^', '$', '_', 'pau', 'sil', 'cl', 'q'].includes(phoneme)) return 'rest';
  const p = phoneme.normalize('NFD').replace(/[\p{M}ːˈˌ˥˦˧˨˩0-9]/gu, '');
  if (/^[aɑɐæʌ]/i.test(p)) return 'A';
  if (/^[iɪɨy]/i.test(p)) return 'I';
  if (/^[uɯʊʉ]/i.test(p)) return 'U';
  if (/^[eɛəɜøœ]/i.test(p)) return 'E';
  if (/^[oɔɒ]/i.test(p)) return 'O';
  if (/^(m|b|p|N|n|ŋ|ɲ)$/.test(p)) return 'M';
  if (/^(s|sh|z|zh|ʃ|ʒ|ɕ|ʑ|f|v|θ|ð)/.test(p)) return 'S';
  if (/^(t|d|ch|ts|k|g|r|ɾ|l|h|w|j)/.test(p)) return 'E';
  return 'rest';
}
export function timingFrame(timing, seconds, rate, charCount, duration) {
  const ms = Math.max(0, seconds * rate * 1000);
  const phonemes = timing?.phonemes || [];
  // Binary search each frame instead of scheduling stale timeouts. AudioContext
  // time freezes when paused, and playbackRate is included in the clock.
  let lo = 0,
    hi = phonemes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (phonemes[mid].end_ms <= ms) lo = mid + 1;
    else hi = mid;
  }
  const p = phonemes[lo];
  const active = p && ms >= p.start_ms && ms < p.end_ms;
  const total = duration * 1000;
  const progress = total > 0 ? Math.min(1, ms / total) : 0;
  return {
    viseme: active ? visemeFor(p.phoneme) : 'rest',
    phoneme: active ? p.phoneme : '',
    // Piper exposes phonemes, not character/word alignments. Use the current
    // phoneme boundary for approximate text progress; don't claim word alignment.
    highlight: Math.floor(
      charCount *
        (phonemes.length && total > 0 ? Math.min(1, (p?.start_ms ?? ms) / total) : progress),
    ),
    progress,
  };
}
