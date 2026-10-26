import { LANGUAGES } from './config.js';
export function detectLanguage(text) {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja';
  if (/\p{Script=Hangul}/u.test(text)) return 'ko';
  if (/\p{Script=Han}/u.test(text)) return 'zh';
  if (!/\p{Script=Latin}/u.test(text)) return null;
  const lower = text.toLowerCase();
  if (/[å]/u.test(lower) || /\b(hej|tack|mycket|sverige)\b/u.test(lower)) return 'sv';
  if (
    /[ãõ]/u.test(lower) ||
    /(?<!\p{L})(olá|obrigad[oa]|você|vocês|português)(?!\p{L})/u.test(lower)
  )
    return 'pt';
  if (/[¿¡ñ]/u.test(lower) || /\b(hola|gracias|buenos|buenas|español)\b/u.test(lower)) return 'es';
  if (/[œç]/u.test(lower) || /\b(bonjour|merci|salut|français|beaucoup)\b/u.test(lower))
    return 'fr';
  return 'en';
}
export function chooseLanguage(text, sticky, fallback = 'en') {
  return (Object.hasOwn(LANGUAGES, sticky) ? sticky : null) || detectLanguage(text) || fallback;
}
