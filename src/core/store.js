/* ---------- store ---------- */
import { TODAY, diffD, iso, parse, uid } from './utils.js';
import { PCOLORS, TEAMS_SEED } from './constants.js';
import { seed } from '../data/seed.js';
import { emptyWorkspace, normalizeWorkspace } from '../data/workspace.js';
import { createLocalRepository } from '../workspace/local.js';
import { createSupabaseRepository } from '../workspace/supabase.js';
import { createWorkspaceController } from '../workspace/controller.js';
import { getSupabase, isCloudMode, configurationError } from '../workspace/config.js';
import { getAuthSession } from '../workspace/auth.js';
import { publicError, WorkspaceError } from '../workspace/errors.js';
import { normalizeLocale, setLocale, t } from './i18n.js';

export const STORE_KEY = 'gr8r.v2';
export const DEFAULT_PREFS = {
  theme: 'system',
  accent: 'indigo',
  side: 'comfortable',
  density: 'comfortable',
  weekStart: 1,
  dateFmt: 'MMM d',
  lang: 'pt-BR',
  tz: 'America/Maceio',
  motion: 'system',
  home: 'home',
  openTasks: 'drawer',
  name: 'Você',
  title: '',
};
export const saved = null;
export const S = {
  data: emptyWorkspace(),
  prefs: Object.assign({}, DEFAULT_PREFS, saved?.prefs || {}),
  views: saved?.views || {},
  workspace: { mode: isCloudMode() ? 'supabase' : 'local', id: null, membership: null, workspaces: [], ready: false },
  sync: { status: 'idle', error: null },
  ui: createUI(),
};
function createUI() {
  return {
    fx: {},
    auth: null,
    authStep: 'login',
    onb: 0,
    onbData: { use: 'product', team: 'kanban', size: '2-10', ws: '', proj: '', tmpl: 'web', invites: '' },
    route: 'home',
    params: {},
    history: [],
    collapsed: !!saved?.collapsed,
    mnav: false,
    expanded: {},
    modalOpeners: [],
    drawer: null,
    drawerFull: false,
    drawerTab: 'comments',
    modals: [],
    pop: null,
    palette: null,
    loading: false,
    offline: false,
    sel: new Set(),
    composer: null,
    editCell: null,
    openTasks: {},
    collapsedGroups: {},
    calDate: iso(TODAY),
    calMode: 'month',
    tlZoom: 'week',
    tlGroup: 'status',
    fileView: 'grid',
    projView: 'grid',
    homeTab: 'upcoming',
    inboxCat: 'all',
    inboxUnread: false,
    inboxSel: null,
    notifFilter: 'all',
    settings: 'appearance',
    searchQ: '',
    searchCat: 'all',
    myView: 'list',
    membersTab: 'members',
    collapsedCols: {},
    errors: {},
    drafts: {},
  };
}
const initialUI = () => ({ ...createUI(), collapsed: S.ui.collapsed });

