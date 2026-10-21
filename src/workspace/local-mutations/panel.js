import { RepositoryError } from '../normalized.ts';
import { patchLocal, localWorkspaceDTO, localTeams } from '../local-dto.js';
import { seed } from '../../data/seed.js';
const fail = () => {
  throw new RepositoryError('validation_error');
};
export function mutatePanel({ data, find, cas, bump, dto, initialize }, operation, input) {
  if (operation === 'update_workspace') {
    cas('workspace', data.ws);
    if (input.name !== undefined) data.ws.name = input.name;
    if (input.slug !== undefined) data.ws.url = input.slug;
    if (input.color !== undefined) data.ws.c = input.color;
    bump('workspace', data.ws);
    data.ws.version = data._panel.versions[`workspace:${data.ws.id}`];
    return localWorkspaceDTO(data.ws);
  }
  if (operation === 'local_update_profile') {
    const actor = data.members.find(m => m.id === data.me);
    if (!actor) throw new RepositoryError('not_found');
    for (const key of ['name', 'title', 'avatar', 'color']) if (input[key] !== undefined) actor[key === 'color' ? 'c' : key] = input[key];
    return { id: actor.id };
  }
  if (operation === 'local_workspace_member') {
    if (input.action === 'invite') {
      if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) fail();
      if (data.members.some(m => m.email === input.email)) fail();
      const member = { id: crypto.randomUUID(), name: input.email.split('@')[0], email: input.email, role: 'Member', status: 'Invited', team: '' };
      data.members.push(member);
      return { id: member.id };
    }
    const member = data.members.find(m => m.id === input.userId);
    if (!member || member.id === data.me) fail();
    if (input.action === 'role') {
      if (!['Admin', 'Member', 'Guest'].includes(input.role)) fail();
      member.role = input.role;
    } else if (input.action === 'resend') member.status = 'Invited';
    else if (input.action === 'remove') {
      data.members = data.members.filter(m => m !== member);
      for (const p of data.projects) {
        p.members = (p.members ?? []).filter(id => id !== member.id);
        if (p.lead === member.id) p.lead = '';
        bump('project', p);
      }
      for (const task of data.tasks)
        if (task.assignee === member.id) {
          task.assignee = '';
          bump('task', task);
        }
      for (const team of data.teams ?? []) if (team.id === member.team) bump('team', team);
    } else fail();
    return { id: member.id };
  }
  if (operation === 'local_demo_setting') {
    if (input.section === 'notifications') {
      if (typeof input.value !== 'boolean') fail();
      (data.notifPrefs ??= {})[input.key] = input.value;
    } else if (input.section === 'plan') {
      if (!['Free', 'Team', 'Business'].includes(input.value)) fail();
      data.plan = input.value;
    } else if (input.section === '2fa') {
      if (typeof input.value !== 'boolean') fail();
      data.tfa = input.value;
    } else if (input.section === 'sessions') data.sessions = (data.sessions ?? []).filter(s => s.cur || (input.key !== 'all' && s.id !== input.key));
    else fail();
    return { demo: true };
  }
  if (operation === 'local_reset_demo') {
    if (input.confirmWorkspaceId !== data.ws.id) fail();
    const ws = { ...data.ws },
      panel = data._panel;
    for (const key of Object.keys(data)) delete data[key];
    Object.assign(data, seed(), { ws, _panel: panel });
    delete data.workspaces;
    // panelState registered the canonical union (including embedded files/labels)
    // before this transaction. Invalidate every known CAS identity, even when the
    // reset removes it; keep receipts and never recycle an old entity version.
    for (const key of Object.keys(panel.versions)) panel.versions[key] += 1;
    data.ws.version = panel.versions[`workspace:${ws.id}`];
    return { id: ws.id, demo: true };
  }
  // Run on the transaction's current graph, before this command changes any team.
  if (Object.hasOwn(input, 'expectedMemberships')) {
    const teams = new Set(localTeams(data).map(team => team.id));
    for (const baseline of input.expectedMemberships) {
      const member = data.members.find(member => member.id === baseline.userId);
      const current = member?.team && teams.has(member.team) ? [member.team] : [];
      if (!member || current.length !== baseline.teamIds.length || current.some(id => !baseline.teamIds.includes(id)))
        throw new RepositoryError('version_conflict');
    }
  }
  let row;
  if (operation === 'create_team') {
    row = { id: input.id ?? crypto.randomUUID(), name: input.name, desc: '' };
    if (data.teams.some(t => t.id === row.id)) fail();
    initialize('team', row);
    data.teams.push(row);
  } else {
    row = find('team', input.id);
    cas('team', row);
  }
  if (operation === 'delete_team') {
    data.teams = data.teams.filter(t => t.id !== row.id);
    for (const member of data.members) if (member.team === row.id) member.team = '';
    for (const project of data.projects)
      if (project.team === row.id) {
        project.team = '';
        bump('project', project);
      }
    return { id: row.id, deleted: true };
  }
  if (operation === 'set_team_member' || operation === 'remove_team_member') {
    const member = data.members.find(m => m.id === input.userId);
    if (!member) fail();
    if (operation === 'set_team_member') {
      const previous = data.teams.find(t => t.id === member.team && t.id !== row.id);
      if (previous) bump('team', previous);
      member.team = row.id;
    } else if (member.team === row.id) member.team = '';
  } else {
    if (data.teams.some(t => t.id !== row.id && t.name.toLowerCase() === input.name?.toLowerCase())) fail();
    const patch = { ...input };
    delete patch.expectedMemberships;
    patchLocal(row, patch);
  }
  if (operation !== 'create_team') bump('team', row);
  return dto('team', row);
}
