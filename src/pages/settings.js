import { t as tr, LOCALES, normalizeLocale } from '../core/i18n.js';
import { ACCENTS, THEME_PREVIEWS } from '../core/design-tokens.js';
/* =====================================================================
   SETTINGS · AUTH · ONBOARDING · DESIGN SYSTEM · SYSTEM STATES
   ===================================================================== */
import { dOff, esc, fmtDate } from '../core/utils.js';
import { ic, wsLogo } from '../core/icons.js';
import { D, S, me } from '../core/store.js';
import { av, pIcon } from '../ui/helpers.js';
import { permsTable, teamsGrid } from './members.js';
import { page404 } from './errors.js';
import { SHORTCUTS } from '../overlays/modals.js';
import { isCloudMode } from '../workspace/auth.js';
const cloudUnavailable = new Set([
  'sessions',
  '2fa',
  'plan',
  'payment',
  'invoices',
  'permissions',
  'notif-email',
  'notif-push',
  'notif-mentions',
  'notif-assign',
]);

export const SET_NAV = [
  [
    'General',
    [
      ['workspace', 'Workspace', 'building-2'],
      ['appearance', 'Appearance', 'palette'],
      ['language', 'Language', 'languages'],
      ['datetime', 'Date & time', 'clock'],
    ],
  ],
  [
    'Workspace',
    [
      ['members', 'Members', 'users'],
      ['teams', 'Teams', 'users-round'],
      ['projects', 'Projects', 'folder-kanban'],
      ['permissions', 'Permissions', 'shield'],
    ],
  ],
  [
    'Notifications',
    [
      ['notif-email', 'Email', 'mail'],
      ['notif-push', 'Push', 'smartphone'],
      ['notif-mentions', 'Mentions', 'at-sign'],
      ['notif-assign', 'Task assignments', 'user-check'],
    ],
  ],
  [
    'Personal',
    [
      ['profile', 'Profile', 'user'],
      ['preferences', 'Preferences', 'sliders-horizontal'],
      ['shortcuts', 'Keyboard shortcuts', 'keyboard'],
    ],
  ],
  [
    'Security',
    [
      ['password', 'Password', 'key-round'],
      ['sessions', 'Sessions', 'monitor-smartphone'],
      ['2fa', 'Two-factor authentication', 'shield-check'],
    ],
  ],
  [
    'Billing',
    [
      ['plan', 'Plan', 'gem'],
      ['payment', 'Payment', 'credit-card'],
      ['invoices', 'Invoices', 'receipt'],
    ],
  ],
];
export function srow(t, d, ctl) {
  return `<div class="srow"><div><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div><div class="row">${ctl}</div></div>`;
}
const preferenceLabels = {
  lang: 'Language',
  tz: 'Time zone',
  dateFmt: 'Date format',
  weekStart: 'Start week on',
  timeFmt: 'Time format',
  home: 'Open on launch',
  openTasks: 'Open tasks in',
  projView: 'Default project view',
  motion: 'Motion',
  spell: 'Spellcheck',
  showDoneBoard: 'Show completed tasks on boards',
  permCreate: 'Members can create projects',
  permGuests: 'Members can invite guests',
  permPublic: 'Allow public share links',
  confirmDel: 'Confirm before deleting tasks',
  email_mention: 'Mentions',
  email_assign: 'Assignments',
  email_comment: 'Comments',
  email_digest: 'Daily digest',
  push_mention: 'Mentions',
  push_assign: 'Assignments',
  push_comment: 'Comments',
  push_due: 'Due date reminders',
  mention_all: '@mentions in comments and descriptions',
  mention_team: '@team mentions',
  mention_ws: '@workspace mentions',
  assign_self: "When I'm assigned a task",
  assign_status: 'When my task changes status',
  assign_over: 'When my task is overdue',
};
const preferenceLabel = key => tr(preferenceLabels[key] || key);
export const tog = (k, on, src = 'pref') =>
  `<input type="checkbox" class="toggle" data-in="${src}Toggle" data-k="${k}" ${on ? 'checked' : ''} aria-label="${preferenceLabel(k)}">`;
export const sel = (k, opts, v) =>
  `<select class="select" style="width:auto;min-width:180px" data-in="prefSel" data-k="${k}" aria-label="${preferenceLabel(k)}">${opts
    .map(o => {
      const [val, n] = Array.isArray(o) ? o : [o, o];
      return `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${tr(n)}</option>`;
    })
    .join('')}</select>`;
