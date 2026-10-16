import { t as tr } from '../core/i18n.js';
/* ---------------- MODALS ---------------- */
import { $$, MOD, ago, esc, fmtDate } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { PCOLORS, PICONS } from '../core/constants.js';
import { D, S, mem, pColor, proj, task, teamsList } from '../core/store.js';
import { FT, av, filePrev, lbl, prPill, stPill } from '../ui/helpers.js';
import { focusKey, render } from '../shell/render.js';
import { teamModal } from '../features/teams.js';

export function openModal(m) {
  S.ui.modalOpeners = S.ui.modalOpeners || [];
  S.ui.modalOpeners[S.ui.modals.length] = S.ui.popOpener && S.ui.pop ? S.ui.popOpener : focusKey(document.activeElement);
  S.ui.modals.push(m);
  S.ui.pop = null;
  render();
  setTimeout(() => {
    const all = $$('.modal');
    const last = all[all.length - 1];
    const af = last?.querySelector('[autofocus]');
    (af || last?.querySelector('input,textarea,button'))?.focus();
  }, 30);
}
export function closeModal() {
  S.ui.modals.pop();
  S.ui.pop = null;
  render();
}
export function modalHtml(m) {
  const H = (title, sub = '') =>
    `<div class="modal-h"><div><h2 id="mt-${m.type}">${title}</h2>${sub ? `<div class="muted" style="font-size:var(--fs-sm);margin-top:var(--s-half)">${sub}</div>` : ''}</div><button class="ibtn ibtn-sm" data-a="closeModal" aria-label="${tr('Close')}">${ic('x', 16)}</button></div>`;
  const wrap = (cls, inner) => `<div class="modal ${cls}" role="dialog" aria-modal="true" aria-labelledby="mt-${m.type}">${inner}</div>`;
  switch (m.type) {
    case 'task':
      return wrap('', taskModal(m, H));
    case 'project':
      return wrap('', projectModal(m, H));
    case 'share':
      return wrap('', shareModal(m, H));
    case 'invite':
      return wrap('', inviteModal(m, H));
    case 'confirm':
      return wrap('sm', confirmModal(m, H));
    case 'prompt':
      return wrap(
        'sm',
        `${H(esc(m.title))}<form class="modal-b" data-submit="promptSubmit"><div class="field"><label class="label" for="prompt-in">${esc(m.label)}</label><input class="input" id="prompt-in" value="${esc(m.value || '')}" autofocus></div></form><div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${tr('Cancel')}</button><button class="btn btn-primary" data-a="promptSubmit">${esc(m.ok || tr('Save'))}</button></div>`,
      );
    case 'shortcuts':
      return wrap('lg', shortcutsModal(H));
    case 'team':
      return wrap('', teamModal(m, H));
    case 'filePreview':
      return wrap('lg', filePreviewModal(m, H));
    case 'saveView':
      return wrap(
        'sm',
        `${H(tr('Save view'), tr('Save the current filters as a tab on this project.'))}<form class="modal-b" data-submit="saveViewSubmit"><div class="field"><label class="label" for="sv-name">${tr('View name')}</label><input class="input" id="sv-name" placeholder="${tr('e.g. Design review queue')}" autofocus></div><div class="field"><label class="label" for="sv-type">${tr('Layout')}</label><select class="select" id="sv-type"><option value="list">${tr('List')}</option><option value="board">${tr('Board')}</option><option value="table">${tr('Table')}</option></select></div>${m.nf ? `<div class="hint">${tr('{value1} filter{value2} will be saved with this view.', { value1: m.nf, value2: m.nf > 1 ? 's' : '' })}</div>` : '<div class="alert info">' + ic('info', 14) + `<span>${tr('No filters are active — the view will show all tasks. You can add filters after saving.')}</span></div>`}</form><div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${tr('Cancel')}</button><button class="btn btn-primary" data-a="saveViewSubmit">${tr('Save view')}</button></div>`,
      );
  }
  return '';
}
export function formChip(pop, html, label) {
  return `<button class="pillbtn bordered" data-a="pop" data-pop="${pop}" data-id="__form" ${pop === 'date' ? `data-field="${label}"` : ''} aria-label="${esc(label)}">${html}</button>`;
}
export function taskModal(m, H) {
  const f = S.ui.form;
  const p = proj(f.project);
  const err = S.ui.errors.title;
  return `${H(m.edit ? tr('Edit task') : tr('New task'), m.edit ? `<span class="mono">${esc(task(m.edit)?.key)}</span>` : '')}
  <form class="modal-b" data-submit="submitTask" style="gap:var(--s-3)">
    <div class="field"><label class="sr" for="f-title">${tr('Task name')}</label><input class="input input-lg ${err ? 'is-error' : ''}" id="f-title" data-in="form" data-f="title" value="${esc(f.title)}" placeholder="${tr('Task name')}" autofocus aria-invalid="${!!err}" aria-describedby="f-title-err" style="font-size:var(--fs-input);font-weight:var(--fw-medium)">${err ? `<span class="err" id="f-title-err">${ic('circle-alert', 12)}${esc(err)}</span>` : ''}</div>
    <div class="field"><label class="sr" for="f-desc">${tr('Description')}</label><textarea class="textarea" id="f-desc" data-in="form" data-f="desc" placeholder="${tr('Add a description… (optional)')}" rows="3">${esc(f.desc)}</textarea></div>
    <div class="row" style="flex-wrap:wrap;gap:var(--s-1-5)">
      ${formChip('project', `<span class="pdot" style="--c:${pColor(p)}"></span>${esc(p?.name || tr('Project'))}`, tr('Project'))}
      ${formChip('status', stPill(f.status), tr('Status'))}
      ${formChip('assignee', `${av(f.assignee, 'sm', false)}${esc(mem(f.assignee)?.name || tr('Assignee'))}`, tr('Assignee'))}
      ${formChip('priority', prPill(f.priority), tr('Priority'))}
      ${formChip('date', `${ic('calendar', 13)}${f.due ? tr('Due ') + fmtDate(f.due) : tr('Due date')}`, 'due')}
      ${formChip('date', `${ic('calendar-arrow-up', 13)}${f.start ? tr('Starts ') + fmtDate(f.start) : tr('Start date')}`, 'start')}
      ${formChip('labels', f.labels.length ? f.labels.map(lbl).join('') : `${ic('tag', 13)}${tr('Labels')}`, tr('Labels'))}
      ${formChip('recur', `${ic('repeat', 13)}${f.recur ? esc(tr(f.recur)) : tr('Repeat')}`, tr('Repeat'))}
    </div>
    <div class="field"><span class="label">${tr('Subtasks')}</span>
      ${f.subtasks.map((s, i) => `<div class="subt" style="padding:0 var(--s-1)">${ic('circle', 13)}<span class="s">${esc(s.title)}</span><button type="button" class="ibtn ibtn-xs x" style="opacity:1" data-a="formRmSub" data-i="${i}" aria-label="${tr('Remove')}">${ic('x', 12)}</button></div>`).join('')}
      <div class="inwrap">${ic('plus', 14)}<input class="input" id="f-sub" data-key-enter="formAddSub" placeholder="${tr('Add a subtask and press Enter')}"></div></div>
    <div class="field"><span class="label">${tr('Attachments')}</span>
      ${f.files.length ? `<div class="col" style="gap:var(--s-1)">${f.files.map((x, i) => `<div class="upl" style="padding:var(--s-1-5) var(--s-2-5)"><span class="ftype" style="--c:${FT[x.type].c};width:22px;height:22px">${ic(FT[x.type].i, 12)}</span><span class="grow trunc">${esc(x.name)}</span><span class="faint" style="font-size:var(--fs-meta)">${esc(x.size)}</span><button type="button" class="ibtn ibtn-xs" data-a="formRmFile" data-i="${i}" aria-label="${tr('Remove')}">${ic('x', 12)}</button></div>`).join('')}</div>` : ''}
      <label class="dropzone" style="padding:var(--s-2-5)">${ic('paperclip', 14)}<span>${tr('Attach files')}</span><input type="file" multiple hidden data-in="formFiles"></label></div>
  </form>
  <div class="modal-f">${m.edit ? '' : `<label class="row" style="gap:var(--s-2);font-size:var(--fs-sm);color:var(--text-2);cursor:pointer"><input type="checkbox" class="toggle" id="f-more" data-in="formMore" ${f.more ? 'checked' : ''}>${tr('Create more')}</label>`}<span class="sp"></span>
    <span class="faint hide-m" style="font-size:var(--fs-meta)"><kbd>${MOD}</kbd> <kbd>↵</kbd></span>
    <button class="btn btn-secondary" data-a="closeModal">${tr('Cancel')}</button><button class="btn btn-primary" data-a="submitTask" id="f-submit">${m.edit ? tr('Save changes') : tr('Create task')}</button></div>`;
}
export const TEMPLATES = [
  {
    id: 'blank',
    get name() {
      return tr('Blank project');
    },
    icon: 'file',
    get desc() {
      return tr('Start from scratch');
    },
    tasks: [],
  },
  {
    id: 'product',
    get name() {
      return tr('Product Development');
    },
    icon: 'target',
    get desc() {
      return tr('Discovery to launch');
    },
    tasks: ['Define problem statement', 'User research plan', 'Write PRD', 'Design exploration', 'Build MVP', 'Beta launch'],
  },
  {
    id: 'web',
    get name() {
      return tr('Website');
    },
    icon: 'globe',
    get desc() {
      return tr('IA, design, build, launch');
    },
    tasks: ['Sitemap & information architecture', 'Wireframes', 'Visual design', 'Build page templates', 'Content migration', 'QA & launch'],
  },
  {
    id: 'mkt',
    get name() {
      return tr('Marketing Campaign');
    },
    icon: 'megaphone',
    get desc() {
      return tr('Brief, assets, channels');
    },
    tasks: ['Campaign brief', 'Audience research', 'Creative assets', 'Channel plan', 'Launch campaign', 'Performance report'],
  },
  {
    id: 'design',
    get name() {
      return tr('Design Project');
    },
    icon: 'palette',
    get desc() {
      return tr('Discovery to handoff');
    },
    tasks: ['Discovery workshop', 'Moodboard', 'Concept directions', 'Refinement', 'Developer handoff'],
  },
  {
    id: 'software',
    get name() {
      return tr('Software Development');
    },
    icon: 'code',
    get desc() {
      return tr('Spec, build, ship');
    },
    tasks: ['Technical spec', 'Set up repo & CI', 'Implement core API', 'Write tests', 'Code review', 'Deploy to staging'],
  },
  {
    id: 'personal',
    get name() {
      return tr('Personal Project');
    },
    icon: 'heart',
    get desc() {
      return tr('Plan your own goals');
    },
    tasks: ['Brain dump ideas', 'Pick top 3 priorities', 'Schedule focus time', 'Weekly review'],
  },
];
export function projectModal(m, H) {
  const f = S.ui.pform;
  const err = S.ui.errors.pname;
  return `${H(m.edit ? tr('Project settings') : tr('New project'), m.edit ? '' : tr('Projects hold tasks, files, and conversations for one body of work.'))}
  <form class="modal-b" data-submit="submitProject">
    <div class="row" style="gap:var(--s-2-5);align-items:flex-start">
      <button type="button" class="picon lg" style="--c:${PCOLORS[f.color]};cursor:default;flex-shrink:0;margin-top:calc(var(--space-unit) * 5.5)" aria-hidden="true" tabindex="-1">${ic(f.icon, 18)}</button>
      <div class="field grow"><label class="label" for="p-name">${tr('Project name')}</label><input class="input ${err ? 'is-error' : ''}" id="p-name" data-in="pform" data-f="name" value="${esc(f.name)}" placeholder="${tr('e.g. Website Redesign')}" autofocus aria-invalid="${!!err}">${err ? `<span class="err">${ic('circle-alert', 12)}${esc(err)}</span>` : ''}</div>
    </div>
    <div class="field"><label class="label" for="p-desc">${tr('Description')}</label><textarea class="textarea" id="p-desc" data-in="pform" data-f="desc" rows="2" placeholder="${tr('What is this project about?')}">${esc(f.desc)}</textarea></div>
    <div class="row" style="gap:var(--s-4);align-items:flex-start;flex-wrap:wrap">
      <div class="field" style="flex:1;min-width:220px"><span class="label">${tr('Icon')}</span><div class="iconpick" role="radiogroup" aria-label="${tr('Icon')}">${PICONS.map(i => `<button type="button" role="radio" aria-checked="${f.icon === i}" class="${f.icon === i ? 'on' : ''}" data-a="pformSet" data-f="icon" data-v="${i}" aria-label="${i}">${ic(i, 15)}</button>`).join('')}</div></div>
      <div class="field"><span class="label">${tr('Color')}</span><div class="swatches" role="radiogroup" aria-label="${tr('Color')}" style="max-width:140px">${Object.entries(
        PCOLORS,
      )
        .map(
          ([k, v]) =>
            `<button type="button" role="radio" aria-checked="${f.color === k}" class="sw ${f.color === k ? 'on' : ''}" style="--c:${v};width:22px;height:22px" data-a="pformSet" data-f="color" data-v="${k}" aria-label="${k}">${f.color === k ? ic('check', 12) : ''}</button>`,
        )
        .join('')}</div></div>
    </div>
    <div class="row" style="gap:var(--s-3);flex-wrap:wrap">
      <div class="field" style="flex:1;min-width:150px"><label class="label" for="p-team">${tr('Team')}</label><select class="select" id="p-team" data-in="pform" data-f="team">${teamsList()
        .map(t => `<option value="${t.id}" ${f.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`)
        .join('')}</select></div>
      <div class="field" style="flex:1;min-width:150px"><label class="label" for="p-lead">${tr('Lead')}</label><select class="select" id="p-lead" data-in="pform" data-f="lead">${D()
        .members.filter(x => x.status === 'active')
        .map(x => `<option value="${x.id}" ${f.lead === x.id ? 'selected' : ''}>${esc(x.name)}</option>`)
        .join('')}</select></div>
      <div class="field" style="flex:1;min-width:150px"><label class="label" for="p-due">${tr('Target date')}</label><input type="date" class="input" id="p-due" data-in="pform" data-f="due" value="${f.due || ''}"></div>
    </div>
    ${m.edit ? '' : `<div class="field"><span class="label">${tr('Template')}</span><div class="tmpls" role="radiogroup">${TEMPLATES.map(t => `<button type="button" role="radio" aria-checked="${f.tmpl === t.id}" class="opt ${f.tmpl === t.id ? 'on' : ''}" data-a="pformSet" data-f="tmpl" data-v="${t.id}" style="padding:var(--s-2-5)">${ic(t.icon, 16)}<b style="font-size:var(--fs-sm)">${t.name}</b><span>${t.tasks.length ? t.tasks.length + tr(' starter tasks') : t.desc}</span></button>`).join('')}</div></div>`}
  </form>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${tr('Cancel')}</button><button class="btn btn-primary" data-a="submitProject">${m.edit ? tr('Save changes') : tr('Create project')}</button></div>`;
}
export const PERMS = ['Can view', 'Can comment', 'Can edit', 'Full access'];
export function shareModal(m, H) {
  const p = proj(m.id);
  p.perms = p.perms || {};
  p.access = p.access || 'workspace';
  return `${H(tr('Share “{value1}”', { value1: esc(p.name) }))}
  <div class="modal-b">
    <form class="row" style="gap:var(--s-1-5)" data-submit="shareInvite"><div class="grow"><label class="sr" for="share-in">${tr('Invite by email')}</label><input class="input" id="share-in" placeholder="${tr('Add people by name or email')}" value="${esc(S.ui.shareQ || '')}" data-in="shareQ" autofocus></div>
      <select class="select" id="share-perm" style="width:132px" aria-label="${tr('Permission')}">${PERMS.map(x => `<option value="${x}" ${x === 'Can edit' ? 'selected' : ''}>${tr(x)}</option>`).join('')}</select>
      <button class="btn btn-primary" data-a="shareInvite" type="button">${tr('Invite')}</button></form>
    ${
      S.ui.shareQ
        ? `<div class="panel" style="padding:var(--s-1)">${
            D()
              .members.filter(
                x => !p.members.includes(x.id) && (x.name.toLowerCase().includes(S.ui.shareQ.toLowerCase()) || x.email.includes(S.ui.shareQ.toLowerCase())),
              )
              .map(
                x =>
                  `<button class="mi" data-a="shareAdd" data-id="${p.id}" data-mid="${x.id}">${av(x.id, 'sm', false)}${esc(x.name)}<span class="r">${esc(x.email)}</span></button>`,
              )
              .join('') ||
            `<div class="mi faint" style="cursor:default">${S.ui.shareQ.includes('@') ? tr('Press Invite to send an invitation to {email}', { email: esc(S.ui.shareQ) }) : tr('No matching members — enter an email to invite someone new')}</div>`
          }</div>`
        : ''
    }
    <div><div class="eyebrow" style="margin-bottom:var(--s-1)">${tr('People with access')}</div>
      ${p.members
        .map(id => {
          const x = mem(id);
          if (!x) return '';
          const perm = id === p.lead ? 'Full access' : p.perms[id] || (x.role === 'Guest' ? 'Can comment' : 'Can edit');
          return `<div class="row" style="height:44px">${av(id, 'md', false)}<div class="grow"><div style="font-weight:var(--fw-medium);font-size:var(--fs-body-sm)">${esc(x.name)}${id === D().me ? ` <span class="faint" style="font-weight:var(--fw-regular)">${tr('(you)')}</span>` : ''}</div><div class="faint" style="font-size:var(--fs-meta)">${esc(x.email)}${id === p.lead ? tr(' · Project lead') : ''}</div></div>
          ${id === p.lead ? `<span class="muted" style="font-size:var(--fs-sm);padding-right:var(--s-2)">${tr('Full access')}</span>` : `<select class="select" style="width:auto;height:26px;font-size:var(--fs-xs);border-color:transparent;background-color:transparent" data-in="sharePerm" data-id="${p.id}" data-mid="${id}" aria-label="${tr('Permission for {value1}', { value1: esc(x.name) })}">${PERMS.map(q => `<option value="${q}" ${q === perm ? 'selected' : ''}>${tr(q)}</option>`).join('')}<option value="__remove">${tr('Remove access')}</option></select>`}</div>`;
        })
        .join('')}
    </div>
    <div style="border-top:1px solid var(--divider);padding-top:var(--s-3)"><div class="eyebrow" style="margin-bottom:var(--s-2)">${tr('General access')}</div>
      <div class="row" style="gap:var(--s-2-5)"><span class="ftype" style="--c:var(--text-2)">${ic(p.access === 'private' ? 'lock' : 'building-2', 14)}</span><div class="grow"><select class="select" style="height:28px;width:auto;border-color:transparent;padding-left:var(--s-1);font-weight:var(--fw-medium)" data-in="shareAccess" data-id="${p.id}" aria-label="${tr('General access')}"><option value="private" ${p.access === 'private' ? 'selected' : ''}>${tr('Only people invited')}</option><option value="workspace" ${p.access === 'workspace' ? 'selected' : ''}>${tr('Everyone at {value1}', { value1: esc(D().ws.name) })}</option></select><div class="faint" style="font-size:var(--fs-meta);padding-left:var(--s-1)">${p.access === 'private' ? tr('Only people listed above can open this project.') : tr('Anyone in the workspace can view and comment.')}</div></div></div></div>
  </div>
  <div class="modal-f"><button class="btn btn-secondary" data-a="copyLink" data-pid="${p.id}">${tr('{value1}Copy link', { value1: ic('link', 14) })}</button><span class="sp"></span><button class="btn btn-primary" data-a="closeModal">${tr('Done')}</button></div>`;
}
export function inviteModal(m, H) {
  const err = S.ui.errors.invite;
  return `${H(tr('Invite to ') + esc(D().ws.name), tr('Invited people get an email with a link to join.'))}
  <form class="modal-b" data-submit="submitInvite">
    <div class="field"><label class="label" for="inv-emails">${tr('Email addresses')}</label><textarea class="textarea ${err ? 'is-error' : ''}" id="inv-emails" placeholder="${tr('name@company.com, another@company.com')}" rows="3" autofocus>${esc(S.ui.inviteDraft || '')}</textarea>${err ? `<span class="err">${ic('circle-alert', 12)}${esc(err)}</span>` : `<span class="hint">${tr('Separate multiple addresses with commas.')}</span>`}</div>
    <div class="row" style="gap:var(--s-3)"><div class="field grow"><label class="label" for="inv-role">${tr('Role')}</label><select class="select" id="inv-role">${['Member', 'Admin', 'Guest'].map(r => `<option value="${r}">${tr(r)}</option>`).join('')}</select></div>
    <div class="field grow"><label class="label" for="inv-team">${tr('Team')}</label><select class="select" id="inv-team">${teamsList()
      .map(t => `<option value="${t.id}">${esc(t.name)}</option>`)
      .join('')}</select></div></div>
    <div class="alert info">${ic('info', 14)}<span><b>${tr('Guests')}</b> ${tr("can only see projects they're added to and can't create projects.")}</span></div>
  </form>
  <div class="modal-f"><button class="btn btn-ghost" data-a="copyInviteLink">${tr('{value1}Copy invite link', { value1: ic('link', 14) })}</button><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal">${tr('Cancel')}</button><button class="btn btn-primary" data-a="submitInvite" id="inv-submit">${tr('Send invites')}</button></div>`;
}
export function confirmModal(m) {
  const needs = m.typeName;
  const ok = !needs || (S.ui.confirmText || '') === needs;
  return `<div class="modal-b" style="padding-top:calc(var(--space-unit) * 4.5);gap:var(--s-2-5)">
    <div class="row" style="gap:var(--s-3);align-items:flex-start"><span class="ftype" style="--c:${m.danger ? 'var(--red)' : 'var(--amber)'};width:34px;height:34px;border-radius:calc(var(--radius-unit) * 4.5)">${ic(m.icon || (m.danger ? 'trash-2' : 'archive'), 17)}</span>
    <div class="grow"><h2 id="mt-confirm" style="font-size:var(--fs-input);font-weight:var(--fw-semibold);margin:var(--s-1) 0 var(--s-1-5)">${esc(m.title)}</h2><p class="muted" style="margin:0;font-size:var(--fs-body-sm);line-height:var(--lh-copy)">${m.body}</p></div></div>
    ${needs ? `<div class="field" style="margin-top:var(--s-1-5)"><label class="label" for="confirm-in" style="font-weight:var(--fw-regular);color:var(--text-2)">${tr('Type')} <b style="color:var(--text);font-weight:var(--fw-semibold)">${esc(needs)}</b> ${tr('to confirm')}</label><input class="input" id="confirm-in" data-in="confirmText" autocomplete="off" autofocus value="${esc(S.ui.confirmText || '')}"></div>` : ''}
  </div>
  <div class="modal-f"><span class="sp"></span><button class="btn btn-secondary" data-a="closeModal" ${needs ? '' : 'autofocus'}>${tr('Cancel')}</button><button class="btn ${m.danger ? 'btn-danger' : 'btn-primary'}" data-a="confirmOk" ${ok ? '' : 'disabled'}>${esc(m.ok)}</button></div>`;
}
export const SHORTCUTS = [
  [
    'General',
    [
      ['Command menu', [MOD, 'K']],
      ['Search', ['/']],
      ['Keyboard shortcuts', ['?']],
      ['Toggle sidebar', ['[']],
      ['Toggle dark mode', [MOD, 'Shift', 'L']],
      ['Close panel or dialog', ['Esc']],
    ],
  ],
  [
    'Create',
    [
      ['New task', ['N']],
      ['New project', ['P']],
      ['Submit form', [MOD, '↵']],
      ['Send comment', [MOD, '↵']],
    ],
  ],
  [
    'Navigate',
    [
      ['Go to Home', ['G', 'H']],
      ['Go to My Tasks', ['G', 'T']],
      ['Go to Projects', ['G', 'P']],
      ['Go to Inbox', ['G', 'I']],
      ['Go to Calendar', ['G', 'C']],
      ['Go to Settings', ['G', 'S']],
    ],
  ],
  [
    'Command menu',
    [
      ['Move selection', ['↑', '↓']],
      ['Run command', ['↵']],
      ['Search mode', ['Tab']],
    ],
  ],
];
export function shortcutsModal(H) {
  return `${H(tr('Keyboard shortcuts'))}<div class="modal-b" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:calc(var(--space-unit) * 5.5)">${SHORTCUTS.map(([g, list]) => `<div><div class="eyebrow" style="margin-bottom:var(--s-1-5)">${tr(g)}</div>${list.map(([n, k]) => `<div class="row" style="height:30px;font-size:var(--fs-body-sm);border-bottom:1px solid var(--divider)"><span class="grow">${tr(n)}</span>${k.map((x, i) => `${i && k[0] === 'G' ? `<span class="faint" style="font-size:var(--fs-2xs)">${tr('then')}</span>` : ''}<kbd>${x}</kbd>`).join('')}</div>`).join('')}</div>`).join('')}</div>`;
}
export function filePreviewModal(m, H) {
  const f = m.file;
  const t = FT[f.type] || FT.other;
  return `${H(esc(f.name), tr('{value1} · {value2} · Uploaded by {value3} {value4}', { value1: t.n, value2: esc(f.size), value3: esc(mem(f.by)?.name || tr('You')), value4: ago(f.at) }))}
  <div class="modal-b"><div style="border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden">${filePrev(f).replace('class="fprev"', 'class="fprev" style="aspect-ratio:16/9"')}</div>
  ${m.tid ? `<div class="row faint" style="font-size:var(--fs-sm)">${tr('{value1}Attached to', { value1: ic('link', 13) })} <button class="link" data-a="openTask" data-id="${m.tid}">${esc(task(m.tid)?.title)}</button></div>` : ''}</div>
  <div class="modal-f"><button class="btn btn-secondary" data-a="copyLink" data-fid="${f.id}">${tr('{value1}Copy link', { value1: ic('link', 14) })}</button><span class="sp"></span><button class="btn btn-primary" data-a="closeModal">${tr('Close')}</button></div>`;
}
