/* ---------- theme ---------- */
import { setDateFormat } from './utils.js';
import { S } from './store.js';
import { getLocale, setLocale } from './i18n.js';

export function applyPrefs() {
  const r = document.documentElement,
    p = S.prefs;
  setLocale(p.lang);
  setDateFormat(p.dateFmt);
  r.lang = getLocale();
  r.setAttribute('data-theme', effectiveDark() ? 'dark' : 'light');
  if (p.accent === 'indigo') r.removeAttribute('data-accent');
  else r.setAttribute('data-accent', p.accent);
  r.setAttribute('data-side', p.side);
  r.setAttribute('data-density', p.density);
  if (p.motion === 'reduce') r.setAttribute('data-motion', 'reduce');
  else r.removeAttribute('data-motion');
}
export function effectiveDark() {
  if (S.prefs.theme === 'dark') return true;
  if (S.prefs.theme === 'light') return false;
  return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
}
