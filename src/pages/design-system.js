/* ---------------- DESIGN SYSTEM ---------------- */
import { dOff, esc } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { ACCENTS, TOKEN_GROUPS } from '../core/design-tokens.js';
import { ic } from '../core/icons.js';
import { LABELS, PCOLORS, PRIOS, STATUSES } from '../core/constants.js';
import { D, S, allTasks } from '../core/store.js';
import { av, avStack, empty, lbl, pStatus, prPill, progBar, stPill } from '../ui/helpers.js';
import { sItem } from '../shell/layout.js';
import { sk, skRows } from '../shell/skeletons.js';
import { miniRow } from '../components/task-list.js';
import { kcard } from '../views/board.js';

function tokenPreview(name, group) {
  const style = `--ds-token:var(${name})`;
  if (/palette|surface|line|text|accent|semantic|status/i.test(group) && !/shadow|mix/.test(name))
    return `<span class="ds-sample ds-sample-color" style="${style}"></span>`;
  if (/shadow|ring/.test(name)) return `<span class="ds-sample ds-sample-shadow" style="${style}"></span>`;
  if (/^--r(?:-|$)|--radius/.test(name)) return `<span class="ds-sample ds-sample-radius" style="${style}"></span>`;
  if (/^--s-|--space-unit/.test(name)) return `<span class="ds-sample ds-sample-space" style="${style}"><i></i></span>`;
  if (/^--fs/.test(name)) return `<span class="ds-sample ds-sample-type" style="${style}">Ag</span>`;
  return '';
}

function tokenLibrary() {
  const computed = getComputedStyle(document.documentElement);
  return TOKEN_GROUPS.map(
    (group, index) => `<details class="ds-token-group" ${index < 2 ? 'open' : ''}>
    <summary>${t(group.title)} <span class="badge">${group.tokens.length}</span></summary>
    <div class="ds-token-grid">${group.tokens
      .map(
        name => `<div class="ds-token" data-token="${name}">
      ${tokenPreview(name, group.title)}<code>${name}</code><span class="ds-token-value">${esc(computed.getPropertyValue(name).trim())}</span>
    </div>`,
      )
      .join('')}</div></details>`,
  ).join('');
}