export function pageSettings() {
  const sec = S.ui.params.sec || S.ui.settings || 'appearance';
  const navigation = isCloudMode()
    ? SET_NAV.map(([group, items]) => [group, items.filter(([key]) => !cloudUnavailable.has(key))]).filter(([, items]) => items.length)
    : SET_NAV;
  const title = SET_NAV.flatMap(g => g[1]).find(x => x[0] === sec) || ['appearance', tr('Appearance')];
  return `<div class="set">
    <nav class="set-nav" aria-label="${tr('Settings')}">${navigation.map(([g, items]) => `<div class="gh">${tr(g)}</div>${items.map(([k, n, i]) => `<button class="sitem ${sec === k ? 'on' : ''}" data-a="go" data-r="settings" data-sec="${k}">${ic(i, 15)}<span>${tr(n)}</span></button>`).join('')}`).join('')}</nav>
    <div class="set-body" data-keep="set:${sec}"><div class="set-in">${settingsBody(sec, tr(title[1]))}</div></div>
  </div>`;
}
export function settingsBody(sec, title) {
  const P = S.prefs;
  const d = D();
  const np = d.notifPrefs;
  const H = lead => `<h1>${title}</h1><p class="lead">${lead}</p>`;
  if (isCloudMode() && cloudUnavailable.has(sec)) return H(tr('This feature is not connected yet.'));
  if (isCloudMode() && sec === 'profile')
    return H(tr('Your account profile')) + `<div class="sblock"><p>${esc(me()?.name)}</p><p class="muted">${esc(me()?.email)}</p></div>`;
  switch (sec) {
    case 'workspace':
      return (
        H(tr('Your workspace name, address, and identity.')) +
        `
      <form data-submit="saveWorkspace">
      <div class="sblock" style="margin-top:0"><div class="row" style="gap:var(--s-3-5);margin-bottom:calc(var(--space-unit) * 4.5)">${wsLogo(d.ws, 52)}<div><div class="label" style="margin-bottom:var(--s-1-5)">${tr('Workspace icon')}</div><div class="swatches">${['#2F2E2A', '#5A67D8', '#3B82C4', '#23918A', '#C54B78', '#C48A1E'].map(c => `<button type="button" class="sw ${d.ws.c === c ? 'on' : ''}" style="--c:${c};width:22px;height:22px" data-a="wsColor" data-v="${c}" aria-label="${tr('Color {value1}', { value1: c })}"></button>`).join('')}</div></div></div>
      <div class="col" style="gap:var(--s-3-5);max-width:440px"><div class="field"><label class="label" for="ws-name">${tr('Workspace name')}</label><input class="input" id="ws-name" value="${esc(d.ws.name)}"></div>
      <div class="field"><label class="label" for="ws-url">${tr('Workspace URL')}</label><div class="row" style="gap:0"><span class="input" style="width:auto;background:var(--surface-2);border-right:0;border-radius:var(--r-sm) 0 0 var(--r-sm);display:flex;align-items:center;color:var(--text-2)">${tr('gr8rstudio.com/')}</span><input class="input" id="ws-url" value="${esc(d.ws.url)}" style="border-radius:0 var(--r-sm) var(--r-sm) 0"></div><span class="hint">${tr('Changing the URL will break existing links.')}</span></div>
      <div><button class="btn btn-primary" data-a="saveWorkspace" id="ws-save">${tr('Save changes')}</button></div></div></div></form>
      <div class="sblock"><h2 style="color:var(--red)">${tr('Danger zone')}</h2>${srow(tr('Delete workspace'), tr('Permanently delete this workspace, its projects, tasks, and files. This cannot be undone.'), `<button disabled class="btn btn-danger-ghost" style="border:1px solid color-mix(in srgb,var(--red) 35%,transparent)" data-a="delWorkspace">${tr('Delete workspace')}</button>`)}</div>`
      );
    case 'appearance':
      return (
        H(tr('Customize how Gr8r looks on this device.')) +
        `
      <div class="sblock" style="margin-top:0"><h2>${tr('Theme')}</h2><div class="themecards" style="margin-top:var(--s-3)" role="radiogroup" aria-label="${tr('Theme')}">${[
        ['light', tr('Light')],
        ['dark', tr('Dark')],
        ['system', tr('System')],
      ]
        .map(([k, n]) => {
          const L = THEME_PREVIEWS.light,
            Dk = THEME_PREVIEWS.dark;
          const pv = c =>
            `<div class="s" style="background:${c.s}"><i style="background:${c.b};width:70%"></i><i style="background:${c.a};width:55%"></i><i style="background:${c.b};width:80%"></i><i style="background:${c.b};width:60%"></i></div><div class="m" style="background:${c.bg}"><i style="background:${c.t};width:45%;height:7px"></i><i style="background:${c.b}"></i><i style="background:${c.b};width:80%"></i><i style="background:${c.a};width:30%;height:10px;margin-top:var(--s-1)"></i></div>`;
          return `<button class="tcard ${P.theme === k ? 'on' : ''}" role="radio" aria-checked="${P.theme === k}" data-a="setTheme" data-v="${k}"><div class="tprev" style="${k === 'system' ? 'grid-template-columns:1fr 1fr;display:grid' : ''}">${k === 'system' ? `<div style="display:grid;grid-template-columns:30% 1fr">${pv(L)}</div><div style="display:grid;grid-template-columns:30% 1fr">${pv(Dk)}</div>` : pv(k === 'light' ? L : Dk)}</div><span class="row" style="font-weight:var(--fw-medium);font-size:var(--fs-body-sm);gap:var(--s-1-5)">${ic(k === 'light' ? 'sun' : k === 'dark' ? 'moon' : 'monitor', 14)}${tr(n)}${P.theme === k ? `<span class="sp"></span><span style="color:var(--accent)">${ic('circle-check', 15)}</span>` : ''}</span></button>`;
        })
        .join('')}</div></div>
      <div class="sblock"><h2>${tr('Accent color')}</h2>${srow(
        tr('Accent'),
        tr('Used for primary buttons, focus rings, and selection.'),
        `<div class="swatches" role="radiogroup" aria-label="${tr('Accent color')}">${ACCENTS.map(
          ({ id: k, name, token }) =>
            `<button class="sw ${P.accent === k ? 'on' : ''}" style="--c:var(${token})" role="radio" aria-checked="${P.accent === k}" data-a="setPref" data-k="accent" data-v="${k}" aria-label="${tr(name)}" data-tip="${tr(name)}">${P.accent === k ? ic('check', 13) : ''}</button>`,
        ).join('')}</div>`,
      )}</div>
      <div class="sblock"><h2>${tr('Density')}</h2>
        ${srow(tr('Sidebar density'), tr('Compact fits more projects on screen.'), `<div class="seg">${['comfortable', 'compact'].map(k => `<button class="${P.side === k ? 'on' : ''}" data-a="setPref" data-k="side" data-v="${k}">${tr(k[0].toUpperCase() + k.slice(1))}</button>`).join('')}</div>`)}
        ${srow(tr('Task display'), tr('Row height in lists and card padding on boards.'), `<div class="seg">${['comfortable', 'compact'].map(k => `<button class="${P.density === k ? 'on' : ''}" data-a="setPref" data-k="density" data-v="${k}">${tr(k[0].toUpperCase() + k.slice(1))}</button>`).join('')}</div>`)}
        ${srow(
          tr('Motion'),
          tr('Reduce animations for drawers, modals, and transitions.'),
          sel(
            'motion',
            [
              ['system', 'Follow system'],
              ['reduce', 'Reduce motion'],
            ],
            P.motion,
          ),
        )}
      </div>`
      );
    case 'language':
      return (
        H(tr('Language and regional formats.')) +
        srow(
          tr('Language'),
          tr('The language used throughout the interface.'),
          sel(
            'lang',
            LOCALES.map(locale => [locale.id, locale.name]),
            normalizeLocale(P.lang),
          ),
        ) +
        srow(tr('Spellcheck'), tr('Check spelling in descriptions and comments.'), tog('spell', P.spell !== false))
      );
    case 'datetime':
      return (
        H(tr('How dates and times appear across the workspace.')) +
        srow(
          tr('Time zone'),
          tr('Used for due dates and reminders.'),
          sel('tz', ['(GMT-08:00) Pacific Time', '(GMT-05:00) Eastern Time', '(GMT+00:00) London', '(GMT+01:00) Berlin', '(GMT+08:00) Singapore'], P.tz),
        ) +
        srow(
          tr('Date format'),
          `${tr('Preview:')} <b>${fmtDate(dOff(8))}</b>`,
          sel(
            'dateFmt',
            [
              ['locale', tr('Locale default')],
              ['MMM d', fmtDate(dOff(8))],
              ['d/M', '1/10'],
              ['M/d', '10/1'],
              ['yyyy-MM-dd', '2026-10-01'],
            ],
            P.dateFmt,
          ),
        ) +
        srow(
          tr('Start week on'),
          tr('Affects calendars and the timeline.'),
          sel(
            'weekStart',
            [
              ['1', 'Monday'],
              ['0', 'Sunday'],
              ['6', 'Saturday'],
            ],
            P.weekStart,
          ),
        ) +
        srow(
          tr('Time format'),
          '',
          sel(
            'timeFmt',
            [
              ['12', '12-hour (2:30 PM)'],
              ['24', '24-hour (14:30)'],
            ],
            P.timeFmt || '12',
          ),
        )
      );
    case 'members':
      return (
        H(tr('{value1} people have access to {value2}.', { value1: d.members.length, value2: esc(d.ws.name) })) +
        `<div class="row" style="margin-bottom:var(--s-3)"><button class="btn btn-primary" data-a="invite">${tr('{value1}Invite member', { value1: ic('user-plus', 14) })}</button><button class="btn btn-secondary" data-a="go" data-r="members">${tr('Open member directory')}</button></div>
      <div class="panel" style="overflow:hidden">${d.members.map(m => `<div class="mini" style="min-height:52px;cursor:default" data-ctx="member" data-id="${m.id}">${av(m.id, 'md', false)}<div class="grow"><div style="font-weight:var(--fw-medium)">${esc(m.name)}</div><div class="faint" style="font-size:var(--fs-xs)">${esc(m.email)}</div></div>${m.status === 'invited' ? `<span class="badge amber">${tr('Invited')}</span>` : ''}${m.role === 'Owner' ? `<span class="pillbtn">${tr('{value1}Owner', { value1: ic('crown', 13) })}</span>` : `<button class="pillbtn bordered" data-a="pop" data-pop="role" data-id="${m.id}">${tr(m.role)}${ic('chevron-down', 12)}</button>`}<button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="member" data-id="${m.id}" aria-label="${tr('Options')}">${ic('ellipsis', 14)}</button></div>`).join('')}</div>`
      );
    case 'teams':
      return H(tr('Teams group people and projects.')) + teamsGrid();
    case 'projects': {
      const arch = d.projects.filter(p => p.archived);
      return (
        H(tr('Defaults for new projects and archived work.')) +
        srow(
          tr('Default project view'),
          tr('The tab that opens when you open a project.'),
          sel(
            'defaultTab',
            [
              ['board', 'Board'],
              ['list', 'List'],
              ['table', 'Table'],
              ['overview', 'Overview'],
              ['timeline', 'Timeline'],
            ],
            P.defaultTab || 'board',
          ),
        ) +
        srow(tr('Show completed tasks on boards'), '', tog('showDoneBoard', P.showDoneBoard !== false)) +
        `<div class="sblock"><h2>${tr('Archived projects')}</h2>${arch.length ? arch.map(p => `<div class="srow"><div class="row">${pIcon(p, '', 14)}<b style="font-weight:var(--fw-medium)">${esc(p.name)}</b></div><div class="row"><button class="btn btn-secondary btn-sm" data-a="restoreProject" data-id="${p.id}">${tr('Restore')}</button><button class="btn btn-danger-ghost btn-sm" data-a="delProject" data-id="${p.id}">${tr('Delete')}</button></div></div>`).join('') : `<p class="faint" style="padding:var(--s-3) 0">${tr('No archived projects. Archived projects are hidden from the sidebar but keep all their tasks.')}</p>`}<div style="margin-top:var(--s-3)"><button class="btn btn-secondary btn-sm" data-a="go" data-r="archive">${tr('{value1}Open archive', { value1: ic('archive', 13) })}</button></div></div>`
      );
    }
    case 'permissions':
      return (
        H(tr('Control what each role can do.')) +
        srow(tr('Members can create projects'), '', tog('permCreate', P.permCreate !== false)) +
        srow(tr('Members can invite guests'), tr('Guests only see projects they are added to.'), tog('permGuests', P.permGuests !== false)) +
        srow(tr('Allow public share links'), tr('Anyone with the link can view a project.'), tog('permPublic', !!P.permPublic)) +
        `<div class="sblock"><h2>${tr('Role permissions')}</h2><div style="margin-top:var(--s-3)">${permsTable()}</div></div>`
      );
    case 'notif-email':
      return (
        H(tr('Choose which emails you receive.')) +
        srow(tr('Mentions'), tr('When someone @mentions you.'), tog('email_mention', np.email_mention, 'np')) +
        srow(tr('Assignments'), tr('When a task is assigned to you.'), tog('email_assign', np.email_assign, 'np')) +
        srow(tr('Comments'), tr('On tasks you created or are assigned.'), tog('email_comment', np.email_comment, 'np')) +
        srow(tr('Daily digest'), tr('A summary of what changed, every weekday at 8:00.'), tog('email_digest', np.email_digest, 'np'))
      );
    case 'notif-push':
      return (
        H(tr('Notifications on desktop and mobile.')) +
        srow(tr('Mentions'), '', tog('push_mention', np.push_mention, 'np')) +
        srow(tr('Assignments'), '', tog('push_assign', np.push_assign, 'np')) +
        srow(tr('Comments'), '', tog('push_comment', np.push_comment, 'np')) +
        srow(tr('Due date reminders'), tr('One day before a task is due.'), tog('push_due', np.push_due, 'np'))
      );
    case 'notif-mentions':
      return (
        H(tr('Decide which mentions reach you.')) +
        srow(tr('@mentions in comments and descriptions'), '', tog('mention_all', np.mention_all, 'np')) +
        srow(tr('@team mentions'), tr('When your team is mentioned, e.g. @Product.'), tog('mention_team', np.mention_team !== false, 'np')) +
        srow(tr('@workspace mentions'), tr('Announcements to everyone.'), tog('mention_ws', !!np.mention_ws, 'np'))
      );
    case 'notif-assign':
      return (
        H(tr('Updates about tasks assigned to you.')) +
        srow(tr("When I'm assigned a task"), '', tog('assign_self', np.assign_self, 'np')) +
        srow(tr('When my task changes status'), '', tog('assign_status', np.assign_status !== false, 'np')) +
        srow(tr('When my task is overdue'), '', tog('assign_over', np.assign_over !== false, 'np'))
      );
    case 'profile': {
      const err = S.ui.errors.pname2;
      return (
        H(tr('How you appear to others in the workspace.')) +
        `<form data-submit="saveProfile" class="col" style="gap:var(--s-4);max-width:440px">
      <div class="row" style="gap:var(--s-3-5)">${av(d.me, 'xl', false)}<div><div class="label" style="margin-bottom:var(--s-1-5)">${tr('Avatar color')}</div><div class="swatches">${['#5A67D8', '#C54B78', '#3B82C4', '#23918A', '#C48A1E', '#8662C9'].map(c => `<button type="button" class="sw ${me().c === c ? 'on' : ''}" style="--c:${c};width:22px;height:22px" data-a="avColor" data-v="${c}" aria-label="${tr('Color')}"></button>`).join('')}</div></div></div>
      <div class="field"><label class="label" for="pf-name">${tr('Full name')}</label><input class="input ${err ? 'is-error' : ''}" id="pf-name" value="${esc(P.name)}">${err ? `<span class="err">${ic('circle-alert', 12)}${err}</span>` : ''}</div>
      <div class="field"><label class="label" for="pf-title">${tr('Job title')}</label><input class="input" id="pf-title" value="${esc(P.title)}"></div>
      <div class="field"><label class="label" for="pf-email">${tr('Email')}</label><input class="input" id="pf-email" value="${esc(me().email)}" disabled><span class="hint">${tr('Contact a workspace owner to change your sign-in email.')}</span></div>
      <div><button class="btn btn-primary" data-a="saveProfile" id="pf-save">${tr('Save profile')}</button></div></form>`
      );
    }
    case 'preferences':
      return (
        H(tr('Personal defaults for how you work.')) +
        srow(
          tr('Open on launch'),
          tr('The page you see when Gr8r opens.'),
          sel(
            'home',
            [
              ['home', 'Home'],
              ['mytasks', 'My Tasks'],
              ['inbox', 'Inbox'],
            ],
            P.home,
          ),
        ) +
        srow(
          tr('Open tasks in'),
          tr('Side panel keeps your place in the list.'),
          sel(
            'openTasks',
            [
              ['drawer', 'Side panel'],
              ['full', 'Full page'],
            ],
            P.openTasks,
          ),
        ) +
        srow(tr('Confirm before deleting tasks'), '', tog('confirmDel', P.confirmDel !== false))
      );
    case 'shortcuts':
      return (
        H(tr('Move faster with the keyboard.')) +
        SHORTCUTS.map(
          ([g, list]) =>
            `<div class="sblock" style="margin-top:calc(var(--space-unit) * 4.5)"><h2>${tr(g)}</h2>${list.map(([n, k]) => `<div class="srow" style="padding:calc(var(--space-unit) * 2.25) 0"><span>${tr(n)}</span><span class="row" style="gap:var(--s-1)">${k.map((x, i) => `${i && k[0] === 'G' ? `<span class="faint" style="font-size:var(--fs-2xs)">${tr('then')}</span>` : ''}<kbd>${x}</kbd>`).join('')}</span></div>`).join('')}</div>`,
        ).join('')
      );
    case 'password': {
      const e = S.ui.errors;
      const pw = S.ui.pwNew || '';
      return (
        H(tr("Use a long password you don't use anywhere else.")) +
        `${S.ui.pwDone ? `<div class="alert ok" style="margin-bottom:var(--s-3-5)">${ic('circle-check', 15)}<span>${tr('Password updated. Other sessions stay signed in.')}</span></div>` : ''}<form data-submit="savePassword" class="col" style="gap:var(--s-3-5);max-width:400px">
      <div class="field"><label class="label" for="pw-cur">${tr('Current password')}</label><input type="password" class="input ${e.pwCur ? 'is-error' : ''}" id="pw-cur" autocomplete="current-password">${e.pwCur ? `<span class="err">${ic('circle-alert', 12)}${e.pwCur}</span>` : ''}</div>
      <div class="field"><label class="label" for="pw-new">${tr('New password')}</label><input type="password" class="input ${e.pwNew ? 'is-error' : ''}" id="pw-new" data-in="pwStrength" value="${esc(pw)}" autocomplete="new-password">${strengthMeter(pw)}${e.pwNew ? `<span class="err">${ic('circle-alert', 12)}${e.pwNew}</span>` : `<span class="hint">${tr('At least 10 characters with a number or symbol.')}</span>`}</div>
      <div class="field"><label class="label" for="pw-conf">${tr('Confirm new password')}</label><input type="password" class="input ${e.pwConf ? 'is-error' : ''}" id="pw-conf" autocomplete="new-password">${e.pwConf ? `<span class="err">${ic('circle-alert', 12)}${e.pwConf}</span>` : ''}</div>
      <div><button class="btn btn-primary" data-a="savePassword" id="pw-save">${tr('Update password')}</button></div></form>`
      );
    }
    case 'sessions':
      return (
        H(tr('Devices currently signed in to your account.')) +
        d.sessions
          .map(s =>
            srow(
              `<span class="row" style="gap:var(--s-2)">${ic(s.dev.includes('iPhone') ? 'smartphone' : 'monitor', 15)}${esc(s.dev)}${s.cur ? `<span class="badge green">${tr('This device')}</span>` : ''}</span>`,
              `${esc(s.loc)} · ${esc(s.at)}`,
              s.cur ? '' : `<button class="btn btn-secondary btn-sm" data-a="revokeSession" data-id="${s.id}">${tr('Sign out')}</button>`,
            ),
          )
          .join('') +
        `<div style="margin-top:var(--s-4)"><button class="btn btn-danger-ghost" data-a="revokeAll" ${d.sessions.length > 1 ? '' : 'disabled'}>${tr('Sign out of all other sessions')}</button></div>`
      );
    case '2fa':
      return (
        H(tr('Add a second step when signing in.')) +
        (d.tfa
          ? `<div class="alert ok">${ic('shield-check', 16)}<div><b>${tr('Two-factor authentication is on.')}</b><div class="muted">${tr("You'll enter a code from your authenticator app when signing in on a new device.")}</div></div></div><div class="sblock"><h2>${tr('Recovery codes')}</h2><p class="muted" style="font-size:var(--fs-body-sm)">${tr('Store these somewhere safe. Each code works once.')}</p><div style="display:grid;grid-template-columns:repeat(2,max-content);gap:var(--s-1-5) var(--s-7);font-family:var(--mono);font-size:var(--fs-body-sm);padding:var(--s-3-5);border:1px solid var(--border);border-radius:var(--r);background:var(--sunken);user-select:all">${['7KQ2-M8PX', 'D4TN-9WRE', 'HV3C-QZ6L', 'P2YB-J7SK', 'R9FG-4NUD', 'X6MA-T3HE'].map(c => `<span>${c}</span>`).join('')}</div><div style="margin-top:var(--s-3-5)"><button class="btn btn-danger-ghost" data-a="disable2fa">${tr('Turn off two-factor authentication')}</button></div></div>`
          : S.ui.tfaSetup
            ? `<div class="panel" style="padding:calc(var(--space-unit) * 4.5);display:flex;gap:var(--s-5);flex-wrap:wrap"><div style="width:132px;height:132px;display:grid;grid-template-columns:repeat(11,1fr);gap:calc(var(--space-unit) * 0.25);padding:var(--s-2);background:var(--white);border-radius:var(--r);border:1px solid var(--border)" aria-label="${tr('QR code')}">${Array.from(
                { length: 121 },
                (_, i) => {
                  const r = Math.floor(i / 11),
                    c = i % 11;
                  const f = (r < 3 && c < 3) || (r < 3 && c > 7) || (r > 7 && c < 3);
                  const on = f ? !((r === 1 && c === 1) || (r === 1 && c === 9) || (r === 9 && c === 1)) : (i * 7919) % 13 < 6;
                  return `<i style="background:${on ? 'var(--palette-light-text)' : 'var(--white)'}"></i>`;
                },
              ).join('')}</div>
        <div class="grow col" style="gap:var(--s-2-5);min-width:220px"><div><b>${tr('1. Scan the QR code')}</b><div class="muted" style="font-size:var(--fs-body-sm)">${tr('Use 1Password, Authy, or Google Authenticator.')}</div></div><div><b>${tr('2. Enter the 6-digit code')}</b></div><form data-submit="verify2fa" class="row"><input class="input mono ${S.ui.errors.tfa ? 'is-error' : ''}" id="tfa-code" inputmode="numeric" maxlength="6" placeholder="000000" style="width:130px;letter-spacing:.2em;font-size:var(--fs-input)" autofocus><button class="btn btn-primary" data-a="verify2fa">${tr('Verify')}</button><button type="button" class="btn btn-ghost" data-a="cancel2fa">${tr('Cancel')}</button></form>${S.ui.errors.tfa ? `<span class="err">${ic('circle-alert', 12)}${S.ui.errors.tfa}</span>` : `<span class="hint">${tr('Any 6 digits work in this prototype.')}</span>`}</div></div>`
            : `<div class="panel" style="padding:calc(var(--space-unit) * 4.5)" ><div class="row" style="gap:var(--s-3-5);align-items:flex-start"><span class="ftype" style="--c:var(--amber);width:36px;height:36px">${ic('shield-alert', 18)}</span><div class="grow"><b>${tr('Two-factor authentication is off')}</b><p class="muted" style="margin:var(--s-1) 0 var(--s-3);font-size:var(--fs-body-sm)">${tr('Protect your account with a code from an authenticator app in addition to your password.')}</p><button class="btn btn-primary" data-a="setup2fa">${tr('Set up two-factor authentication')}</button></div></div></div>`)
      );
    case 'plan':
      return (
        H(tr('Your subscription and usage.')) +
        `<div class="panel" style="padding:calc(var(--space-unit) * 4.5);margin-bottom:calc(var(--space-unit) * 4.5)"><div class="row" style="flex-wrap:wrap"><div><div class="eyebrow">${tr('Current plan')}</div><div style="font-size:var(--fs-subtitle);font-weight:var(--fw-semibold);letter-spacing:-.015em;margin-top:var(--s-1)">${esc(d.plan || tr('Team'))} <span class="muted" style="font-size:var(--fs-label);font-weight:var(--fw-regular)">${tr('· $12 per member / month')}</span></div><div class="muted" style="font-size:var(--fs-body-sm)">${tr('Renews {value1} · Billed monthly', { value1: fmtDate(dOff(7), true) })}</div></div><span class="sp"></span><button class="btn btn-secondary" data-a="go" data-r="settings" data-sec="invoices">${tr('View invoices')}</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:calc(var(--space-unit) * 4.5);margin-top:calc(var(--space-unit) * 4.5)">${[
        [tr('Members'), d.members.length, 10, ''],
        [tr('Storage'), 12.4, 100, ' GB'],
        [tr('Projects'), d.projects.length, 50, ''],
      ]
        .map(
          ([n, v, m, u]) =>
            `<div><div class="row" style="font-size:var(--fs-sm);margin-bottom:var(--s-1-5)"><span class="muted">${tr(n)}</span><span class="sp"></span><span class="num">${tr('{value1}{value2} of {value3}{value4}', { value1: v, value2: u, value3: m, value4: u })}</span></div><div class="meter"><i style="width:${(v / m) * 100}%;${v / m > 0.75 ? 'background:var(--amber)' : ''}"></i></div></div>`,
        )
        .join('')}</div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:var(--s-3)">${[
        ['Free', '$0', [tr('Up to 3 members'), tr('Unlimited tasks'), tr('5 GB storage')]],
        ['Team', '$12', [tr('Up to 50 members'), tr('Timelines & custom views'), tr('100 GB storage'), tr('Guest access')]],
        ['Business', '$24', [tr('Unlimited members'), tr('Advanced permissions'), tr('SAML SSO'), tr('1 TB storage')]],
      ]
        .map(([n, pr, fs]) => {
          const cur = (d.plan || tr('Team')) === n;
          return `<div class="plan ${cur ? 'cur' : ''}"><div class="row"><b>${tr(n)}</b>${cur ? `<span class="badge accent">${tr('Current')}</span>` : ''}</div><div class="pr">${pr}<span class="muted" style="font-size:var(--fs-sm);font-weight:var(--fw-regular)"> ${tr('/member/mo')}</span></div><ul>${fs.map(f => `<li>${ic('check', 13)}${f}</li>`).join('')}</ul><div style="margin-top:var(--s-2)">${cur ? `<button class="btn btn-secondary btn-block" disabled>${tr('Current plan')}</button>` : `<button class="btn ${n === 'Business' ? 'btn-primary' : 'btn-secondary'} btn-block" data-a="changePlan" data-v="${tr(n)}">${n === 'Free' ? tr('Downgrade') : tr('Upgrade')}</button>`}</div></div>`;
        })
        .join('')}</div>`
      );
    case 'payment':
      return (
        H(tr('Payment method and billing details.')) +
        srow(
          `<span class="row" style="gap:var(--s-2-5)"><span class="ftype" style="--c:var(--blue)">${ic('credit-card', 15)}</span>${tr('Visa ending in 4242')}</span>`,
          tr('Expires 08/2028 · Default'),
          `<button class="btn btn-secondary btn-sm" data-a="toastInfo" data-msg="${tr('Card updates open in a secure payment window')}">${tr('Update')}</button>`,
        ) +
        srow(
          tr('Billing email'),
          tr('Invoices and receipts are sent here.'),
          `<span class="muted" style="user-select:all">${tr('hello@gr8rstudio.com')}</span>`,
        ) +
        srow(
          tr('Billing address'),
          '2150 Mission St, San Francisco, CA 94110',
          `<button class="btn btn-secondary btn-sm" data-a="toastInfo" data-msg="${tr('Address editing opens in the billing portal')}">${tr('Edit')}</button>`,
        ) +
        srow(tr('Tax ID'), tr('Shown on invoices'), `<span class="muted">${tr('US EIN ••-•••4410')}</span>`)
      );
    case 'invoices':
      return (
        H(tr('Past invoices for this workspace.')) +
        `<div class="panel" style="overflow-x:auto"><table class="perm-t" style="min-width:480px"><thead><tr><th style="padding-left:var(--s-3-5)">${tr('Invoice')}</th><th style="text-align:left">${tr('Date')}</th><th style="text-align:left">${tr('Amount')}</th><th style="text-align:left">${tr('Status')}</th></tr></thead><tbody>${d.invoices.map(i => `<tr><td style="padding-left:var(--s-3-5)" class="mono">${i.id}</td><td style="text-align:left" class="num">${fmtDate(i.date, true)}</td><td style="text-align:left" class="num">${i.amt}</td><td style="text-align:left"><span class="badge green">${ic('check', 11)}${tr(i.st)}</span></td></tr>`).join('')}</tbody></table></div>`
      );
  }
  return page404();
}
export function strengthMeter(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[0-9]/.test(pw) && /[a-zA-Z]/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  const c = ['var(--red)', 'var(--red)', 'var(--amber)', 'var(--green)', 'var(--green)'][s];
  const n = [tr('Too short'), tr('Weak'), tr('Fair'), tr('Good'), tr('Strong')][s];
  return pw
    ? `<div class="row" style="gap:var(--s-2)"><div class="strength grow" aria-hidden="true">${[0, 1, 2, 3].map(i => `<i class="${i < s ? 'on' : ''}" style="--c:${c}"></i>`).join('')}</div><span style="font-size:var(--fs-meta);color:${c};width:60px;text-align:right">${tr(n)}</span></div>`
    : '';
}
