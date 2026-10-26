export const LANGUAGES = {
  en: 'English',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  es: 'Spanish',
  fr: 'French',
  pt: 'Portuguese',
  sv: 'Swedish',
};
export const MODEL_LANGUAGES = ['ja', 'en', 'zh', 'es', 'fr', 'pt'];
export const DEFAULTS = {
  channel: '',
  language: 'en',
  readNames: false,
  maxLength: 180,
  volume: 0.8,
  audience: 'everyone',
  queue: 20,
  demo: false,
};
export function normalizeChannel(value = '') {
  const channel = String(value).trim().replace(/^#/, '').toLowerCase();
  return /^[a-z0-9_]{1,25}$/.test(channel) ? channel : '';
}
export function readOptions(search = '') {
  const p = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const number = (key, min, max) =>
    p.has(key) && Number.isFinite(Number(p.get(key)))
      ? Math.max(min, Math.min(max, Number(p.get(key))))
      : DEFAULTS[key];
  return {
    channel: normalizeChannel(p.get('channel') || ''),
    language: Object.hasOwn(LANGUAGES, p.get('language')) ? p.get('language') : 'en',
    readNames: p.get('readNames') === '1',
    maxLength: Math.round(number('maxLength', 20, 500)),
    volume: number('volume', 0, 1),
    queue: Math.round(number('queue', 1, 100)),
    audience: ['everyone', 'subs', 'vips'].includes(p.get('audience'))
      ? p.get('audience')
      : 'everyone',
    demo: p.get('demo') === '1',
  };
}
export function overlayURL(base, options) {
  const url = new URL('overlay.html', base);
  for (const key of Object.keys(DEFAULTS)) {
    const value = options[key] ?? DEFAULTS[key];
    url.searchParams.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }
  return url.href;
}
