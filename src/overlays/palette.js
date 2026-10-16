import { t as tr } from '../core/i18n.js';
/* ---------------- COMMAND PALETTE ---------------- */
import { MOD, clamp, esc } from '../core/utils.js';
import { LOGO, ic, wsLogo } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, allTasks, pColor, proj, save, task } from '../core/store.js';
import { FT, av, hl, stIcon } from '../ui/helpers.js';
import { effectiveDark } from '../core/theme.js';
import { go, render } from '../shell/render.js';
import { sortTasks } from '../shell/view-engine.js';
import { searchAll } from '../pages/search.js';
import { openModal } from './modals.js';
import { A } from '../actions/registry.js';

export function commands() {
  return [
    { id: 'c-task', name: tr('Create task'), icon: 'plus', kbd: 'N', run: () => A.newTask(document.body) },
    { id: 'c-proj', name: tr('Create project'), icon: 'folder-plus', kbd: 'P', run: () => A.newProject() },
    {
      id: 'c-search',
      name: tr('Search workspace'),
      icon: 'search',
      kbd: '/',
      run: () => {
        S.ui.palette = { q: '', mode: 'search', scope: 'all', hl: 0 };
        render();
      },
    },
    { id: 'c-home', name: tr('Go to Home'), icon: 'house', kbd: 'G H', run: () => go('home') },
    { id: 'c-inbox', name: tr('Go to Inbox'), icon: 'inbox', kbd: 'G I', run: () => go('inbox') },
    { id: 'c-my', name: tr('Go to My Tasks'), icon: 'circle-check', kbd: 'G T', run: () => go('mytasks') },
    { id: 'c-projs', name: tr('Go to Projects'), icon: 'folder-kanban', kbd: 'G P', run: () => go('projects') },
    { id: 'c-cal', name: tr('Go to Calendar'), icon: 'calendar', kbd: 'G C', run: () => go('calendar') },
    { id: 'c-tl', name: tr('Go to Timeline'), icon: 'chart-gantt', run: () => go('timeline') },
    { id: 'c-mem', name: tr('Go to Members'), icon: 'users', run: () => go('members') },
    { id: 'c-set', name: tr('Open settings'), icon: 'settings', kbd: 'G S', run: () => go('settings') },
    { id: 'c-app', name: tr('Appearance settings'), icon: 'palette', run: () => go('settings', { sec: 'appearance' }) },
    {
      id: 'c-ws',
      name: tr('Switch workspace…'),
      icon: 'arrow-left-right',
      run: () => {
        S.ui.palette = { q: '', mode: 'ws', hl: 0 };
        render();
      },
    },
    {
      id: 'c-dark',
      name: effectiveDark() ? tr('Switch to light mode') : tr('Switch to dark mode'),
      icon: effectiveDark() ? 'sun' : 'moon',
      kbd: MOD + ' ⇧ L',
      run: () => A.toggleDark(),
    },
    { id: 'c-inv', name: tr('Invite member'), icon: 'user-plus', run: () => A.invite() },
    { id: 'c-side', name: tr('Toggle sidebar'), icon: 'panel-left', kbd: '[', run: () => A.toggleSide() },
    { id: 'c-keys', name: tr('Keyboard shortcuts'), icon: 'keyboard', kbd: '?', run: () => A.shortcuts() },
    { id: 'c-out', name: tr('Sign out'), icon: 'log-out', run: () => A.signOut() },
  ];
}
export function paletteItems() {
  const pl = S.ui.palette;
  const q = pl.q.trim();
  const ql = q.toLowerCase();
  const groups = [];
  if (pl.mode === 'ws') {
    groups.push({
      name: tr('Switch workspace'),
      items: D()
        .workspaces.filter(w => !q || w.name.toLowerCase().includes(ql))
        .map(w => ({ html: `${wsLogo(w, 20)}`, name: w.name, sub: w.plan + tr(' plan'), run: () => A.switchWs({ dataset: { v: w.id } }) })),
    });
    return groups;
  }
  if (pl.mode === 'cmd') {
    const cmds = commands().filter(c => !q || c.name.toLowerCase().includes(ql));
    if (!q) {
      groups.push({ name: tr('Suggestions'), items: cmds.slice(0, 3).concat(cmds.filter(c => c.id === 'c-dark' || c.id === 'c-ws')) });
      const recent = sortTasks(
        allTasks().filter(t => t.assignee === D().me || t.fav),
        { f: 'updated', dir: 1 },
      ).slice(0, 4);
      groups.push({
        name: tr('Recent tasks'),
        items: recent.map(t => ({
          html: stIcon(t.status),
          name: t.title,
          sub: proj(t.project).name,
          r: t.key,
          run: () => A.openTask({ dataset: { id: t.id } }),
        })),
      });
      groups.push({
        name: tr('Navigation'),
        items: cmds.filter(c => c.id.startsWith('c-') && ['c-home', 'c-inbox', 'c-my', 'c-projs', 'c-cal', 'c-tl', 'c-mem'].includes(c.id)),
      });
      return groups;
    }
    if (cmds.length) groups.push({ name: tr('Commands'), items: cmds.slice(0, 5) });
  }
  const r = searchAll(q);
  const sc = pl.mode === 'search' ? pl.scope : 'all';
  const lim = sc === 'all' ? 4 : 12;
  if (pl.mode === 'search' && !q) {
    groups.push({
      name: tr('Recent searches'),
      items: D().recentSearches.map(s => ({
        icon: 'history',
        name: s,
        run: () => {
          pl.q = s;
          pl.hl = 0;
          render();
        },
      })),
    });
    groups.push({
      name: tr('Suggested'),
      items: [
        { icon: 'clock-alert', name: tr('Overdue tasks'), run: () => A.goTasks({ dataset: { f: 'overdue' } }) },
        { icon: 'user', name: tr('Tasks assigned to me'), run: () => go('mytasks') },
        {
          icon: 'signal-high',
          name: tr('High priority in Website Redesign'),
          run: () => {
            go('project', { id: 'p1', tab: 'v:v1' });
          },
        },
        { icon: 'paperclip', name: tr('Files in Website Redesign'), run: () => go('project', { id: 'p1', tab: 'files' }) },
      ],
    });
    return groups;
  }
  if (!q) return groups;
  if (sc === 'all' || sc === 'tasks')
    groups.push({
      name: tr('Tasks'),
      items: r.tasks
        .slice(0, lim)
        .map(t => ({ html: stIcon(t.status), name: t.title, sub: proj(t.project).name, r: t.key, run: () => A.openTask({ dataset: { id: t.id } }) })),
    });
  if (sc === 'all' || sc === 'projects')
    groups.push({
      name: tr('Projects'),
      items: r.projects.slice(0, lim).map(p => ({
        html: `<span class="pdot" style="--c:${pColor(p)}"></span>`,
        name: p.name,
        sub: PSTAT[p.status].name,
        run: () => go('project', { id: p.id }),
      })),
    });
  if (sc === 'all' || sc === 'people')
    groups.push({
      name: tr('People'),
      items: r.people.slice(0, lim).map(m => ({ html: av(m.id, 'sm', false), name: m.name, sub: m.title, run: () => go('member', { id: m.id }) })),
    });
  if (sc === 'all' || sc === 'files')
    groups.push({
      name: tr('Files'),
      items: r.files.slice(0, lim).map(f => ({
        icon: FT[f.type].i,
        name: f.name,
        sub: proj(f.project).name,
        r: f.size,
        run: () => openModal({ type: 'filePreview', file: f, tid: f.task }),
      })),
    });
  if (sc === 'all' || sc === 'comments')
    groups.push({
      name: tr('Comments'),
      items: r.comments
        .slice(0, lim)
        .map(c => ({ html: av(c.by, 'sm', false), name: c.text, sub: tr('on ') + task(c.task).title, run: () => A.openTask({ dataset: { id: c.task } }) })),
    });
  const out = groups.filter(g => g.items.length);
  out.push({
    name: '',
    items: [
      {
        icon: 'search',
        name: tr('View all results for “{value1}”', { value1: q }),
        run: () => {
          S.ui.searchQ = q;
          S.ui.searchCat = sc;
          if (!D().recentSearches.includes(q)) D().recentSearches.unshift(q);
          D().recentSearches = D().recentSearches.slice(0, 5);
          save();
          go('search');
        },
      },
    ],
  });
  return out;
}
export function paletteHtml() {
  const pl = S.ui.palette;
  const groups = paletteItems();
  const flat = groups.flatMap(g => g.items);
  pl._flat = flat;
  pl.hl = clamp(pl.hl, 0, Math.max(flat.length - 1, 0));
  let idx = 0;
  const ph =
    pl.mode === 'search'
      ? tr('Search tasks, projects, people, files, comments…')
      : pl.mode === 'ws'
        ? tr('Find a workspace…')
        : tr('Type a command or search…');
  return `<div class="palette" role="dialog" aria-modal="true" aria-label="${tr('Command menu')}">
    <div class="pal-in">${ic(pl.mode === 'search' ? 'search' : 'command', 17)}${pl.mode !== 'cmd' ? `<span class="badge" style="flex-shrink:0">${pl.mode === 'search' ? tr('Search') : tr('Workspace')}</span>` : ''}<input id="pal-in" data-in="palQ" value="${esc(pl.q)}" placeholder="${ph}" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant="pi-${pl.hl}"><kbd>${tr('Esc')}</kbd></div>
    ${
      pl.mode === 'search'
        ? `<div class="pal-scope" role="tablist">${[
            ['all', tr('All'), 'layers'],
            ['tasks', tr('Tasks'), 'circle-check'],
            ['projects', tr('Projects'), 'folder'],
            ['people', tr('People'), 'users'],
            ['files', tr('Files'), 'paperclip'],
            ['comments', tr('Comments'), 'message-square'],
          ]
            .map(([k, n, i]) => `<button role="tab" class="${pl.scope === k ? 'on' : ''}" data-a="palScope" data-v="${k}">${ic(i, 12)}${n}</button>`)
            .join('')}</div>`
        : ''
    }
    <div class="pal-list" id="pal-list" role="listbox">${
      flat.length
        ? groups
            .map(
              g =>
                `<div class="pal-group">${g.name ? `<div class="pal-sec">${g.name}</div>` : ''}${g.items
                  .map(it => {
                    const i = idx++;
                    return `<div class="pi ${i === pl.hl ? 'hl' : ''}" id="pi-${i}" role="option" aria-selected="${i === pl.hl}" data-a="palRun" data-i="${i}" data-hover-i="${i}">${it.html || ic(it.icon || 'circle', 15)}<span class="trunc">${hl(it.name, pl.q.trim())}</span>${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}<span class="r">${it.r ? `<span class="mono">${esc(it.r)}</span>` : ''}${
                      it.kbd
                        ? it.kbd
                            .split(' ')
                            .map(k => `<kbd>${k}</kbd>`)
                            .join('')
                        : ''
                    }</span></div>`;
                  })
                  .join('')}</div>`,
            )
            .join('')
        : `<div class="empty-state sm"><div class="glyph">${ic('search-x', 18)}</div><h2 class="es-h">${tr('No results found')}</h2><p>${tr('Try a different keyword, or press Tab to search everything.')}</p></div>`
    }</div>
    <div class="pal-f"><span><kbd>↑</kbd><kbd>↓</kbd>${tr('navigate')}</span><span><kbd>↵</kbd>${tr('select')}</span>${pl.mode === 'cmd' ? `<span><kbd>${tr('Tab')}</kbd>${tr('search mode')}</span>` : `<span><kbd>⌫</kbd>${tr('back to commands')}</span>`}<span class="sp" style="flex:1"></span><span>${LOGO(12)}</span></div>
  </div>`;
}
