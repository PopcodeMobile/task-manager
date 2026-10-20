import { RepositoryError } from './normalized.ts';
function read(storage, key) {
  try {
    const raw = storage.getItem(key);
    const value = raw ? JSON.parse(raw) : null;
    if (value !== null && (typeof value !== 'object' || Array.isArray(value))) throw Error();
    return value;
  } catch {
    throw new RepositoryError('storage');
  }
}
export function loadAppearance(storage, identity) {
  const personal = read(storage, `gr8r.preferences.${identity}`);
  const legacy = !personal && identity === 'local' ? read(storage, 'gr8r.v2') : null;
  const prefs = personal?.prefs ?? legacy?.prefs ?? {};
  const auth = read(storage, 'gr8r.auth.preferences');
  return {
    ...prefs,
    lang: personal?.prefs?.lang ?? auth?.lang ?? prefs.lang ?? 'pt-BR',
    theme: prefs.theme ?? 'light',
    density: prefs.density ?? 'comfortable',
  };
}
export function saveAppearance(storage, identity, patch) {
  let personal = read(storage, `gr8r.preferences.${identity}`);
  if (!personal && identity === 'local') {
    const legacy = read(storage, 'gr8r.v2');
    const records = read(storage, 'gr8r.workspaces.v1');
    const first = records?.order?.[0] ?? legacy?.data?.workspaces?.[0]?.id ?? legacy?.data?.ws?.id ?? 'w1';
    personal = { prefs: legacy?.prefs ?? {}, collapsed: !!legacy?.collapsed, views: { [first]: legacy?.views ?? {} } };
  }
  const auth = read(storage, 'gr8r.auth.preferences');
  try {
    storage.setItem(`gr8r.preferences.${identity}`, JSON.stringify({ ...personal, prefs: { ...personal?.prefs, ...patch } }));
    storage.setItem('gr8r.auth.preferences', JSON.stringify({ ...auth, lang: patch.lang ?? auth?.lang ?? 'pt-BR' }));
  } catch {
    throw new RepositoryError('storage');
  }
}
