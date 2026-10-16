import { t as tr } from '../core/i18n.js';
/* ---------- subtask detail view (inside the task drawer) ---------- */
import { esc, relDate } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { mem } from '../core/store.js';
import { av } from '../ui/helpers.js';

export function subtaskHtml(t, s) {
  const i = t.subtasks.indexOf(s);
  return `<div class="subview">
    <button class="pillbtn" data-a="closeSub" style="margin:calc(var(--s-1) * -1) 0 var(--s-3-5) calc(calc(var(--space-unit) * 1.75) * -1);font-size:var(--fs-sm);color:var(--text-2)">${ic('arrow-left', 14)}<span class="trunc" style="max-width:420px">${esc(t.title)}</span></button>
    <div class="row" style="gap:var(--s-2-5);align-items:flex-start">
      <input type="checkbox" class="check round" style="margin-top:calc(var(--space-unit) * 2.25)" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${t.id}" data-sid="${s.id}" aria-label="${s.done ? tr('Mark subtask not done') : tr('Mark subtask done')}">
      <textarea class="ttl-edit" id="s-title" rows="1" data-autosize data-blur="commitSubTitle" data-key-enter="blur" data-id="${t.id}" data-sid="${s.id}" aria-label="${tr('Subtask title')}" style="${s.done ? 'text-decoration:line-through;color:var(--text-3)' : ''}">${esc(s.title)}</textarea>
    </div>
    <div class="faint" style="font-size:var(--fs-xs);margin:var(--s-1) 0 0 calc(var(--space-unit) * 6.5)">${tr('Subtask {value1} of {value2} · {value3}', { value1: i + 1, value2: t.subtasks.length, value3: s.done ? tr('Done') : tr('Not completed') })}</div>
    <dl class="kv" style="margin-top:var(--s-4)">
      <dt>${tr('{value1}Assignee', { value1: ic('user', 14) })}</dt><dd><button class="pillbtn ${s.assignee ? '' : 'empty'}" data-a="pop" data-pop="subassignee" data-id="${t.id}" data-i="${i}">${av(s.assignee, 'sm', false)}<span>${s.assignee ? esc(mem(s.assignee)?.name) : tr('Unassigned')}</span></button></dd>
      <dt>${tr('{value1}Due date', { value1: ic('calendar', 14) })}</dt><dd><button class="pillbtn ${s.due ? '' : 'empty'}" data-a="pop" data-pop="date" data-field="subdue" data-id="${t.id}" data-i="${i}">${ic('calendar', 13)}<span class="num">${s.due ? relDate(s.due) : tr('Set date')}</span></button></dd>
      <dt>${tr('{value1}Parent', { value1: ic('folder', 14) })}</dt><dd><button class="pillbtn" data-a="closeSub"><span class="mono faint" style="font-size:var(--fs-2xs)">${esc(t.key)}</span>${esc(t.title)}</button></dd>
    </dl>
    <div class="dsec"><div class="dsec-h"><h3 id="s-note-l">${tr('Notes')}</h3></div>
      <textarea class="textarea" id="s-note" data-in="subNote" data-id="${t.id}" data-sid="${s.id}" rows="4" placeholder="${tr('Add details, links, or acceptance criteria…')}" aria-labelledby="s-note-l">${esc(s.note || '')}</textarea></div>
    <div class="dsec row" style="gap:var(--s-1-5);flex-wrap:wrap">
      <button class="btn btn-secondary btn-sm" data-a="promoteSub" data-id="${t.id}" data-sid="${s.id}">${tr('{value1}Convert to task', { value1: ic('arrow-up-right', 13) })}</button>
      <span class="sp"></span>
      <button class="btn btn-sm btn-ghost" data-a="subNav" data-id="${t.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="${tr('Previous subtask')}">${tr('{value1}Previous', { value1: ic('chevron-left', 14) })}</button>
      <button class="btn btn-sm btn-ghost" data-a="subNav" data-id="${t.id}" data-d="1" ${i === t.subtasks.length - 1 ? 'disabled' : ''} aria-label="${tr('Next subtask')}">${tr('Next{value1}', { value1: ic('chevron-right', 14) })}</button>
      <button class="btn btn-sm btn-danger-ghost" data-a="rmSub" data-id="${t.id}" data-sid="${s.id}">${tr('{value1}Delete', { value1: ic('trash-2', 13) })}</button>
    </div>
  </div>`;
}
