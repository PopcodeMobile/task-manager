import { t as tr, formatDate } from '../core/i18n.js';
/* ---------- HOME ---------- */
import { DAY, TODAY, diffD, esc, fmtDate, parse } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, allTasks, canSee, isOver, pColor, progressOf, proj, visibleProjects } from '../core/store.js';
import { av, avStack, empty, pIcon, pStatus, prIcon, progBar } from '../ui/helpers.js';
import { sortTasks } from '../shell/view-engine.js';
import { actHtml, miniRow } from '../components/task-list.js';

export function pageHome() {
  const h = new Date().getHours();
  const greet = h < 12 ? tr('Good morning') : h < 18 ? tr('Good afternoon') : tr('Good evening');
  const all = allTasks();
  const mineAll = all.filter(t => t.assignee === D().me);
  const activeP = visibleProjects().filter(p => canSee(p) && p.status !== 'complete');
  const open = all.filter(t => t.status !== 'done');
  const doneWk = all.filter(t => t.status === 'done' && t.completedAt && Date.now() - t.completedAt < 7 * DAY);
  const over = all.filter(isOver);
  const tab = S.ui.homeTab;
  const lists = {
    upcoming: sortTasks(
      mineAll.filter(t => t.status !== 'done' && !isOver(t)),
      { f: 'due', dir: 1 },
    ),
    overdue: mineAll.filter(isOver),
    completed: sortTasks(
      mineAll.filter(t => t.status === 'done'),
      { f: 'updated', dir: 1 },
    ),
  };
  const cur = lists[tab].slice(0, 7);
  const dl = (lab, a, b) => {
    const ts = sortTasks(
      open.filter(t => t.due && diffD(parse(t.due), TODAY) >= a && diffD(parse(t.due), TODAY) <= b),
      { f: 'priority', dir: 1 },
    );
    return { lab, ts };
  };
  const dls = [dl(tr('Today'), 0, 0), dl(tr('Tomorrow'), 1, 1), dl(tr('This week'), 2, 7)];
  return `<div class="page">
    <div class="ph"><div><h1>${greet}, ${esc(S.prefs.name.split(' ')[0])}</h1><p><span class="num">${formatDate(TODAY, { weekday: 'long', month: 'long', day: 'numeric' })}</span> ${tr("· Here's what's happening across your workspace.")}</p></div>
      <div class="acts"><button class="btn btn-secondary hide-m" data-a="invite">${tr('{value1}Invite member', { value1: ic('user-plus', 14) })}</button><button class="btn btn-secondary hide-m" data-a="newProject">${tr('{value1}New project', { value1: ic('folder-plus', 14) })}</button><button class="btn btn-primary" data-a="newTask">${tr('{value1}New task', { value1: ic('plus', 14) })}</button></div></div>
    <div class="stats" style="margin-bottom:var(--s-4)">
      <button class="stat" data-a="go" data-r="projects"><span class="k">${tr('{value1}Active projects', { value1: ic('folder-kanban', 14) })}</span><span class="v">${activeP.length}</span><span class="d">${tr('{value1} at risk', { value1: activeP.filter(p => p.status === 'risk').length })}</span></button>
      <button class="stat" data-a="goTasks" data-f="open"><span class="k">${tr('{value1}Open tasks', { value1: ic('circle-dashed', 14) })}</span><span class="v">${open.length}</span><span class="d">${tr('{value1} assigned to you', { value1: open.filter(t => t.assignee === D().me).length })}</span></button>
      <button class="stat" data-a="goTasks" data-f="done"><span class="k">${tr('{value1}Completed', { value1: ic('circle-check', 14) })}</span><span class="v">${doneWk.length}</span><span class="d up">${tr('this week')}</span></button>
      <button class="stat" data-a="goTasks" data-f="overdue"><span class="k">${tr('{value1}Overdue', { value1: ic('clock-alert', 14) })}</span><span class="v" style="${over.length ? 'color:var(--red)' : ''}">${over.length}</span><span class="d ${over.length ? 'bad' : ''}">${over.length ? tr('need attention') : tr('all on track')}</span></button>
    </div>
    <div class="grid2">
      <div class="stack">
        <section class="panel" aria-labelledby="h-mytasks">
          <div class="panel-h"><h2 id="h-mytasks">${tr('My tasks')}</h2>
            <div class="acts"><div class="seg" role="tablist">${[
              ['upcoming', tr('Upcoming')],
              ['overdue', tr('Overdue')],
              ['completed', tr('Completed')],
            ]
              .map(
                ([k, n]) =>
                  `<button role="tab" class="${tab === k ? 'on' : ''}" data-a="set" data-k="homeTab" data-v="${k}">${n} <span class="faint">${lists[k].length}</span></button>`,
              )
              .join('')}</div>
            <button class="ibtn ibtn-sm" data-a="go" data-r="mytasks" data-tip="${tr('Open My Tasks')}" aria-label="${tr('Open My Tasks')}">${ic('arrow-up-right', 15)}</button></div></div>
          ${cur.length ? cur.map(t => miniRow(t, { av: false })).join('') : empty(tab === 'overdue' ? 'circle-check' : 'list-checks', tab === 'overdue' ? tr('Nothing overdue') : tr('No tasks here'), tab === 'overdue' ? tr('Every task assigned to you is on schedule.') : tr('Add a task to get things moving.'), '', 'sm')}
          ${lists[tab].length > 7 ? `<button class="addrow" style="padding-left:var(--s-3-5);border-top:1px solid var(--divider);border-bottom:0" data-a="go" data-r="mytasks">${tr('View all {value1} tasks {value2}', { value1: lists[tab].length, value2: ic('arrow-right', 13) })}</button>` : ''}
        </section>
        <section class="panel">
          <div class="panel-h"><h2>${tr('Project progress')}</h2><div class="acts"><button class="btn btn-sm btn-ghost" data-a="go" data-r="projects">${tr('All projects')}</button></div></div>
          <div style="overflow-x:auto"><table class="perm-t" style="min-width:560px"><thead><tr><th style="padding-left:var(--s-3-5)">${tr('Project')}</th><th style="text-align:left">${tr('Status')}</th><th style="text-align:left;width:26%">${tr('Progress')}</th><th style="text-align:left">${tr('Due')}</th><th style="text-align:right;padding-right:var(--s-3-5)">${tr('Team')}</th></tr></thead><tbody>
          ${activeP
            .filter(canSee)
            .map(p => {
              const pr = progressOf(p.id);
              return `<tr style="cursor:pointer" data-a="go" data-r="project" data-id="${p.id}" data-tab="overview"><td style="padding-left:var(--s-3-5)"><span class="row">${pIcon(p, '', 14)}<b style="font-weight:var(--fw-medium)">${esc(p.name)}</b></span></td><td style="text-align:left">${pStatus(p.status)}</td><td><span class="row">${progBar(pr, p.status === 'risk' ? 'red' : '')}<span class="num faint" style="font-size:var(--fs-meta);width:30px">${pr}%</span></span></td><td style="text-align:left" class="num muted">${fmtDate(p.due)}</td><td style="text-align:right;padding-right:var(--s-3-5)">${avStack(p.members, 3)}</td></tr>`;
            })
            .join('')}
          </tbody></table></div>
        </section>
      </div>
      <div class="stack">
        <section class="panel">
          <div class="panel-h"><h2>${tr('Upcoming deadlines')}</h2><div class="acts"><button class="btn btn-sm btn-ghost" data-a="go" data-r="calendar">${tr('{value1}Calendar', { value1: ic('calendar', 13) })}</button></div></div>
          <div class="panel-b" style="padding-bottom:var(--s-1-5)">
          ${dls
            .map(
              g => `<div style="margin-bottom:var(--s-2-5)"><div class="row" style="font-size:var(--fs-meta);font-weight:var(--fw-semibold);color:var(--text-2);margin-bottom:var(--s-1)">${g.lab}<span class="faint" style="font-weight:var(--fw-medium)">${g.ts.length}</span></div>
            ${
              g.ts.length
                ? g.ts
                    .slice(0, 4)
                    .map(
                      t =>
                        `<div class="row" style="height:30px;cursor:pointer;gap:var(--s-2);font-size:var(--fs-body-sm)" data-a="openTask" data-id="${t.id}"><span class="pdot" style="--c:${pColor(proj(t.project))}"></span><span class="trunc grow">${esc(t.title)}</span>${prIcon(t.priority, 13)}${av(t.assignee, 'sm')}</div>`,
                    )
                    .join('') +
                  (g.ts.length > 4
                    ? `<div class="faint" style="font-size:var(--fs-meta);padding-left:var(--s-4)">${tr('+{value1} more', { value1: g.ts.length - 4 })}</div>`
                    : '')
                : `<div class="faint" style="font-size:var(--fs-sm);padding:var(--s-1) 0 var(--s-half)">${tr('Nothing due')}</div>`
            }</div>`,
            )
            .join('')}
          </div>
        </section>
        <section class="panel">
          <div class="panel-h"><h2>${tr('Recent activity')}</h2><div class="acts"><button class="btn btn-sm btn-ghost" data-a="go" data-r="activity">${tr('View all')}</button></div></div>
          <div class="panel-b feed lined">${D()
            .activity.slice(0, 7)
            .map(a => actHtml(a, { proj: true }))
            .join('')}</div>
        </section>
      </div>
    </div>
  </div>`;
}
