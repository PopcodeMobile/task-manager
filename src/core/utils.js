import { sod, iso, parse, addD, diffD } from './calendar.js';
import { t, formatDate, formatRelative } from './i18n.js';
/* =====================================================================
   QUIRE — core: utils, icons, seed data, store, render loop, events
   ===================================================================== */
// Web fonts load without blocking first paint (the link starts as media=print).
globalThis.document?.querySelectorAll('link[data-font]').forEach(l => {
  l.media = 'all';
});
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 8);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const isMac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || globalThis.navigator?.userAgent || '');
export const MOD = isMac ? '⌘' : 'Ctrl';

/* ---------- dates ---------- */
export { DAY, sod, iso, parse, addD, diffD } from './calendar.js';
export const TODAY = sod(new Date());
export const dOff = n => iso(addD(TODAY, n));
export const MON = [];
export const MONL = [];
export const WD = [];
export const WDL = [];
// applyPrefs refreshes these display labels before every render.
export let dateFormat = 'locale';
export function setDateFormat(f) {
  dateFormat = f || 'locale';
  for (let month = 0; month < 12; month++) {
    const date = new Date(2026, month, 1);
    MON[month] = formatDate(date, { month: 'short' });
    MONL[month] = formatDate(date, { month: 'long' });
  }
  for (let day = 0; day < 7; day++) {
    const date = new Date(2026, 0, 4 + day);
    WD[day] = formatDate(date, { weekday: 'short' });
    WDL[day] = formatDate(date, { weekday: 'long' });
  }
}
setDateFormat();
export function fmtDate(s, long) {
  const d = typeof s === 'string' ? parse(s) : s;
  if (!d) return '';
  if (dateFormat === 'd/M') return `${d.getDate()}/${d.getMonth() + 1}${long ? '/' + d.getFullYear() : ''}`;
  if (dateFormat === 'M/d') return `${d.getMonth() + 1}/${d.getDate()}${long ? '/' + d.getFullYear() : ''}`;
  if (dateFormat === 'yyyy-MM-dd') return iso(d);
  return formatDate(d, { month: 'short', day: 'numeric', ...(long || d.getFullYear() !== TODAY.getFullYear() ? { year: 'numeric' } : {}) });
}
export function relDate(s) {
  if (!s) return '';
  const date = parse(s);
  const n = diffD(date, TODAY);
  if (n === 0) return t('Today');
  if (n === 1) return t('Tomorrow');
  if (n === -1) return t('Yesterday');
  if (n > 1 && n < 7) return formatDate(date, { weekday: 'short' });
  return fmtDate(s);
}
export function ago(ts) {
  const m = Math.round((Date.now() - ts) / 6e4);
  if (m < 1) return t('just now');
  if (m < 60) return formatRelative(-m, 'minute', { numeric: 'always', style: 'short' });
  const h = Math.round(m / 60);
  if (h < 24) return formatRelative(-h, 'hour', { numeric: 'always', style: 'short' });
  const d = Math.round(h / 24);
  if (d < 7) return formatRelative(-d, 'day', { numeric: 'always', style: 'short' });
  return fmtDate(iso(new Date(ts)));
}
export const minsAgo = m => Date.now() - m * 6e4;
export function dayBucket(ts) {
  const n = diffD(new Date(ts), TODAY);
  if (n === 0) return t('Today');
  if (n === -1) return t('Yesterday');
  if (n > -7) return t('This week');
  return t('Earlier');
}