export function pageSystem() {
  const states = [
    ['', 'Default'],
    ['state-hover', 'Hover'],
    ['state-active', 'Active'],
    ['state-focus', 'Focus'],
    ['dis', 'Disabled'],
    ['is-loading', 'Loading'],
  ];
  const firstTask = allTasks()[0];
  const previewMembers = D()
    .members.slice(0, 6)
    .map(member => member.id);
  return `<div class="page ds-page">
    <div class="ph"><div><h1>${t('Design system')}</h1><p>${t('Shared tokens and real components. Every preview follows your appearance settings.')}</p></div>
      <div class="acts"><div class="seg">${[
        ['light', 'sun', 'Light'],
        ['dark', 'moon', 'Dark'],
        ['system', 'monitor', 'System'],
      ]
        .map(
          ([key, icon, label]) => `<button class="${S.prefs.theme === key ? 'on' : ''}" data-a="setTheme" data-v="${key}">${ic(icon, 13)}${t(label)}</button>`,
        )
        .join('')}</div></div>
    </div>
    <div class="ds-appearance panel">
      <div class="ds-control"><span class="label">${t('Accent color')}</span><div class="swatches">${ACCENTS.map(accent => `<button class="sw ${S.prefs.accent === accent.id ? 'on' : ''}" style="--c:var(${accent.token})" data-a="setPref" data-k="accent" data-v="${accent.id}" aria-label="${t(accent.name)}" aria-pressed="${S.prefs.accent === accent.id}" data-tip="${t(accent.name)}">${S.prefs.accent === accent.id ? ic('check', 13) : ''}</button>`).join('')}</div></div>
      <div class="ds-control"><span class="label">${t('Task display')}</span><div class="seg">${[
        ['comfortable', 'Comfortable'],
        ['compact', 'Compact'],
      ]
        .map(([key, label]) => `<button class="${S.prefs.density === key ? 'on' : ''}" data-a="setPref" data-k="density" data-v="${key}">${t(label)}</button>`)
        .join('')}</div></div>
    </div>
    <section class="ds-sec"><h2>${t('Token library')} <span>${t('Current values from the active theme')}</span></h2>${tokenLibrary()}</section>
    <section class="ds-sec"><h2>${t('Adapting the system')}</h2><div class="panel ds-recipe">
      <ol><li>${t('Change palette, spacing, typography, radius or motion in tokens.css.')}</li><li>${t('Use semantic tokens in components and reserve inline values for runtime geometry and user data.')}</li><li>${t('Check light, dark, accents and compact density here, then verify the affected screen.')}</li></ol>
      <p class="muted">${t('The token audit checks references, catalog coverage and hardcoded style regressions.')}</p>
      <code>node scripts/check-tokens.mjs</code>
    </div></section>
    <section class="ds-sec"><h2>${t('Buttons')} <span>${t('Preview states use the same rules as interactive components')}</span></h2>
      ${[
        ['btn-primary', 'Create task'],
        ['btn-secondary', 'Share'],
        ['btn-ghost', 'Filter'],
        ['btn-danger', 'Delete'],
      ]
        .map(
          ([variant, label]) =>
            `<div class="ds-row"><span class="lab">${t(label)}</span>${states.map(([state, name]) => `<div class="ds-button-state"><span class="faint">${t(name)}</span><button class="btn ${variant} ${state}" ${state === 'dis' ? 'disabled' : ''}>${t(label)}</button></div>`).join('')}</div>`,
        )
        .join('')}
      <div class="ds-row"><span class="lab">${t('Sizes')}</span><button class="btn btn-secondary btn-sm">${t('Small')}</button><button class="btn btn-secondary">${t('Medium')}</button><button class="btn btn-secondary btn-lg">${t('Large')}</button>${['plus', 'list-filter', 'ellipsis', 'star', 'share-2', 'settings'].map(icon => `<button class="ibtn" aria-label="${t('Icon button')}">${ic(icon, 16)}</button>`).join('')}</div>
    </section>
    <section class="ds-sec"><h2>${t('Inputs')}</h2><div class="panel ds-inputs">
      <div class="field"><label class="label" for="ds-text">${t('Text')}</label><input class="input" id="ds-text" placeholder="${t('Task name')}"></div>
      <div class="field"><label class="label" for="ds-focus">${t('Focus')}</label><input class="input state-input-focus" id="ds-focus" value="${t('Homepage wireframes')}"></div>
      <div class="field"><label class="label" for="ds-error">${t('Error')}</label><input class="input is-error" id="ds-error" value="alex@" aria-invalid="true" aria-describedby="ds-error-hint"><span class="err" id="ds-error-hint">${ic('circle-alert', 12)}${t('Enter a valid email address')}</span></div>
      <div class="field"><label class="label" for="ds-disabled">${t('Disabled')}</label><input class="input" id="ds-disabled" value="hello@gr8rstudio.com" disabled></div>
      <div class="field"><label class="label" for="ds-search">${t('Search')}</label><div class="inwrap">${ic('search', 13)}<input class="input" id="ds-search" placeholder="${t('Search tasks')}"><span class="kbd">/</span></div></div>
      <div class="field"><label class="label" for="ds-select">${t('Select')}</label><select class="select" id="ds-select">${STATUSES.map(status => `<option>${t(status.name)}</option>`).join('')}</select></div>
      <div class="field"><label class="label" for="ds-date">${t('Date')}</label><input type="date" class="input" value="${dOff(3)}" id="ds-date"></div>
      <div class="field"><label class="label" for="ds-time">${t('Time')}</label><input type="time" class="input" value="14:30" id="ds-time"></div>
      <div class="field"><span class="label">${t('Selection controls')}</span><div class="row"><input type="checkbox" class="check" checked aria-label="${t('Checked checkbox')}"><input type="checkbox" class="check" aria-label="${t('Unchecked checkbox')}"><input type="radio" class="radio" name="ds-radio" checked aria-label="${t('Selected radio')}"><input type="radio" class="radio" name="ds-radio" aria-label="${t('Unselected radio')}"><input type="checkbox" class="toggle" checked aria-label="${t('Enabled toggle')}"></div></div>
      <div class="field"><label class="label" for="ds-textarea">${t('Textarea')}</label><textarea class="textarea" rows="2" id="ds-textarea" placeholder="${t('Add a description…')}"></textarea></div>
    </div></section>
    <section class="ds-sec"><h2>${t('Status & priority')}</h2><div class="ds-row">${STATUSES.map(status => `<span class="pillbtn bordered">${stPill(status.id)}</span>`).join('')}</div><div class="ds-row">${PRIOS.map(priority => `<span class="pillbtn bordered">${prPill(priority.id)}</span>`).join('')}</div><div class="ds-row">${LABELS.map(label => lbl(label.id)).join('')}</div></section>
    <section class="ds-sec"><h2>${t('Navigation')}</h2><div class="ds-columns">
      <div class="ds-navigation panel">${sItem('home', t('Home'), 'house')}<button class="sitem on">${ic('inbox', 16)}<span>${t('Inbox')}</span><span class="ct dotc">3</span></button><button class="sitem state-hover">${ic('circle-check', 16)}<span>${t('My Tasks')}</span></button><div class="sitem"><span class="pico" style="--c:${PCOLORS.indigo}">${ic('globe', 12)}</span><span>${t('Website Redesign')}</span></div></div>
      <div class="col"><div class="tabs">${['Overview', 'Board', 'List', 'Table'].map((label, index) => `<button class="tab ${index === 1 ? 'on' : ''}">${t(label)}</button>`).join('')}</div><div class="ds-row"><div class="seg"><button class="on">${ic('layout-grid', 13)}${t('Grid')}</button><button>${ic('list', 13)}${t('List')}</button></div></div></div>
    </div></section>
    <section class="ds-sec"><h2>${t('Data display')}</h2><div class="ds-columns">
      <div class="ds-card-preview" inert>${firstTask ? kcard(firstTask) : empty('list-checks', t('No tasks here'), t('Add a task to get things moving.'))}</div>
      <div class="col"><div class="ds-row"><span class="lab">${t('Avatar')}</span>${previewMembers
        .slice(0, 3)
        .map(id => av(id, 'sm'))
        .join('')}${av(previewMembers[3])}${av(previewMembers[4], 'md')}${av(previewMembers[5], 'lg')}${av(null)}${avStack(previewMembers, 4, 'md')}</div>
      <div class="ds-row"><span class="lab">${t('Badge')}</span><span class="badge">${t('Default')}</span><span class="badge accent">${t('Accent')}</span><span class="badge green">${t('Active')}</span>${pStatus('active')}${pStatus('risk')}</div>
      <div class="ds-row"><span class="lab">${t('Progress')}</span>${progBar(64)}${progBar(100, 'green')}${progBar(30, 'red')}</div>
      <div class="panel ds-list-preview" inert>${allTasks().slice(0, 2).map(miniRow).join('')}</div></div>
    </div></section>
    <section class="ds-sec"><h2>${t('Feedback')}</h2><div class="ds-feedback"><div class="alert info">${ic('info', 15)}${t('Changes are saved automatically.')}</div><div class="alert ok">${ic('circle-check', 15)}${t('Project archived.')}</div><div class="alert warn">${ic('triangle-alert', 15)}${t('Some tasks are approaching their due date.')}</div><div class="alert danger">${ic('circle-alert', 15)}${t('Your changes could not be saved.')}</div></div>
      <div class="ds-row"><button class="btn btn-secondary" data-a="demoToast" data-v="ok">${t('Toast')}</button><button class="btn btn-secondary" data-a="demoConfirm">${t('Modal')}</button><button class="btn btn-secondary" data-a="demoConfirm">${t('Confirmation')}</button><button class="btn btn-secondary" data-a="openPalette">${t('Command menu')}</button></div>
    </section>
    <section class="ds-sec"><h2>${t('Iconography')} <span>${t('Lucide icons share the surrounding text color')}</span></h2><div class="panel ds-icons">${['house', 'inbox', 'circle-check', 'star', 'search', 'bell', 'folder-kanban', 'list-checks', 'calendar', 'chart-gantt', 'users', 'activity', 'settings', 'plus', 'list-filter', 'arrow-up-down', 'rows-3', 'share-2', 'ellipsis', 'paperclip', 'message-square', 'tag', 'link', 'copy', 'pencil', 'trash-2', 'archive', 'upload', 'repeat', 'timer', 'git-branch', 'lock', 'eye', 'at-sign', 'sun', 'moon'].map(icon => `<span aria-hidden="true">${ic(icon, 17)}</span>`).join('')}</div></section>
  </div>`;
}

