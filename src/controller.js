import { canRead, isModerator } from './irc.js';
import { cleanText } from './text.js';
import { chooseLanguage } from './language.js';
import { voiceFor } from './voices.js';
import { LANGUAGES } from './config.js';
export class ChatController {
  constructor({ queue, prefs, options, onNotice = () => {}, onRemove = () => {} }) {
    Object.assign(this, { queue, prefs, options, onNotice, onRemove });
    this.seen = new Set();
  }
  remove(predicate) {
    this.queue.remove(predicate);
    this.onRemove(predicate);
  }
  handle(m) {
    if (!m || (m.channel && m.channel !== (this.options.channel || 'chatstage'))) return;
    if (m.command === 'CLEARMSG') {
      const id = m.tags['target-msg-id'];
      if (id) this.remove((item) => item.id === id);
      return;
    }
    if (m.command === 'CLEARCHAT') {
      const id = m.tags['target-user-id'];
      const login = m.text.toLowerCase();
      if (id || login)
        this.remove((item) => (id && item.userId === id) || (login && item.login === login));
      else {
        this.queue.clear();
        this.onRemove(() => true);
      }
      this.onNotice(login ? `${login} removed by Twitch moderation` : 'Chat cleared by Twitch');
      return;
    }
    if (m.command !== 'PRIVMSG') return;
    const id = m.tags.id;
    if (id) {
      if (this.seen.has(id)) return;
      this.seen.add(id);
      if (this.seen.size > 3000) this.seen.delete(this.seen.values().next().value);
    }
    const userId = m.tags['user-id'] || m.login;
    const prefs = this.prefs.get(userId, m.login);
    if (m.text.trimStart().startsWith('!')) {
      this.command(m, userId, prefs);
      return;
    }
    if (prefs.quiet || this.prefs.muted.has(m.login) || !canRead(m, this.options.audience)) return;
    const text = cleanText(m.text, { emotes: m.emotes, maxLength: this.options.maxLength });
    if (!text || !/[\p{L}\p{N}]/u.test(text)) return;
    const name = cleanText(m.tags['display-name'] || m.login, { maxLength: 30 }) || m.login;
    this.queue.enqueue({
      id: id || globalThis.crypto.randomUUID(),
      userId,
      login: m.login,
      name,
      text,
      spokenText: this.options.readNames ? `${name}: ${text}` : text,
      color: /^#[0-9a-f]{6}$/i.test(m.tags.color) ? m.tags.color : null,
      language: chooseLanguage(text, prefs.language, this.options.language),
      voice: voiceFor(userId, prefs.voice),
      readNames: this.options.readNames,
    });
  }
  command(m, userId, prefs) {
    const [command, ...args] = m.text.trim().toLowerCase().split(/\s+/);
    const arg = args[0];
    const patch = (p) => this.prefs.update(userId, m.login, p);
    if (command === '!voice' && args.length === 1 && (/^[1-8]$/.test(arg) || arg === 'random')) {
      patch({ voice: arg === 'random' ? 1 + Math.floor(Math.random() * 8) : Number(arg) });
      this.onNotice(`${m.login} changed voice`);
    } else if (
      command === '!lang' &&
      args.length === 1 &&
      (Object.hasOwn(LANGUAGES, arg) || arg === 'auto')
    ) {
      patch({ language: arg === 'auto' ? undefined : arg });
      this.onNotice(`${m.login} language: ${arg}`);
    } else if (command === '!quiet' && args.length <= 1 && (!arg || ['on', 'off'].includes(arg))) {
      const quiet = arg ? arg === 'on' : !prefs.quiet;
      patch({ quiet });
      if (quiet) this.remove((item) => item.userId === userId || item.login === m.login);
      this.onNotice(`${m.login}: ${quiet ? 'voice off' : 'voice on'}`);
    } else if (isModerator(m)) {
      if (command === '!skip') {
        this.queue.skip();
        this.onNotice('Skipped by a moderator');
      }
      if (command === '!pause') {
        this.queue.setPaused(true);
        this.onNotice('Stage paused');
      }
      if (command === '!resume') {
        this.queue.setPaused(false);
        this.onNotice('Stage resumed');
      }
      if (command === '!clear') {
        this.queue.clear();
        this.onRemove(() => true);
        this.onNotice('Stage cleared');
      }
      if (['!ttsmute', '!ttsunmute'].includes(command) && /^[a-z0-9_]{1,25}$/.test(arg || '')) {
        this.prefs.mute(arg, command === '!ttsmute');
        if (command === '!ttsmute') this.remove((item) => item.login === arg);
        this.onNotice(`${arg}: ${command === '!ttsmute' ? 'muted' : 'unmuted'} by a moderator`);
      }
    }
  }
}