let repository;
let controller;
let identity = isCloudMode() ? 'anonymous' : 'local';
let lifecycle = 0;
const emit = name => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name));
};
const syncStatus = value => {
  S.sync = value;
  emit('workspace:sync');
};
const prefsKey = () => 'gr8r.preferences.' + identity;
const authPrefsKey = 'gr8r.auth.preferences';
function authLocale() {
  try {
    return normalizeLocale(JSON.parse(localStorage.getItem(authPrefsKey) || 'null')?.lang);
  } catch {
    return DEFAULT_PREFS.lang;
  }
}
function personalPreferences() {
  try {
    return JSON.parse(localStorage.getItem(prefsKey()) || 'null');
  } catch {
    throw new WorkspaceError('storage');
  }
}
function persistPreferences() {
  const previous = personalPreferences() || {};
  previous.prefs = S.prefs;
  previous.collapsed = S.ui.collapsed;
  previous.activeWorkspace = S.workspace.id;
  previous.views ||= {};
  if (S.workspace.id) previous.views[S.workspace.id] = S.views;
  try {
    localStorage.setItem(prefsKey(), JSON.stringify(previous));
    localStorage.setItem(authPrefsKey, JSON.stringify({ lang: normalizeLocale(S.prefs.lang) }));
  } catch {
    throw new WorkspaceError('storage');
  }
}
function applyRecord(record) {
  S.data = normalizeWorkspace(record.data, { id: record.id });
  S.workspace.id = record.id;
  S.workspace.membership = record.membership;
  S.data.workspaces = S.workspace.workspaces.map(workspace => ({ ...workspace }));
  const personal = personalPreferences();
  S.views = personal?.views?.[record.id] || {};
  S.ui = initialUI();
  S.workspace.ready = true;
  emit('workspace:change');
}
export async function initializeWorkspace() {
  const run = ++lifecycle;
  const checkRun = () => {
    if (run !== lifecycle) throw new WorkspaceError('stale_scope');
  };
  try {
    if (configurationError) throw configurationError;
    const session = isCloudMode() ? await getAuthSession() : null;
    checkRun();
    if (isCloudMode() && !session) {
      clearWorkspace();
      S.ui.auth = 'login';
      S.workspace.ready = true;
      return;
    }
    const nextIdentity = session?.user.id || 'local';
    if (controller) {
      if (identity === nextIdentity) await controller.flush();
      checkRun();
      controller.clear();
      controller = null;
    }
    identity = nextIdentity;
    const nextRepository = isCloudMode()
      ? createSupabaseRepository(await getSupabase(), session.user)
      : createLocalRepository({ storage: localStorage, seed, blank: emptyWorkspace });
    checkRun();
    repository = nextRepository;
    const workspaces = await nextRepository.list();
    checkRun();
    const personal = personalPreferences();
    const legacy = !personal && repository.legacyPreferences ? await repository.legacyPreferences() : null;
    checkRun();
    S.prefs = { ...DEFAULT_PREFS, lang: authLocale(), ...(personal?.prefs || legacy?.prefs || {}) };
    S.prefs.lang = normalizeLocale(S.prefs.lang);
    setLocale(S.prefs.lang);
    S.ui.collapsed = personal?.collapsed ?? legacy?.collapsed ?? false;
    S.workspace.workspaces = workspaces;
    controller = createWorkspaceController({ repository, onStatus: syncStatus });
    if (workspaces.length) {
      const selected = workspaces.find(workspace => workspace.id === personal?.activeWorkspace) || workspaces[0];
      const selectedRecord = await controller.switch(selected.id);
      checkRun();
      applyRecord(selectedRecord);
      if (legacy?.views) S.views = legacy.views;
    } else {
      S.data = emptyWorkspace({}, session?.user);
      S.data.workspaces = [];
      S.workspace.id = null;
      S.workspace.membership = null;
      S.workspace.ready = true;
      S.ui = initialUI();
      S.ui.auth = 'onboarding';
      emit('workspace:change');
    }
    persistPreferences();
  } catch (error) {
    const safe = publicError(error);
    if (run === lifecycle) syncStatus({ status: 'error', error: safe.code });
    throw safe;
  }
}
export function save(captured = scope()) {
  try {
    persistPreferences();
    if (!controller?.current) return true;
    if (!isScopeCurrent(captured)) throw new WorkspaceError('stale_scope');
    // Guests may persist personal display preferences, never workspace snapshots.
    if (S.workspace.membership?.role === 'guest') return true;
    controller.save(S.data, captured);
    S.workspace.workspaces = S.workspace.workspaces.map(workspace => (workspace.id === S.workspace.id ? { ...workspace, ...S.data.ws } : workspace));
    S.data.workspaces = S.workspace.workspaces.map(workspace => ({ ...workspace }));
    return true;
  } catch (error) {
    syncStatus({ status: 'error', error: publicError(error).code });
    return false;
  }
}
export async function flushWorkspace() {
  persistPreferences();
  if (controller) await controller.flush();
}
export async function switchWorkspace(id) {
  if (!repository || !S.workspace.workspaces.some(workspace => workspace.id === id)) throw new WorkspaceError('forbidden');
  persistPreferences();
  const activeController = controller;
  const record = await activeController.switch(id);
  if (activeController !== controller) throw new WorkspaceError('stale_scope');
  applyRecord(record);
  persistPreferences();
  return record;
}
export async function createWorkspace({ name, url }) {
  if (!repository) throw new WorkspaceError('unauthenticated');
  const activeController = controller;
  const activeRepository = repository;
  const checkActive = () => {
    if (activeController !== controller || activeRepository !== repository) throw new WorkspaceError('stale_scope');
  };
  await flushWorkspace();
  checkActive();
  const created = await activeRepository.create({ name, url });
  checkActive();
  const workspaces = await activeRepository.list();
  checkActive();
  const record = await activeController.switch(created.id);
  checkActive();
  S.workspace.workspaces = workspaces;
  applyRecord(record);
  persistPreferences();
  return created;
}
export async function reloadWorkspace() {
  const activeController = controller;
  const record = await activeController.reload();
  if (activeController !== controller) throw new WorkspaceError('stale_scope');
  applyRecord(record);
}
export const scope = () => controller?.scope() || { workspaceId: null, generation: -1 };
export const isScopeCurrent = captured => !!controller?.isCurrent(captured);
export function restoreWorkspace(snapshot, captured) {
  if (!isScopeCurrent(captured)) throw new WorkspaceError('stale_scope');
  S.data = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
  S.data.workspaces = S.workspace.workspaces;
  return save(captured);
}
export function clearWorkspace() {
  lifecycle++;
  controller?.clear();
  controller = null;
  repository = null;
  identity = isCloudMode() ? 'anonymous' : 'local';
  S.data = emptyWorkspace();
  S.data.workspaces = [];
  S.views = {};
  S.prefs = { ...DEFAULT_PREFS, lang: authLocale() };
  setLocale(S.prefs.lang);
  S.ui = initialUI();
  S.workspace = { mode: isCloudMode() ? 'supabase' : 'local', id: null, membership: null, workspaces: [], ready: false };
  emit('workspace:change');
}
export const hasPendingChanges = () => !!controller?.dirty;

