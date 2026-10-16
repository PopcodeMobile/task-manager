import ptBR from '../locales/pt-BR.js';
import en from '../locales/en.js';
import designSystemPtBR from '../locales/design-system.pt-BR.js';
import { workspacePtBR, workspaceEn } from '../locales/workspace.js';

export const LOCALES = [
  { id: 'pt-BR', name: 'Português (Brasil)' },
  { id: 'en', name: 'English' },
];
export const catalogs = {
  'pt-BR': { ...ptBR, ...designSystemPtBR, ...workspacePtBR },
  en: { ...en, ...Object.fromEntries(Object.keys(designSystemPtBR).map(key => [key, key])), ...workspaceEn },
};
let locale = 'pt-BR';

export function normalizeLocale(value) {
  return /^(en(?:[-_]|$)|english)/i.test(String(value || '')) ? 'en' : 'pt-BR';
}
export const getLocale = () => locale;
export function setLocale(value) {
  locale = normalizeLocale(value);
  return locale;
}
export function t(source, params = {}) {
  let message = catalogs[locale][source] ?? en[source] ?? source;
  if (typeof message === 'object') {
    const form = new Intl.PluralRules(locale).select(Number(params.count ?? 0));
    message = message[form] ?? message.other;
  }
  return String(message).replace(/\{([\w]+)\}/g, (match, name) => (Object.hasOwn(params, name) ? String(params[name]) : match));
}
export function formatNumber(value, options = {}) {
  return new Intl.NumberFormat(locale, options).format(value);
}
export function formatDate(value, options = {}) {
  if (!value) return '';
  const date =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(...value.split('-').map((n, index) => Number(n) - (index === 1 ? 1 : 0)))
      : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, options).format(date);
}
export function formatRelative(value, unit, options = {}) {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', ...options }).format(value, unit);
}