/* ---------------- SYSTEM STATES GALLERY ---------------- */
export function pageStates() {
  const card = (cap, icon, inner) => `<div class="panel"><div class="cap">${ic(icon, 13)}${cap}</div>${inner}</div>`;
  return `<div class="page wide" style="max-width:1240px">
    <div class="ph"><div><h1>${t('System states')}</h1><p>${t('Empty, loading, error, and confirmation states used throughout Gr8r.')}</p></div><div class="acts"><button class="btn btn-secondary" data-a="toggleOffline">${ic(S.ui.offline ? 'wifi' : 'wifi-off', 14)}${t(S.ui.offline ? 'Go back online' : 'Simulate offline')}</button></div></div>
    <h2 class="sec" style="margin:var(--s-2) 0 var(--s-2-5)">${t('Empty states')}</h2>
    <div class="states-grid">
      ${card(t('No projects'), 'folder-kanban', empty('folder-kanban', t('No projects yet'), t('Create your first project to start organizing your work.'), `<button class="btn btn-primary btn-sm" data-a="demoConfirm">${t('{value1}Create project', { value1: ic('plus', 14) })}</button>`))}
      ${card(t('No tasks'), 'list-checks', empty('list-checks', t('No tasks here'), t('Add a task to get things moving.'), `<button class="btn btn-primary btn-sm" data-a="demoConfirm">${t('{value1}Add task', { value1: ic('plus', 14) })}</button>`))}
      ${card(t('No notifications'), 'bell', empty('bell-off', t("You're all caught up."), t('New mentions and assignments will show up here.')))}
      ${card(t('No search results'), 'search', empty('search-x', t('No results found'), t('Nothing matches “brand guidlines”. Check the spelling or try a broader term.'), `<button class="btn btn-secondary btn-sm">${t('Clear search')}</button>`))}
    </div>
    <h2 class="sec" style="margin:var(--s-7) 0 var(--s-2-5)">${t('Loading states')}</h2>
    <div class="states-grid">
      ${card(t('List / table rows'), 'rows-3', `<div style="padding:var(--s-1) var(--s-2-5)">${skRows(5)}</div>`)}
      ${card(t('Cards'), 'layout-grid', `<div style="padding:var(--s-3)"><div class="pcard" style="cursor:default">${sk('28px', 28, 'border-radius:calc(var(--radius-unit) * 3.5)')}${sk('60%', 12)}${sk('90%', 9)}${sk('70%', 9)}${sk('100%', 4)}</div></div>`)}
      ${card(t('Board column'), 'square-kanban', `<div style="padding:var(--s-3);background:var(--sunken)"><div class="col" style="gap:var(--s-1-5)">${[0, 1].map(() => `<div class="kcard" style="cursor:default">${sk('40%', 14)}${sk('80%', 10)}<div class="row">${sk('40px', 9)}<span class="sp"></span>${sk('18px', 18, 'border-radius:var(--r-circle)')}</div></div>`).join('')}</div></div>`)}
      ${card(t('Buttons & page'), 'loader', `<div style="padding:calc(var(--space-unit) * 4.5);display:flex;flex-direction:column;gap:var(--s-3-5);align-items:flex-start"><div class="row"><button class="btn btn-primary is-loading">${t('Saving')}</button><button class="btn btn-secondary is-loading">${t('Loading')}</button><button class="btn btn-primary" data-a="demoLoad" id="demo-load">${t('Click to load')}</button></div><div class="row muted" style="font-size:var(--fs-body-sm)">${t('{value1}Loading project…', { value1: `<span style="width:16px;height:16px;border-radius:var(--r-circle);border:2px solid var(--border-strong);border-top-color:var(--accent);animation:spin var(--dur-spin) linear infinite;display:inline-block"></span>` })}</div><button class="btn btn-ghost btn-sm" data-a="reloadPage">${t('{value1}Replay page skeleton', { value1: ic('refresh-cw', 13) })}</button></div>`)}
    </div>
    <h2 class="sec" style="margin:var(--s-7) 0 var(--s-2-5)">${t('Error states')}</h2>
    <div class="states-grid">
      ${card(t('Network error'), 'wifi-off', `<div class="empty-state err sm"><div class="glyph">${ic('wifi-off', 20)}</div><h3 class="es-h">${t("You're offline")}</h3><p>${t('Check your connection and try again.')}</p><button class="btn btn-secondary btn-sm" data-a="demoToast" data-v="retry">${t('{value1}Try again', { value1: ic('refresh-cw', 13) })}</button></div>`)}
      ${card(t('Failed to load'), 'cloud-alert', `<div class="empty-state err sm"><div class="glyph">${ic('cloud-alert', 20)}</div><h3 class="es-h">${t('Something went wrong.')}</h3><p>${t('This view failed to load. Your data is safe.')}</p><button class="btn btn-secondary btn-sm" data-a="demoToast" data-v="retry">${t('Try again')}</button></div>`)}
      ${card(t('Failed to save'), 'circle-alert', `<div style="padding:calc(var(--space-unit) * 4.5)" class="col"><div class="alert danger" style="margin-bottom:var(--s-2-5)">${ic('circle-alert', 15)}<div><b>${t("Your changes couldn't be saved.")}</b><div class="muted">${t("The server didn't respond in time.")}</div></div></div><button class="btn btn-secondary btn-sm" style="align-self:flex-start" data-a="demoToast" data-v="err">${t('Show as toast')}</button></div>`)}
      ${card(t('Permission denied'), 'lock', `<div class="empty-state sm"><div class="glyph">${ic('lock', 20)}</div><h3 class="es-h">${t("You don't have access")}</h3><p>${t('This project is private. Ask a workspace administrator for access.')}</p><button class="btn btn-secondary btn-sm" data-a="demoConfirm">${t('Open example')}</button></div>`)}
      ${card(t('Page not found'), 'file-question', `<div class="empty-state sm"><div class="glyph">${ic('file-question', 20)}</div><h3 class="es-h">${t('Page not found')}</h3><p>${t('The page was moved, deleted, or never existed.')}</p><button class="btn btn-secondary btn-sm" data-a="go" data-r="nowhere">${t('Open example')}</button></div>`)}
      ${card(t('Form validation'), 'text-cursor-input', `<div style="padding:calc(var(--space-unit) * 4.5)" class="col"><div class="field"><label class="label" for="st-e">${t('Email')}</label><input class="input is-error" id="st-e" value="hello@gr8rstudio" aria-invalid="true"><span class="err">${t('{value1}Enter a valid email, like name@company.com', { value1: ic('circle-alert', 12) })}</span></div></div>`)}
    </div>
    <h2 class="sec" style="margin:var(--s-7) 0 var(--s-2-5)">${t('Confirmation dialogs')}</h2>
    <div class="row" style="gap:var(--s-2);flex-wrap:wrap"><button class="btn btn-secondary" data-a="demoConfirm">${t('{value1}Delete project', { value1: ic('trash-2', 14) })}</button><button class="btn btn-secondary" data-a="demoConfirm">${t('{value1}Delete task', { value1: ic('trash-2', 14) })}</button><button class="btn btn-secondary" data-a="demoConfirm">${t('{value1}Remove member', { value1: ic('user-minus', 14) })}</button><button class="btn btn-secondary" data-a="demoConfirm">${t('{value1}Archive project', { value1: ic('archive', 14) })}</button></div>
    <p class="faint" style="font-size:var(--fs-sm);margin-top:var(--s-2)">${t('These are safe previews. Confirming does not change workspace data.')}</p>
  </div>`;
}
