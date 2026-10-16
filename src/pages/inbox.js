import { t as tr } from '../core/i18n.js';
/* ---------- INBOX ---------- */
import { MOD, ago, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, commentsOf, mem, pColor, proj, task } from '../core/store.js';
import { av, empty, fmtComment } from '../ui/helpers.js';
import { cellAssignee, cellDue, cellPrio, cellStatus } from '../components/task-list.js';
import { commentHtml } from '../overlays/drawer.js';

export function pageInbox() {
  const cats = [
    ['all', tr('All')],
    ['mention', tr('Mentions')],
    ['assign', tr('Assignments')],
    ['comment', tr('Comments')],
    ['update', tr('Updates')],
  ];
  const cat = S.ui.inboxCat;
  let ns = D()
    .notifs.slice()
    .sort((a, b) => b.at - a.at);
  const count = k => ns.filter(n => (k === 'all' || n.type === k) && !n.read).length;
  ns = ns.filter(n => cat === 'all' || n.type === cat);
  if (S.ui.inboxUnread) ns = ns.filter(n => !n.read);
  const sel = D().notifs.find(n => n.id === S.ui.inboxSel) || null;
  return `<div class="page flush">
    <div style="display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);flex:1;min-height:0" class="inbox-grid">
      <style>@media(max-width:900px){.inbox-grid{grid-template-columns:minmax(0,1fr)!important}.inbox-prev{display:${sel ? 'flex' : 'none'}!important;position:fixed;inset:0;z-index:48;background:var(--surface)}}</style>
      <div style="border-right:1px solid var(--border);display:flex;flex-direction:column;min-height:0">
        <div style="padding:calc(var(--space-unit) * 4.5) var(--gutter) 0" class="row"><h1 style="font-size:var(--fs-xl);margin:0;font-weight:var(--fw-semibold);letter-spacing:-.015em">${tr('Inbox')}</h1><span class="sp"></span>
          <label class="row" style="font-size:var(--fs-xs);color:var(--text-2);gap:var(--s-1-5);cursor:pointer"><input type="checkbox" class="toggle" data-a="toggleUnreadOnly" ${S.ui.inboxUnread ? 'checked' : ''}>${tr('Unread')}</label>
          <button class="ibtn ibtn-sm" data-a="markAllRead" data-tip="${tr('Mark all as read')}" aria-label="${tr('Mark all as read')}">${ic('check-check', 15)}</button></div>
        <div class="tabs inbox-tabs" role="tablist">${cats.map(([k, n]) => `<button role="tab" class="tab ${cat === k ? 'on' : ''}" data-a="set" data-k="inboxCat" data-v="${k}">${n}${count(k) ? `<span class="cnt">${count(k)}</span>` : ''}</button>`).join('')}</div>
        <div class="inbox-list" data-keep="inbox-list">
          ${ns.length ? ns.map(n => inboxItem(n, sel && sel.id === n.id)).join('') : empty('inbox', tr("You're all caught up."), S.ui.inboxUnread ? tr('No unread notifications in this category.') : tr('New mentions, assignments, and comments will show up here.'), '', 'sm')}
        </div>
      </div>
      <div class="inbox-prev" style="display:flex;flex-direction:column;min-height:0;overflow-y:auto">${sel ? inboxPreview(sel) : `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('mail-open', 20)}</div><h2 class="es-h">${tr('Select a notification')}</h2><p>${tr('Read the conversation and reply without leaving your inbox.')}</p></div></div></div>`}</div>
    </div>
  </div>`;
}
export function notifText(n) {
  const t = n.task ? task(n.task) : null;
  const p = n.project ? proj(n.project) : t ? proj(t.project) : null;
  const who = n.by ? `<b style="font-weight:var(--fw-semibold)">${esc(mem(n.by)?.name)}</b>` : '';
  if (!n.by && p && !t) return `<b style="font-weight:var(--fw-semibold)">${esc(tr(n.text))}</b>`;
  if (!n.by && t) return `<b style="font-weight:var(--fw-semibold)">${esc(t.title)}</b> <span class="muted">${esc(tr(n.text))}</span>`;
  return `${who} <span class="muted">${esc(tr(n.text))}</span> ${t ? `<b style="font-weight:var(--fw-medium)">${esc(t.title)}</b>` : ''}`;
}
export function notifIcon(n) {
  if (n.by) return av(n.by, 'md', false);
  const i = n.type === 'update' && n.project ? 'triangle-alert' : 'clock';
  return `<span class="av md" style="--c:${n.project ? 'var(--red)' : 'var(--amber)'}">${ic(i, 13)}</span>`;
}
export function inboxItem(n, on) {
  const t = n.task ? task(n.task) : null;
  const p = n.project ? proj(n.project) : t ? proj(t.project) : null;
  const typeIc = { mention: 'at-sign', assign: 'user-plus', comment: 'message-square', update: 'refresh-cw' }[n.type];
  return `<div class="row" style="align-items:flex-start;gap:var(--s-2-5);padding:var(--s-3) var(--gutter);border-bottom:1px solid var(--divider);cursor:pointer;position:relative;${on ? 'background:var(--surface-2);' : ''}" data-a="selNotif" data-id="${n.id}" role="button" tabindex="0">
    ${!n.read ? `<span style="position:absolute;left:6px;top:22px;width:6px;height:6px;border-radius:var(--r-circle);background:var(--accent)" aria-label="${tr('Unread')}"></span>` : ''}
    ${notifIcon(n)}
    <div class="grow" style="font-size:var(--fs-body-sm);line-height:var(--lh-body)">
      <div>${notifText(n)}</div>
      <div class="trunc muted" style="font-size:var(--fs-sm);margin-top:var(--s-half)">${fmtComment(n.snippet)}</div>
      <div class="row" style="gap:var(--s-1-5);margin-top:calc(var(--space-unit) * 1.25);font-size:var(--fs-meta);color:var(--text-3)">${ic(typeIc, 11)}${p ? `<span class="pdot" style="--c:${pColor(p)};width:6px;height:6px"></span>${esc(p.name)}` : ''}<span>·</span><span>${ago(n.at)}</span></div>
    </div>
    <button class="ibtn ibtn-xs" data-a="toggleRead" data-id="${n.id}" data-tip="${n.read ? tr('Mark as unread') : tr('Mark as read')}" aria-label="${n.read ? tr('Mark as unread') : tr('Mark as read')}">${ic(n.read ? 'mail' : 'mail-open', 13)}</button>
  </div>`;
}
export function inboxPreview(n) {
  const t = n.task ? task(n.task) : null;
  const p = n.project ? proj(n.project) : t ? proj(t.project) : null;
  if (!t)
    return `<div style="padding:var(--s-6) var(--s-7)"><button class="btn btn-sm btn-ghost" data-a="set" data-k="inboxSel" data-v="" style="margin:calc(var(--s-1) * -1) 0 var(--s-3) calc(var(--s-2) * -1)">${tr('{value1}Back', { value1: ic('arrow-left', 14) })}</button><div class="alert danger">${ic('triangle-alert', 16)}<div><b>${esc(tr(n.text))}</b><div class="muted" style="margin-top:var(--s-half)">${esc(n.snippet)}</div></div></div><div style="margin-top:var(--s-3-5)"><button class="btn btn-secondary" data-a="go" data-r="project" data-id="${p.id}" data-tab="overview">${tr('Open project')}</button></div></div>`;
  const cs = commentsOf(t.id).slice(-4);
  return `<div class="row" style="height:46px;padding:0 var(--s-4);border-bottom:1px solid var(--border);gap:var(--s-2);flex-shrink:0">
      <button class="ibtn ibtn-sm" data-a="set" data-k="inboxSel" data-v="" aria-label="${tr('Back')}">${ic('arrow-left', 15)}</button>
      <span class="pdot" style="--c:${pColor(p)}"></span><span class="muted" style="font-size:var(--fs-sm)">${esc(p.name)}</span><span class="faint mono">${esc(t.key)}</span><span class="sp"></span>
      <button class="btn btn-sm btn-secondary" data-a="openTask" data-id="${t.id}">${tr('{value1}Open task', { value1: ic('panel-right-open', 14) })}</button></div>
    <div style="padding:var(--s-6) var(--s-7);max-width:720px;width:100%">
      <h2 style="font-size:var(--fs-xl);margin:0 0 var(--s-2-5);font-weight:var(--fw-semibold);letter-spacing:-.015em">${esc(t.title)}</h2>
      <div class="row" style="flex-wrap:wrap;gap:var(--s-1);margin-bottom:calc(var(--space-unit) * 4.5)">${cellStatus(t)}${cellAssignee(t)}${cellPrio(t)}${cellDue(t)}</div>
      <div class="eyebrow" style="margin-bottom:var(--s-1)">${tr('Conversation')}</div>
      ${cs.length ? cs.map(commentHtml).join('') : `<p class="muted">${esc(n.snippet)}</p>`}
      <div class="cbox" style="margin-top:var(--s-2-5)"><textarea id="inbox-reply" data-in="draft" data-id="${t.id}" data-key-mod-enter="postComment" placeholder="${tr('Reply… use @ to mention')}" aria-label="${tr('Reply')}">${esc(S.ui.drafts[t.id] || '')}</textarea>
      <div class="row"><span class="faint" style="font-size:var(--fs-meta)">${tr('{value1}+Enter to send', { value1: MOD })}</span><span class="sp"></span><button class="btn btn-primary btn-sm" data-a="postComment" data-id="${t.id}">${tr('Reply')}</button></div></div>
    </div>`;
}
