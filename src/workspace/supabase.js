import { WorkspaceError, clone } from './errors.js';
import { emptyWorkspace, normalizeWorkspace } from '../data/workspace.js';
import { validateWorkspace } from '../data/workspace-schema.js';
import { workspaceSlug } from './metadata.js';
const roles = { owner: 'Owner', admin: 'Admin', member: 'Member', guest: 'Guest' };
const check = response => {
  if (response.error) {
    const code = response.error.code;
    throw new WorkspaceError(
      code === '40001' ? 'conflict' : code === '42501' ? 'forbidden' : code === 'P0002' ? 'not_found' : code === '22023' ? 'invalid' : 'network',
    );
  }
  return response.data;
};
export function createSupabaseRepository(client, user) {
  const load = async id => {
    const row = check(await client.from('workspace_snapshots').select('payload,revision,workspaces!inner(id,name,slug,color)').eq('workspace_id', id).single());
    const memberships = check(await client.rpc('list_workspace_members', { p_workspace_id: id }));
    const membership = memberships.find(member => member.user_id === user.id);
    if (!membership) throw new WorkspaceError('forbidden');
    const ws = row.workspaces;
    const data = normalizeWorkspace(row.payload, { id, name: ws.name, url: ws.slug, c: ws.color }, user);
    data.me = user.id;
    const teamIds = new Set(data.teams.map(team => team.id));
    data.members = memberships.map(member => ({
      id: member.user_id,
      name: member.name,
      email: member.email,
      role: roles[member.role],
      team: typeof data.memberTeams?.[member.user_id] === 'string' && teamIds.has(data.memberTeams[member.user_id]) ? data.memberTeams[member.user_id] : '',
      title: '',
      c: '#5A67D8',
      status: 'active',
      last: null,
      tz: '',
    }));
    // This release shares the complete snapshot with workspace members. No private projects.
    data.projects.forEach(project => {
      project.private = false;
    });
    return { id, data, revision: row.revision, membership: { role: membership.role, userId: user.id } };
  };
  return {
    mode: 'supabase',
    async list() {
      const rows = check(await client.from('workspace_memberships').select('role,workspaces!inner(id,name,slug,color)').eq('user_id', user.id));
      return rows.map(row => ({
        id: row.workspaces.id,
        name: row.workspaces.name,
        url: row.workspaces.slug,
        c: row.workspaces.color,
        plan: 'Free',
        role: row.role,
      }));
    },
    load,
    async create({ name, url }) {
      if (!name?.trim()) throw new WorkspaceError('invalid');
      const id = check(
        await client.rpc('create_workspace', {
          p_name: name.trim(),
          p_slug: workspaceSlug(url || name),
          p_payload: emptyWorkspace({}, user),
        }),
      );
      return load(id);
    },
    async save(id, data, revision) {
      validateWorkspace(data);
      const payload = clone(data);
      const teamIds = new Set((data.teams || []).map(team => team.id));
      payload.memberTeams = Object.fromEntries(
        (data.members || []).map(member => [member.id, typeof member.team === 'string' && teamIds.has(member.team) ? member.team : '']),
      );
      for (const key of ['members', 'me', 'workspaces', 'sessions', 'invoices', 'tfa', 'notifPrefs', 'recentSearches']) delete payload[key];
      return check(await client.rpc('save_workspace_snapshot', { p_workspace_id: id, p_expected_revision: revision, p_payload: payload }));
    },
  };
}
