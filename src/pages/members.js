import { t as tr } from '../core/i18n.js';
/* ---------- MEMBERS / PROFILE / TEAMS ---------- */
import { ago, esc, minsAgo } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { ROLES } from '../core/constants.js';
import { D, S, TM, allTasks, canSee, isOver, me, mem, progressOf, team, teamsList, visibleProjects } from '../core/store.js';
import { av, avStack, empty, pIcon, pStatus, progBar } from '../ui/helpers.js';
import { sortTasks } from '../shell/view-engine.js';
import { actHtml, miniRow } from '../components/task-list.js';
import { page404 } from './errors.js';

export function pageMembers() {
  const u = S.ui;
  const q = (u.memQ || '').toLowerCase();
  const role = u.memRole || 'all';
  const ms = D().members.filter(m => (role === 'all' || m.role === role) && (!q || m.name.toLowerCase().includes(q) || m.email.includes(q)));
  const isAdmin = ['Owner', 'Admin'].includes(me().role);
  const tab = u.membersTab;
  return `<div class="page wide" style="max-width:1200px">
    <div class="ph"><div><h1>${tr('Members')}</h1><p>${tr('{value1} people in {value2} · {value3} pending', { value1: D().members.length, value2: esc(D().ws.name), value3: D().members.filter(m => m.status === 'invited').length })}</p></div><div class="acts"><button class="btn btn-primary" data-a="invite">${tr('{value1}Invite member', { value1: ic('user-plus', 14) })}</button></div></div>
    <div class="tabs" style="margin-bottom:var(--s-3-5)">${[
      ['members', tr('Members')],
      ['teams', tr('Teams')],
      ['roles', tr('Roles & permissions')],
    ]
      .map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-a="set" data-k="membersTab" data-v="${k}">${n}</button>`)
      .join('')}</div>
    ${
      tab === 'teams'
        ? `<div class="row" style="margin-bottom:var(--s-3)"><span class="muted" style="font-size:var(--fs-body-sm)">${tr('{value1} teams', { value1: teamsList().length })}</span><span class="sp"></span><button class="btn btn-secondary btn-sm" data-a="newTeam">${tr('{value1}New team', { value1: ic('plus', 13) })}</button></div>${teamsGrid()}`
        : tab === 'roles'
          ? permsTable()
          : `
    <div class="row" style="margin-bottom:var(--s-3);gap:var(--s-2);flex-wrap:wrap"><div class="inwrap">${ic('search', 13)}<input class="input search-sm" id="mem-q" data-in="memQ" placeholder="${tr('Search by name or email')}" value="${esc(u.memQ || '')}" aria-label="${tr('Search members')}"></div>
      <div class="seg">${['all', ...ROLES].map(r => `<button class="${role === r ? 'on' : ''}" data-a="set" data-k="memRole" data-v="${r}">${r === 'all' ? tr('All') : tr(r)}</button>`).join('')}</div></div>
    <div class="panel" style="overflow-x:auto">${
      ms.length
        ? `<table class="perm-t" style="min-width:880px"><thead><tr><th style="padding-left:var(--s-3-5)">${tr('Member')}</th><th style="text-align:left">${tr('Role')}</th><th style="text-align:left">${tr('Team')}</th><th>${tr('Active projects')}</th><th>${tr('Tasks')}</th><th style="text-align:left">${tr('Last active')}</th><th style="text-align:left">${tr('Status')}</th><th></th></tr></thead><tbody>
    ${ms
      .map(m => {
        const ap = visibleProjects().filter(p => p.members.includes(m.id) && p.status !== 'complete').length;
        const ot = allTasks().filter(t => t.assignee === m.id && t.status !== 'done').length;
        return `<tr data-ctx="member" data-id="${m.id}"><td style="padding-left:var(--s-3-5)"><button class="row" data-a="go" data-r="member" data-id="${m.id}" style="gap:var(--s-2-5);text-align:left">${av(m.id, 'md', false)}<span class="col"><b style="font-weight:var(--fw-medium)">${esc(m.name)}${m.id === D().me ? ` <span class="faint" style="font-weight:var(--fw-regular)">${tr('(you)')}</span>` : ''}</b><span class="faint" style="font-size:var(--fs-xs)">${esc(m.email)}</span></span></button></td>
      <td style="text-align:left">${isAdmin && m.role !== 'Owner' ? `<button class="pillbtn bordered" data-a="pop" data-pop="role" data-id="${m.id}">${tr(m.role)}${ic('chevron-down', 12)}</button>` : `<span class="pillbtn">${m.role === 'Owner' ? ic('crown', 13) : ''}${tr(m.role)}</span>`}</td>
      <td style="text-align:left"><span class="row">${ic(TM[m.team].icon, 13)}${esc(TM[m.team].name)}</span></td><td class="num">${ap}</td><td class="num">${ot}</td>
      <td style="text-align:left" class="muted">${m.last == null ? '—' : m.last < 5 ? `<span style="color:var(--green)">${tr('Online')}</span>` : ago(minsAgo(m.last))}</td>
      <td style="text-align:left">${m.status === 'invited' ? `<span class="badge amber"><span class="dot"></span>${tr('Invited')}</span>` : m.status === 'deactivated' ? `<span class="badge gray">${tr('Deactivated')}</span>` : `<span class="badge green"><span class="dot"></span>${tr('Active')}</span>`}</td>
      <td><button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="member" data-id="${m.id}" aria-label="${tr('Member options')}">${ic('ellipsis', 14)}</button></td></tr>`;
      })
      .join('')}
    </tbody></table>`
        : empty('search-x', tr('No results found'), tr('No members match that search.'), '', 'sm')
    }</div>`
    }
  </div>`;
}
export function permsTable() {
  const rows = [
    [tr('View projects & tasks'), 1, 1, 1, 1],
    [tr('Comment on tasks'), 1, 1, 1, 1],
    [tr('Create and edit tasks'), 1, 1, 1, 0],
    [tr('Create projects'), 1, 1, 1, 0],
    [tr('Invite members'), 1, 1, 0, 0],
    [tr('Manage roles'), 1, 1, 0, 0],
    [tr('Workspace settings'), 1, 1, 0, 0],
    [tr('Billing'), 1, 0, 0, 0],
    [tr('Delete workspace'), 1, 0, 0, 0],
  ];
  return `<div class="panel" style="overflow-x:auto"><table class="perm-t" style="min-width:560px"><thead><tr><th style="padding-left:var(--s-3-5)">${tr('Permission')}</th>${ROLES.map(r => `<th>${tr(r)}</th>`).join('')}</tr></thead><tbody>${rows
    .map(
      r =>
        `<tr><td style="padding-left:var(--s-3-5)">${r[0]}</td>${r
          .slice(1)
          .map(
            v =>
              `<td>${v ? `<span style="color:var(--green);display:inline-flex" aria-label="${tr('Allowed')}">${ic('check', 15)}</span>` : `<span class="faint" style="display:inline-flex" aria-label="${tr('Not allowed')}">${ic('minus', 15)}</span>`}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('')}</tbody></table></div>`;
}
export function teamsGrid() {
  return `<div class="pgrid">${teamsList()
    .map(t => {
      const ms = D().members.filter(m => m.team === t.id);
      const ps = visibleProjects().filter(p => p.team === t.id);
      return `<div class="pcard" data-a="go" data-r="team" data-id="${t.id}" role="link" tabindex="0"><div class="row"><span class="picon" style="--c:${t.c}">${ic(t.icon, 15)}</span><b style="font-weight:var(--fw-semibold);font-size:var(--fs-label)">${esc(t.name)}</b></div><div class="desc">${esc(t.desc)}</div><div class="foot"><span class="row" style="gap:var(--s-1)">${tr('{value1}{value2} members', { value1: ic('users', 12), value2: ms.length })}</span><span class="row" style="gap:var(--s-1)">${tr('{value1}{value2} projects', { value1: ic('folder', 12), value2: ps.length })}</span><span class="sp"></span>${avStack(
        ms.map(m => m.id),
        4,
      )}</div></div>`;
    })
    .join('')}</div>`;
}
export function pageTeams() {
  return `<div class="page"><div class="ph"><div><h1>${tr('Teams')}</h1><p>${tr('Groups of people who work on projects together.')}</p></div><div class="acts"><button class="btn btn-primary" data-a="newTeam">${tr('{value1}New team', { value1: ic('plus', 14) })}</button></div></div>${teamsList().length ? teamsGrid() : `<div class="panel">${empty('users', tr('No teams yet'), tr('Create a team to group people and give projects an owner.'), `<button class="btn btn-primary btn-sm" data-a="newTeam">${tr('{value1}New team', { value1: ic('plus', 14) })}</button>`)}</div>`}</div>`;
}
export function pageTeam() {
  const t = team(S.ui.params.id);
  if (!t) return page404();
  const ms = D().members.filter(m => m.team === t.id);
  const ps = visibleProjects().filter(p => p.team === t.id);
  const ts = allTasks().filter(x => ms.some(m => m.id === x.assignee) && x.status !== 'done');
  return `<div class="page">
    <div class="ph"><div class="row" style="gap:var(--s-3)"><span class="picon lg" style="--c:${t.c}">${ic(t.icon, 18)}</span><div><h1>${esc(t.name)}</h1><p style="margin:var(--s-half) 0 0">${esc(t.desc)}</p></div></div><div class="acts"><button class="btn btn-secondary" data-a="editTeam" data-id="${t.id}">${tr('{value1}Edit team', { value1: ic('pencil', 14) })}</button><button class="btn btn-secondary" data-a="invite">${tr('{value1}Invite to workspace', { value1: ic('user-plus', 14) })}</button></div></div>
    <div class="grid2"><div class="stack">
      <section class="panel"><div class="panel-h"><h2>${tr('Projects')}</h2><span class="faint">${ps.length}</span></div>${ps.map(p => `<div class="mini" data-a="go" data-r="project" data-id="${p.id}">${pIcon(p, '', 14)}<span class="tt">${esc(p.name)}</span>${pStatus(p.status)}<span class="row" style="width:120px">${progBar(progressOf(p.id))}</span></div>`).join('') || `<div class="panel-b faint">${tr('No projects')}</div>`}</section>
      <section class="panel"><div class="panel-h"><h2>${tr('Open tasks')}</h2><span class="faint">${ts.length}</span></div>${sortTasks(ts, { f: 'due', dir: 1 })
        .slice(0, 8)
        .map(x => miniRow(x))
        .join('')}</section>
    </div>
    <section class="panel" style="align-self:start"><div class="panel-h"><h2>${tr('Members')}</h2><span class="faint">${ms.length}</span></div>${ms.map(m => `<div class="mini" style="min-height:48px" data-a="go" data-r="member" data-id="${m.id}">${av(m.id, 'md', false)}<div class="grow"><div style="font-weight:var(--fw-medium)">${esc(m.name)}</div><div class="faint" style="font-size:var(--fs-xs)">${esc(m.title)}</div></div><span class="badge">${tr(m.role)}</span></div>`).join('')}</section></div>
  </div>`;
}
export function pageMember() {
  const m = mem(S.ui.params.id);
  if (!m) return page404();
  const ts = allTasks().filter(t => t.assignee === m.id);
  const open = ts.filter(t => t.status !== 'done');
  const done = ts.filter(t => t.status === 'done');
  const ps = visibleProjects().filter(p => p.members.includes(m.id) && p.status !== 'complete' && canSee(p));
  const acts = D()
    .activity.filter(a => a.by === m.id)
    .slice(0, 8);
  const tab = S.ui.memTab || 'assigned';
  return `<div class="page">
    <div class="row" style="gap:calc(var(--space-unit) * 4.5);margin-bottom:calc(var(--space-unit) * 5.5);flex-wrap:wrap;align-items:flex-start">
      ${av(m.id, 'xl ' + (m.last != null && m.last < 5 ? 'presence' : ''), false)}
      <div class="grow" style="min-width:220px"><div class="row" style="gap:var(--s-2-5);flex-wrap:wrap"><h1 style="font-size:var(--fs-2xl);margin:0;font-weight:var(--fw-semibold);letter-spacing:-.02em">${esc(m.name)}</h1><span class="badge">${m.role === 'Owner' ? ic('crown', 11) : ''}${tr(m.role)}</span>${m.status === 'invited' ? `<span class="badge amber">${tr('Invite pending')}</span>` : ''}</div>
        <div class="muted" style="margin-top:calc(var(--space-unit) * 0.75)">${esc(m.title)} · ${esc(TM[m.team].name)}</div>
        <div class="row faint" style="margin-top:var(--s-2);gap:var(--s-3-5);font-size:var(--fs-sm);flex-wrap:wrap"><span class="row" style="gap:calc(var(--space-unit) * 1.25)">${ic('mail', 13)}<span style="user-select:all">${esc(m.email)}</span></span><span class="row" style="gap:calc(var(--space-unit) * 1.25)">${ic('map-pin', 13)}${esc(m.tz)}</span><span class="row" style="gap:calc(var(--space-unit) * 1.25)">${ic('clock', 13)}${m.last == null ? tr('Never signed in') : m.last < 5 ? tr('Online now') : tr('Active ') + ago(minsAgo(m.last))}</span></div></div>
      <div class="row"><button class="btn btn-secondary" data-a="copyText" data-text="${esc(m.email)}">${tr('{value1}Copy email', { value1: ic('copy', 14) })}</button><button class="btn btn-primary" data-a="newTask" data-assignee="${m.id}">${tr('{value1}Assign task', { value1: ic('plus', 14) })}</button><button class="ibtn" data-a="ctxBtn" data-ctx="member" data-id="${m.id}" aria-label="${tr('More')}">${ic('ellipsis', 16)}</button></div>
    </div>
    <div class="stats" style="margin-bottom:calc(var(--space-unit) * 4.5)">
      <div class="stat"><span class="k">${tr('Active projects')}</span><span class="v">${ps.length}</span></div>
      <div class="stat"><span class="k">${tr('Assigned tasks')}</span><span class="v">${open.length}</span></div>
      <div class="stat"><span class="k">${tr('Completed tasks')}</span><span class="v">${done.length}</span></div>
      <div class="stat"><span class="k">${tr('Overdue')}</span><span class="v" style="${open.filter(isOver).length ? 'color:var(--red)' : ''}">${open.filter(isOver).length}</span></div>
    </div>
    <div class="grid2"><section class="panel"><div class="tabs" style="padding:0 var(--s-2)">${[
      ['assigned', tr('Assigned · {count}', { count: open.length })],
      ['completed', tr('Completed · {count}', { count: done.length })],
    ]
      .map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-a="set" data-k="memTab" data-v="${k}">${n}</button>`)
      .join('')}</div>
      ${(tab === 'assigned' ? sortTasks(open, { f: 'due', dir: 1 }) : done).map(t => miniRow(t, { av: false })).join('') || empty('list-checks', tr('No tasks here'), tr('Nothing to show in this list.'), '', 'sm')}</section>
      <div class="stack"><section class="panel"><div class="panel-h"><h2>${tr('Active projects')}</h2></div>${ps.map(p => `<div class="mini" data-a="go" data-r="project" data-id="${p.id}">${pIcon(p, '', 14)}<span class="tt">${esc(p.name)}</span><span class="faint" style="font-size:var(--fs-xs)">${p.lead === m.id ? tr('Lead') : tr('Member')}</span></div>`).join('') || `<div class="panel-b faint">${tr('No active projects')}</div>`}</section>
      <section class="panel"><div class="panel-h"><h2>${tr('Recent activity')}</h2></div><div class="panel-b feed">${acts.map(a => actHtml(a)).join('') || `<span class="faint">${tr('No recent activity')}</span>`}</div></section></div></div>
  </div>`;
}
