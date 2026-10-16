import { validateWorkspace } from './workspace-schema.js';

export function emptyWorkspace(workspace = {}, user = {}) {
  const id = user.id || 'local-user';
  return {
    ws: { id: workspace.id || null, name: workspace.name || 'Meu espaço', url: workspace.url || '', c: workspace.c || '#5A67D8', brand: false },
    me: id,
    members: [
      {
        id,
        name: user.name || user.user_metadata?.name || user.email?.split('@')[0] || 'Você',
        email: user.email || '',
        role: 'Owner',
        team: '',
        title: '',
        c: '#5A67D8',
        status: 'active',
        last: 0,
        tz: 'America/Maceio',
      },
    ],
    projects: [],
    tasks: [],
    comments: [],
    activity: [],
    notifs: [],
    files: [],
    events: [],
    teams: [],
    projOrder: [],
    savedViews: [],
    recentSearches: [],
    sessions: [],
    invoices: [],
    notifPrefs: {},
    tfa: false,
  };
}
export function normalizeWorkspace(data, workspace, user) {
  const defaults = emptyWorkspace(workspace, user);
  const output = { ...defaults, ...data, ws: { ...defaults.ws, ...data.ws, ...workspace } };
  for (const key of Object.keys(defaults)) {
    if (Array.isArray(defaults[key]) && !Array.isArray(output[key])) output[key] = [];
  }
  return validateWorkspace(output);
}
