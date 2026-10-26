const validLogin = (value) => /^[a-z0-9_]{1,25}$/.test(value);
export class Preferences {
  constructor(channel, storage) {
    this.storage = storage;
    this.key = `chatstage:v1:${channel}`;
    this.users = new Map();
    this.muted = new Set();
    try {
      const saved = JSON.parse(storage?.getItem(this.key) || '{}');
      for (const [id, p] of (Array.isArray(saved.users) ? saved.users : []).slice(-2000)) {
        if (typeof id === 'string' && p && typeof p === 'object')
          this.users.set(id, this.sanitize(p));
      }
      this.muted = new Set((Array.isArray(saved.muted) ? saved.muted : []).filter(validLogin));
    } catch {
      /* OBS private storage can be unavailable; in-memory still works. */
    }
  }
  sanitize(p) {
    return {
      voice: Number.isInteger(p.voice) && p.voice >= 1 && p.voice <= 8 ? p.voice : undefined,
      language: ['en', 'ja', 'zh', 'ko', 'es', 'fr', 'pt', 'sv'].includes(p.language)
        ? p.language
        : undefined,
      quiet: p.quiet === true,
    };
  }
  get(id, login) {
    return this.users.get(String(id)) || this.users.get(login) || {};
  }
  update(id, login, patch) {
    const next = this.sanitize({ ...this.get(id, login), ...patch });
    this.users.delete(login);
    this.users.delete(String(id));
    this.users.set(String(id), next);
    while (this.users.size > 2000) this.users.delete(this.users.keys().next().value);
    this.save();
    return next;
  }
  mute(login, muted) {
    if (validLogin(login)) {
      muted ? this.muted.add(login) : this.muted.delete(login);
      this.save();
    }
  }
  save() {
    try {
      this.storage?.setItem(
        this.key,
        JSON.stringify({ users: [...this.users], muted: [...this.muted] }),
      );
    } catch {
      /* Quota/full/disabled storage is nonfatal. */
    }
  }
}