/* ---------- lookups ---------- */
export const D = () => S.data;
export const me = () => D().members.find(m => m.id === D().me);
export const mem = id => D().members.find(m => m.id === id);
export const proj = id => D().projects.find(p => p.id === id);
export const task = id => D().tasks.find(t => t.id === id);
export const pColor = p => PCOLORS[p?.color] || PCOLORS.slate;
export const visibleProjects = () =>
  D()
    .projOrder.map(proj)
    .filter(Boolean)
    .filter(p => !p.archived);
export const canSee = p => !!p && (isCloudMode() || !p.private || p.members.includes(D().me));
export const tasksOf = pid => D().tasks.filter(t => t.project === pid && !t.archived);
export const allTasks = () => D().tasks.filter(t => !t.archived && canSee(proj(t.project)));
export const isOver = t => t.due && t.status !== 'done' && diffD(parse(t.due), TODAY) < 0;
export const commentsOf = tid => D().comments.filter(c => c.task === tid);
export function progressOf(pid) {
  const ts = tasksOf(pid);
  if (!ts.length) return 0;
  return Math.round((ts.filter(t => t.status === 'done').length / ts.length) * 100);
}
export function taskProg(t) {
  if (t.status === 'done') return 100;
  if (t.subtasks.length) return Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100);
  return { backlog: 0, todo: 5, progress: 45, review: 80 }[t.status] || 0;
}

/* ---------- activity + notification helpers ---------- */
export function logAct(verb, t, extra = '') {
  D().activity.unshift({ id: uid('a'), by: D().me, verb, task: t?.id || null, project: t?.project || null, at: Date.now(), extra });
  if (t) t.updated = Date.now();
}

/* ---------- teams (workspace data, seeded on first use) ---------- */
export const NO_TEAM = {
  id: '',
  get name() {
    return t('No team');
  },
  icon: 'users',
  c: '#8A867E',
  desc: '',
};
export function teamsList() {
  const d = D();
  if (!d.teams) d.teams = isCloudMode() ? [] : TEAMS_SEED.map(t => ({ ...t }));
  return d.teams;
}
export function team(id) {
  return teamsList().find(t => t.id === id) || null;
}
export const TM = new Proxy({}, { get: (_, k) => team(k) || NO_TEAM });
