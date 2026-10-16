import { t as tr } from '../core/i18n.js';
/* ---------- SEARCH RESULTS ---------- */
import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, allTasks, canSee, mem, pColor, proj, task, visibleProjects } from '../core/store.js';
import { FT, av, empty, hl, pIcon, pStatus, stIcon } from '../ui/helpers.js';

export function searchAll(q) {
  q = (q || '').trim().toLowerCase();
  if (!q) return { tasks: [], projects: [], people: [], files: [], comments: [] };
  const has = s => (s || '').toLowerCase().includes(q);
  return {
    tasks: allTasks()
      .filter(t => has(t.title) || has(t.key) || has(t.desc.replace(/<[^>]+>/g, '')))
      .slice(0, 30),
    projects: visibleProjects().filter(p => has(p.name) || has(p.desc)),
    people: D().members.filter(m => has(m.name) || has(m.email) || has(m.title)),
    files: D().files.filter(f => has(f.name) && canSee(proj(f.project))),
    comments: D().comments.filter(c => has(c.text) && task(c.task) && canSee(proj(task(c.task).project))),
  };
}
export function pageSearch() {
  const q = S.ui.searchQ;
  const r = searchAll(q);
  const cat = S.ui.searchCat;
  const cats = [
    ['all', tr('All')],
    ['tasks', tr('Tasks')],
    ['projects', tr('Projects')],
    ['people', tr('People')],
    ['files', tr('Files')],
    ['comments', tr('Comments')],
  ];
  const total = Object.values(r).reduce((a, b) => a + b.length, 0);
  const sec = (k, title, html) =>
    (cat === 'all' || cat === k) && r[k].length
      ? `<section style="margin-bottom:calc(var(--space-unit) * 5.5)"><div class="eyebrow" style="margin-bottom:var(--s-1-5)">${title} · ${r[k].length}</div><div class="panel" style="overflow:hidden">${html}</div></section>`
      : '';
  return `<div class="page" style="max-width:860px">
    <div class="inwrap" style="margin-bottom:var(--s-3-5)">${ic('search', 16)}<input class="input input-lg" id="search-page-q" data-in="searchQ" placeholder="${tr('Search tasks, projects, people, files, and comments')}" value="${esc(q)}" style="padding-left:calc(var(--space-unit) * 8.5);font-size:var(--fs-input)" aria-label="${tr('Search')}"></div>
    <div class="tabs" style="margin-bottom:calc(var(--space-unit) * 4.5)">${cats.map(([k, n]) => `<button class="tab ${cat === k ? 'on' : ''}" data-a="set" data-k="searchCat" data-v="${k}">${n}<span class="cnt">${k === 'all' ? total : r[k].length}</span></button>`).join('')}</div>
    ${
      !q
        ? `<div class="row" style="gap:var(--s-1-5);flex-wrap:wrap"><span class="faint" style="font-size:var(--fs-sm)">${tr('Recent:')}</span>${D()
            .recentSearches.map(s => `<button class="badge" data-a="setSearch" data-q="${esc(s)}">${ic('history', 11)}${esc(s)}</button>`)
            .join('')}</div>`
        : total
          ? sec(
              'tasks',
              tr('Tasks'),
              r.tasks
                .map(
                  t =>
                    `<div class="mini" data-a="openTask" data-id="${t.id}">${stIcon(t.status)}<span class="mono faint" style="font-size:var(--fs-2xs)">${esc(t.key)}</span><span class="tt">${hl(t.title, q)}</span><span class="pj"><span class="pdot" style="--c:${pColor(proj(t.project))}"></span>${esc(proj(t.project).name)}</span>${av(t.assignee, 'sm')}</div>`,
                )
                .join(''),
            ) +
            sec(
              'projects',
              tr('Projects'),
              r.projects
                .map(
                  p =>
                    `<div class="mini" data-a="go" data-r="project" data-id="${p.id}">${pIcon(p, '', 13)}<span class="tt">${hl(p.name, q)} <span class="faint" style="font-size:var(--fs-xs)">— ${esc(p.desc.slice(0, 70))}…</span></span>${pStatus(p.status)}</div>`,
                )
                .join(''),
            ) +
            sec(
              'people',
              tr('People'),
              r.people
                .map(
                  m =>
                    `<div class="mini" data-a="go" data-r="member" data-id="${m.id}">${av(m.id, 'md', false)}<span class="tt">${hl(m.name, q)} <span class="faint" style="font-size:var(--fs-xs)">${esc(m.title)}</span></span><span class="faint" style="font-size:var(--fs-xs)">${esc(m.email)}</span></div>`,
                )
                .join(''),
            ) +
            sec(
              'files',
              tr('Files'),
              r.files
                .map(
                  f =>
                    `<div class="mini" data-a="go" data-r="project" data-id="${f.project}" data-tab="files"><span class="ftype" style="--c:${FT[f.type].c}">${ic(FT[f.type].i, 14)}</span><span class="tt">${hl(f.name, q)}</span><span class="faint" style="font-size:var(--fs-xs)">${esc(f.size)} · ${esc(proj(f.project).name)}</span></div>`,
                )
                .join(''),
            ) +
            sec(
              'comments',
              tr('Comments'),
              r.comments
                .map(
                  c =>
                    `<div class="mini" style="align-items:flex-start;padding-top:var(--s-2-5);padding-bottom:var(--s-2-5)" data-a="openTask" data-id="${c.task}">${av(c.by, 'sm')}<div class="grow" style="min-width:0"><div style="font-size:var(--fs-xs)" class="muted"><b style="color:var(--text);font-weight:var(--fw-medium)">${esc(mem(c.by).name)}</b> ${tr('on {value1} · {value2}', { value1: esc(task(c.task).title), value2: ago(c.at) })}</div><div style="font-size:var(--fs-body-sm)">${hl(c.text, q)}</div></div></div>`,
                )
                .join(''),
            )
          : `<div class="panel">${empty('search-x', tr('No results found'), tr('Nothing matches “{value1}”. Check the spelling or try a broader term.', { value1: q }), `<button class="btn btn-secondary btn-sm" data-a="setSearch" data-q="">${tr('Clear search')}</button>`)}</div>`
    }
  </div>`;
}
