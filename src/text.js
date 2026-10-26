// Twitch emote offsets are inclusive Unicode code-point positions, not JS UTF-16 offsets.
export function removeEmotes(text, ranges = []) {
  const chars = Array.from(text);
  const removed = new Set();
  for (const { start, end } of ranges) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) continue;
    for (let i = start; i <= Math.min(end, chars.length - 1); i++) removed.add(i);
  }
  return chars.map((c, i) => (removed.has(i) ? (removed.has(i - 1) ? '' : ' ') : c)).join('');
}
export function cleanText(text, { emotes = [], maxLength = 180 } = {}) {
  if (String(text).trimStart().startsWith('!')) return '';
  return Array.from(
    removeEmotes(String(text), emotes)
      .replace(/\x01ACTION ([\s\S]*?)\x01/g, '$1')
      .normalize('NFKC')
      .replace(/(?:https?:\/\/|www\.)[^\s<>]+/giu, 'link')
      .replace(/[0-9#*]\uFE0F?\u20E3/gu, '')
      .replace(
        /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u200D\u{E0020}-\u{E007F}]/gu,
        '',
      )
      .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, '')
      .replace(/(.)\1{3,}/gu, '$1$1$1')
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .slice(0, maxLength)
    .join('')
    .trim();
}
