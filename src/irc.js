const ESCAPES = { s: ' ', ':': ';', r: '\r', n: '\n', '\\': '\\' };
export function parseIRC(line) {
  if (!line || typeof line !== 'string') return null;
  let rest = line.replace(/[\r\n]+$/, '');
  const tags = Object.create(null);
  if (rest.startsWith('@')) {
    const end = rest.indexOf(' ');
    if (end < 0) return null;
    for (const part of rest.slice(1, end).split(';')) {
      const index = part.indexOf('=');
      tags[index < 0 ? part : part.slice(0, index)] = (
        index < 0 ? '' : part.slice(index + 1)
      ).replace(/\\(.)/g, (_, c) => ESCAPES[c] ?? c);
    }
    rest = rest.slice(end + 1).trimStart();
  }
  let prefix = '';
  if (rest.startsWith(':')) {
    const end = rest.indexOf(' ');
    if (end < 0) return null;
    prefix = rest.slice(1, end);
    rest = rest.slice(end + 1);
  }
  const index = rest.indexOf(' :');
  const text = index < 0 ? '' : rest.slice(index + 2);
  const [command, ...params] = (index < 0 ? rest : rest.slice(0, index)).trim().split(/ +/);
  if (!/^[A-Z0-9]+$/.test(command)) return null;
  const badges = Object.fromEntries(
    (tags.badges || '')
      .split(',')
      .filter(Boolean)
      .map((b) => b.split('/')),
  );
  const emotes = [];
  for (const group of (tags.emotes || '').split('/')) {
    const [id, positions] = group.split(':');
    for (const range of (positions || '').split(',')) {
      if (!/^\d+-\d+$/.test(range)) continue;
      const [start, end] = range.split('-').map(Number);
      if (end >= start) emotes.push({ id, start, end });
    }
  }
  return {
    command,
    tags,
    prefix,
    params,
    text,
    badges,
    emotes,
    login: prefix.split('!')[0].toLowerCase(),
    channel: (params.find((p) => p.startsWith('#')) || '').slice(1).toLowerCase(),
  };
}
export class IRCFramer {
  buffer = '';
  push(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split('\r\n');
    this.buffer = lines.pop();
    if (this.buffer.length > 65536) this.buffer = '';
    return lines.map(parseIRC).filter(Boolean);
  }
}
export function isModerator(message) {
  return (
    message.tags.mod === '1' ||
    Object.hasOwn(message.badges, 'moderator') ||
    Object.hasOwn(message.badges, 'broadcaster')
  );
}
export function canRead(message, audience) {
  if (audience === 'everyone' || isModerator(message)) return true;
  if (audience === 'subs')
    return (
      message.tags.subscriber === '1' ||
      Object.hasOwn(message.badges, 'subscriber') ||
      Object.hasOwn(message.badges, 'founder')
    );
  return Object.hasOwn(message.badges, 'vip');
}
