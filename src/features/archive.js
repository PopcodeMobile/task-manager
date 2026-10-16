import { t as tr } from '../core/i18n.js';
/* ---------- archive ---------- */
import { ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, canSee, proj } from '../core/store.js';
import { empty, pIcon, stIcon } from '../ui/helpers.js';

export function pageArchive() {
  const tab = S.ui.archTab || 'tasks';
  const ts = D()
    .tasks.filter(t => t.archived && canSee(proj(t.project)) && !proj(t.project)?.archived)
    .sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
  const ps = D().projects.filter(p => p.archived);
  const row = (lead, title, sub, when, restoreAct, delAct, id) =>
    `<div class="mini" style="min-height:52px;cursor:default;gap:var(--s-3)">${lead}<div class="grow" style="min-width:0"><div class="trunc" style="font-weight:var(--fw-medium)">${title}</div><div class="faint trunc" style="font-size:var(--fs-xs)">${sub}</div></div><span class="faint hide-m" style="font-size:var(--fs-xs);white-space:nowrap">${when}</span><button class="btn btn-secondary btn-sm" data-a="${restoreAct}" data-id="${id}">${tr('{value1}Restore', { value1: ic('rotate-ccw', 13) })}</button><button class="ibtn ibtn-sm" data-a="${delAct}" data-id="${id}" data-tip="${tr('Delete permanently')}" aria-label="${tr('Delete permanently')}" style="color:var(--red)">${ic('trash-2', 15)}</button></div>`;
  const body =
    tab === 'tasks'
      ? ts.length
        ? `<div class="panel" style="overflow:hidden">${ts
            .map(t => {
              const p = proj(t.project);
              return row(
                stIcon(t.status, 15),
                esc(t.title),
                `<span class="mono">${esc(t.key)}</span> · ${esc(p.name)}`,
                t.archivedAt ? tr('Archived ') + ago(t.archivedAt) : tr('Archived'),
                'restoreTask',
                'purgeTask',
                t.id,
              );
            })
            .join('')}</div>`
        : `<div class="panel">${empty('archive', tr('No archived tasks'), tr('Archive finished or abandoned tasks to keep boards focused. They wait here until you restore them.'), '')}</div>`
      : ps.length
        ? `<div class="panel" style="overflow:hidden">${ps.map(p => row(pIcon(p, '', 14), esc(p.name), `${tr('{count} tasks', { count: D().tasks.filter(t => t.project === p.id).length })} · ${PSTAT[p.status].name}`, p.archivedAt ? tr('Archived ') + ago(p.archivedAt) : tr('Archived'), 'restoreProject', 'delProject', p.id)).join('')}</div>`
        : `<div class="panel">${empty('archive', tr('No archived projects'), tr('Archived projects disappear from the sidebar and project lists but keep every task, file, and comment.'), '')}</div>`;
  return `<div class="page" style="max-width:900px">
    <div class="ph"><div><h1>${tr('Archive')}</h1><p>${tr('Archived work is hidden everywhere else. Restore it any time, or delete it for good.')}</p></div></div>
    <div class="tabs" style="margin-bottom:var(--s-3-5)" role="tablist" aria-label="${tr('Archive')}">${[
      ['tasks', tr('Tasks'), ts.length],
      ['projects', tr('Projects'), ps.length],
    ]
      .map(
        ([k, n, c]) =>
          `<button role="tab" aria-selected="${tab === k}" class="tab ${tab === k ? 'on' : ''}" data-a="set" data-k="archTab" data-v="${k}">${n}<span class="cnt">${c}</span></button>`,
      )
      .join('')}</div>
    ${body}
  </div>`;
}
