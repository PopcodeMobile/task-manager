import { test, expect, type Page } from '@playwright/test';
import { seed } from '../../src/data/seed.js';

const data = seed();
async function prepare(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(
    value => localStorage.setItem('gr8r.v2', JSON.stringify({ data: value, prefs: { lang: 'en', theme: 'dark', density: 'compact' } })),
    data,
  );
}

test('project grid keeps the original card description, progress and metadata footer with compact filters', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/projects');
  const card = page.locator('[data-project-id]').first();
  await expect(card).toBeVisible();
  await expect(card.locator('.desc')).toHaveText(data.projects.find(p => p.id === 'p1')!.desc);
  await expect(card.locator('.foot')).toContainText('/');
  await expect(card.locator('.foot time')).toBeVisible();
  await expect(card.locator('.avstack')).toBeVisible();
  const geometry = await card.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(geometry.height).toBeGreaterThanOrEqual(170);
  expect(geometry.height).toBeLessThanOrEqual(230);
  expect(geometry.width).toBeGreaterThanOrEqual(280);
  const filter = await page.getByLabel('Filter project status', { exact: true }).boundingBox();
  expect(filter!.height).toBeLessThanOrEqual(28);
  await expect(page.getByRole('tablist', { name: 'Layout' })).toBeVisible();
});

test('project detail keeps eight compact icon tabs and original two-column overview', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/project?project=p1&tab=overview');
  const nav = page.getByRole('navigation', { name: 'Project tabs' });
  await expect(nav).toBeVisible();
  await expect(nav.locator('a')).toHaveCount(8 + data.savedViews.filter(v => v.project === 'p1').length);
  await expect(nav.locator('a').first().locator('svg')).toBeVisible();
  const tabs = await nav.boundingBox();
  expect(tabs!.height).toBeLessThanOrEqual(43);
  const panels = page.locator('.project-overview .panel');
  await expect(panels).toHaveCount(6);
  const first = await panels.nth(0).boundingBox();
  const detail = await panels.nth(3).boundingBox();
  expect(detail!.x).toBeGreaterThan(first!.x + first!.width);
});

test('task list uses the original compact rows and grouped section headers', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const row = page.locator('.trow').first();
  await expect(row).toBeVisible();
  expect((await row.boundingBox())!.height).toBeLessThanOrEqual(38);
  await expect(page.locator('.task-view-group .grp').first()).toBeVisible();
  await expect(row.locator('.ttl')).toBeVisible();
});

test('task field popovers expose real status, searchable assignee and calendar choices in the original compact surface', async ({ page }) => {
  await prepare(page);
  await page.clock.install({ time: new Date('2026-10-21T08:30:00Z') });
  await page.goto('/app-local/w/w1/tasks');
  const task = data.tasks[0];
  const row = page.locator(`[data-task-row="${task.id}"]`);
  await row.getByRole('button', { name: `Change status: ${task.key}`, exact: true }).click();
  const status = page.getByRole('menu', { name: 'Status', exact: true });
  await expect(status.getByRole('menuitemradio')).toHaveCount(5);
  await expect(status.getByRole('menuitemradio', { checked: true })).toHaveCount(1);
  expect((await status.boundingBox())!.width).toBeGreaterThanOrEqual(200);
  expect((await status.boundingBox())!.width).toBeLessThanOrEqual(260);
  await status.getByRole('menuitemradio', { name: /In progress/i }).click();
  await expect(row.getByRole('button', { name: `Change status: ${task.key}`, exact: true })).toContainText(/In progress/i);
  await row.getByRole('button', { name: `Change assignee: ${task.key}`, exact: true }).click();
  const assignee = page.getByRole('menu', { name: 'Assignee', exact: true });
  await assignee.getByRole('textbox', { name: 'Search assignees', exact: true }).fill(data.members[1].name);
  await expect(assignee.getByRole('menuitemradio')).toHaveCount(1);
  await assignee.getByRole('menuitemradio', { name: data.members[1].name, exact: true }).click();
  await expect(row.getByRole('button', { name: `Change assignee: ${task.key}`, exact: true })).toContainText(data.members[1].name);
  await row.getByRole('button', { name: `Change due date: ${task.key}`, exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'Choose due date', exact: true });
  await expect(calendar.getByRole('button', { name: 'Today', exact: true })).toBeVisible();
  await expect(calendar.locator('[data-date-choice]')).toHaveCount(42);
  await calendar.getByRole('button', { name: 'Today', exact: true }).click();
  const stored = await page.evaluate(
    id => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.tasks.find((item: { id: string }) => item.id === id),
    task.id,
  );
  expect(stored.status).toBe('progress');
  expect(stored.assignee).toBe(data.members[1].id);
  expect(stored.due).toBe('2026-10-21');
  expect((await row.boundingBox())!.height).toBeLessThanOrEqual(38);
});

test('task field popup cancellation preserves data and restores keyboard focus', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const task = data.tasks[0];
  const row = page.locator(`[data-task-row="${task.id}"]`);
  const opener = row.getByRole('button', { name: `Change priority: ${task.key}`, exact: true });
  const original = await page.evaluate(
    id => JSON.stringify(JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.tasks.find((item: { id: string }) => item.id === id)),
    task.id,
  );
  await opener.focus();
  await page.keyboard.press('Enter');
  const popup = page.getByRole('menu', { name: 'Priority', exact: true });
  await expect(popup).toBeVisible();
  await expect(popup.getByRole('menuitemradio', { checked: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(popup.locator(':focus')).toHaveAttribute('role', 'menuitemradio');
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await expect(opener).toBeFocused();
  const due = row.getByRole('button', { name: `Change due date: ${task.key}`, exact: true });
  await due.click();
  await page.getByRole('dialog', { name: 'Choose due date', exact: true }).getByRole('button', { name: 'Next month', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(due).toBeFocused();
  expect(
    await page.evaluate(
      id => JSON.stringify(JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.tasks.find((item: { id: string }) => item.id === id)),
      task.id,
    ),
  ).toBe(original);
});

test('drawer property popovers keep changes in the draft, restore modal focus and preserve a pending reply', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const task = data.tasks[0];
  await page
    .locator(`[data-task-row="${task.id}"]`)
    .getByRole('button', { name: new RegExp(task.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    .click();
  const drawer = page.getByRole('dialog', { name: 'Task details', exact: true });
  const priority = drawer.getByRole('button', { name: 'Priority', exact: true });
  await priority.click();
  await drawer.getByRole('menu', { name: 'Priority', exact: true }).getByRole('menuitemradio', { name: 'Urgent', exact: true }).click();
  await expect(priority).toContainText('Urgent');
  const storedPriority = await page.evaluate(
    id => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.tasks.find((item: { id: string }) => item.id === id).priority,
    task.id,
  );
  expect(storedPriority).toBe(task.priority);
  await priority.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(priority).toBeFocused();
  await drawer.getByRole('button', { name: 'Edit description', exact: true }).click();
  await drawer.getByRole('textbox', { name: 'Description', exact: true }).fill('<b>Formatted draft</b><img src=x onerror=alert(1)>');
  await drawer.getByRole('button', { name: 'Preview description', exact: true }).click();
  await expect(drawer.locator('.rich-content b').filter({ hasText: 'Formatted draft' })).toBeVisible();
  await expect(drawer.locator('.rich-content [onerror], .rich-content script')).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  expect(
    await page.evaluate(
      id => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.tasks.find((item: { id: string }) => item.id === id).priority,
      task.id,
    ),
  ).toBe('urgent');
  await drawer.getByRole('textbox', { name: 'Comment', exact: true }).fill('Reply draft must survive');
  await drawer.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('textbox', { name: 'Comment', exact: true })).toHaveValue('Reply draft must survive');
  await expect(drawer.getByRole('alert')).toContainText('Post or discard this reply');
});

test('expanded drawer pickers remain inside the visible modal and viewport after body scrolling', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const task = data.tasks[0];
  await page
    .locator(`[data-task-row="${task.id}"]`)
    .getByRole('button', { name: new RegExp(task.title) })
    .click();
  const drawer = page.getByRole('dialog', { name: 'Task details', exact: true });
  await drawer.getByRole('button', { name: 'Maximize task', exact: true }).click();
  const expanded = await drawer.boundingBox();
  expect(Math.round(expanded!.width)).toBe(980);
  expect(Math.abs(expanded!.x - (1440 - expanded!.width) / 2)).toBeLessThanOrEqual(1);
  await drawer.getByRole('button', { name: 'Priority', exact: true }).click();
  const menu = drawer.getByRole('menu', { name: 'Priority', exact: true });
  await expect(menu).toBeVisible();
  const modal = await drawer.boundingBox(),
    popup = await menu.boundingBox();
  const anchor = await drawer.getByRole('button', { name: 'Priority', exact: true }).boundingBox();
  expect(Math.abs(popup!.x - anchor!.x)).toBeLessThanOrEqual(2);
  expect(popup!.x).toBeGreaterThanOrEqual(modal!.x);
  expect(popup!.y).toBeGreaterThanOrEqual(modal!.y);
  expect(popup!.x + popup!.width).toBeLessThanOrEqual(modal!.x + modal!.width);
  expect(popup!.y + popup!.height).toBeLessThanOrEqual(1000);
});

test('date dialog keyboard traversal reaches month navigation and clear without dismissing the picker', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const task = data.tasks[0];
  const due = page.locator(`[data-task-row="${task.id}"]`).getByRole('button', { name: `Change due date: ${task.key}`, exact: true });
  await due.click();
  const dialog = page.getByRole('dialog', { name: 'Choose due date', exact: true });
  await page.keyboard.press('Tab');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 60 && !(await dialog.getByRole('button', { name: 'Next month', exact: true }).evaluate(el => el === document.activeElement)); i++)
    await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Next month', exact: true })).toBeFocused();
  const initial = await dialog.locator('.task-calendar-heading b').textContent();
  await page.keyboard.press('Enter');
  await expect(dialog.locator('.task-calendar-heading b')).not.toHaveText(initial!);
  for (let i = 0; i < 60 && !(await dialog.getByRole('button', { name: 'Clear', exact: true }).evaluate(el => el === document.activeElement)); i++)
    await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Clear', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(due).toContainText('Set date');
});

test('list select all and bulk clear are visible controls acting on the actual rows', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const all = page.getByRole('checkbox', { name: 'Select all visible tasks', exact: true });
  await expect(all).toBeVisible();
  const box = await all.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(12);
  expect(box!.height).toBeGreaterThanOrEqual(12);
  const subtaskChecks = page.locator('[data-task-row] .task-cell-details input[type="checkbox"]');
  const retainedSubtasks = await subtaskChecks.evaluateAll(nodes =>
    nodes.map(node => ({ label: node.closest('label')?.textContent, checked: (node as HTMLInputElement).checked })),
  );
  await all.check();
  const bulk = page.getByRole('group', { name: 'Bulk actions', exact: true });
  await expect(bulk.getByRole('button', { name: 'Clear selection', exact: true })).toBeVisible();
  await bulk.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(page.locator('[data-task-row] .c-check input[type="checkbox"]:checked')).toHaveCount(0);
  await expect(bulk).toHaveCount(0);
  expect(
    await subtaskChecks.evaluateAll(nodes => nodes.map(node => ({ label: node.closest('label')?.textContent, checked: (node as HTMLInputElement).checked }))),
  ).toEqual(retainedSubtasks);
});

test('drawer headings survive formatting blur save and reopen while multiline titles fit their rendered height', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const task = data.tasks[0];
  await page
    .locator(`[data-task-row="${task.id}"]`)
    .getByRole('button', { name: new RegExp(task.title) })
    .click();
  const drawer = page.getByRole('dialog', { name: 'Task details', exact: true });
  const title = drawer.getByRole('textbox', { name: 'Title', exact: true });
  await title.fill('A\nB\nC');
  const geometry = await title.evaluate(el => ({ client: el.clientHeight, scroll: el.scrollHeight }));
  expect(geometry.client).toBeGreaterThanOrEqual(geometry.scroll);
  const description = drawer.getByRole('textbox', { name: 'Description', exact: true });
  await description.fill('Persistent heading');
  await description.press('Meta+A');
  await drawer.getByRole('button', { name: 'Heading', exact: true }).click();
  await title.focus();
  await expect(drawer.locator('.rich-content h4')).toHaveText('Persistent heading');
  await drawer.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Task details', exact: true }).locator('.rich-content h4')).toHaveText('Persistent heading');
});

test('Portuguese recurrence trigger displays its translated choice and mobile icon tabs retain accessible names', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    const state = JSON.parse(localStorage.getItem('gr8r.v2')!);
    state.prefs.lang = 'pt-BR';
    localStorage.setItem('gr8r.v2', JSON.stringify(state));
  });
  await page.goto('/app-local/w/w1/tasks');
  const task = data.tasks[0];
  await page
    .locator(`[data-task-row="${task.id}"]`)
    .getByRole('button', { name: new RegExp(task.title) })
    .click();
  const drawer = page.getByRole('dialog', { name: 'Detalhes da tarefa', exact: true });
  await drawer.getByRole('button', { name: 'Recorrência', exact: true }).click();
  await drawer.getByRole('menu', { name: 'Recorrência', exact: true }).getByRole('menuitemradio', { name: 'Semanal', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'Recorrência', exact: true })).toContainText('Semanal');
  await drawer.getByRole('button', { name: 'Fechar painel', exact: true }).click();
  await page.goto('/app-local/w/w1/projects');
  await page.setViewportSize({ width: 390, height: 844 });
  const layouts = page.getByRole('tablist', { name: 'Layout', exact: true });
  await expect(layouts.getByRole('tab', { name: 'Grade', exact: true })).toBeVisible();
  await expect(layouts.getByRole('tab', { name: 'Lista', exact: true })).toBeVisible();
  await expect(layouts.getByRole('tab', { name: 'Tabela', exact: true })).toBeVisible();
});

test('project forms use the original icon choices swatches templates and separate modal footer', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/projects');
  await page.getByRole('button', { name: 'New project', exact: true }).last().click();
  const modal = page.getByRole('dialog', { name: 'New project', exact: true });
  await expect(modal.getByRole('radiogroup', { name: 'Icon', exact: true })).toBeVisible();
  await expect(modal.getByRole('radiogroup', { name: 'Color', exact: true })).toBeVisible();
  await expect(modal.getByRole('radiogroup', { name: 'Template', exact: true })).toBeVisible();
  await expect(modal.locator('.modal-f').getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await expect(modal.locator('.project-properties-row > label')).toHaveCount(3);
});

test('week cards and timeline retain the original metadata and grouped date layers', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/calendar');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.locator('.wcol-h')).toHaveCount(7);
  await expect(page.locator('.wcard .m').first()).toBeVisible();
  await page.goto('/app-local/w/w1/timeline');
  await expect(page.locator('.tl-months')).toBeVisible();
  await expect(page.locator('.tl-days')).toBeVisible();
  await expect(page.locator('.timeline-weekend').first()).toBeAttached();
  expect(await page.locator('.schedule-timeline').evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
});

test('board hierarchy uses top labels progress and editable metadata while the table has one grouped header', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks?view=board');
  const card = page
    .locator('.kcard')
    .filter({ has: page.locator('.labels') })
    .first();
  await expect(card).toBeVisible();
  expect(
    await card.evaluate(el => !!(el.querySelector('.labels')!.compareDocumentPosition(el.querySelector('.top')!) & Node.DOCUMENT_POSITION_FOLLOWING)),
  ).toBe(true);
  await expect(page.locator('.kcard .subp [role="progressbar"]').first()).toBeVisible();
  await card.getByRole('button', { name: /^Change priority:/ }).click();
  await expect(page.getByRole('menu', { name: 'Priority', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/app-local/w/w1/tasks?view=table');
  await expect(page.locator('.task-view-table.is-table thead')).toHaveCount(1);
  const title = page.locator('.task-view-table.is-table col[data-col="title"]');
  expect(Math.round((await title.boundingBox())!.width)).toBe(314);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.locator('.task-mobile-card').first();
  await expect(mobile).toBeVisible();
  await expect(mobile.locator('[data-mobile-assignee]')).toBeVisible();
  await expect(mobile.locator('[data-mobile-due]')).toBeVisible();
});

test('project list uses compact original rows and file options use a distinct anchored menu', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/projects');
  await page.getByRole('tablist', { name: 'Layout', exact: true }).getByRole('tab', { name: 'List', exact: true }).click();
  const row = page.locator('.project-list-row').first();
  expect((await row.boundingBox())!.height).toBe(52);
  await expect(row.locator('.project-list-meta')).toBeVisible();
  await page.goto('/app-local/w/w1/project?project=p1&tab=files');
  await page
    .getByRole('button', { name: /^File options:/ })
    .first()
    .click();
  await expect(page.getByRole('menu', { name: 'File options', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('new task create-more saves two distinct tasks and quick edit reuses guarded persistence', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'New task', exact: true });
  await expect(create).toHaveClass(/task-modal/);
  const geometry = await create.boundingBox();
  expect(Math.round(geometry!.width)).toBe(560);
  expect(Math.abs(geometry!.x - (1440 - geometry!.width) / 2)).toBeLessThanOrEqual(1);
  await create.getByRole('checkbox', { name: 'Create more', exact: true }).check();
  await create.getByRole('textbox', { name: 'Title', exact: true }).fill('Create more first persistent task');
  await create.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(create.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('');
  await create.getByRole('checkbox', { name: 'Create more', exact: true }).uncheck();
  await create.getByRole('textbox', { name: 'Title', exact: true }).fill('Create more second persistent task');
  await create.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Task details', exact: true })).not.toHaveClass(/task-modal/);
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  const first = page.locator('[data-task-row]').filter({ has: page.getByRole('button', { name: /Create more first persistent task/ }) });
  const second = page.locator('[data-task-row]').filter({ has: page.getByRole('button', { name: /Create more second persistent task/ }) });
  const firstId = await first.getAttribute('data-task-row'),
    secondId = await second.getAttribute('data-task-row');
  expect(firstId).toBeTruthy();
  expect(secondId).toBeTruthy();
  expect(firstId).not.toBe(secondId);
  await page.reload();
  await expect(page.locator(`[data-task-row="${firstId}"]`)).toContainText('Create more first persistent task');
  await expect(page.locator(`[data-task-row="${secondId}"]`)).toContainText('Create more second persistent task');
  await page.locator(`[data-task-row="${firstId}"]`).click({ button: 'right' });
  await page.getByRole('menu', { name: 'Task actions', exact: true }).getByRole('menuitem', { name: 'Quick edit', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Task details', exact: true });
  await expect(edit).toHaveClass(/task-modal/);
  await edit.getByRole('button', { name: 'Priority', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(edit).toBeVisible();
  await expect(edit.getByRole('button', { name: 'Priority', exact: true })).toBeFocused();
  await edit.getByRole('textbox', { name: 'Title', exact: true }).fill('Quick edited persistent task');
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(edit.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await page.reload();
  await expect(page.locator(`[data-task-row="${firstId}"]`)).toContainText('Quick edited persistent task');
  await expect(page.locator(`[data-task-row="${secondId}"]`)).toContainText('Create more second persistent task');
});

test('My tasks context reorder keeps fixed due groups and task fields intact after reload', async ({ page }) => {
  await prepare(page);
  const fixture = structuredClone(data);
  const first = fixture.tasks[0],
    second = fixture.tasks[1];
  Object.assign(first, { title: 'Reorder regression first', assignee: 'm1', status: 'todo', due: '2026-12-01', start: '2026-11-01', recur: null });
  Object.assign(second, { title: 'Reorder regression second', assignee: 'm1', status: 'progress', due: '2026-12-01', start: '2026-11-02', recur: null });
  await page.addInitScript(
    value => localStorage.setItem('gr8r.v2', JSON.stringify({ data: value, prefs: { lang: 'en', theme: 'dark', density: 'compact' } })),
    fixture,
  );
  await page.clock.install({ time: new Date('2026-10-21T08:30:00Z') });
  await page.goto('/app-local/w/w1/mytasks');
  await page.getByRole('textbox', { name: 'Search tasks', exact: true }).fill('Reorder regression');
  const group = page.locator('[data-task-group="upcoming"]');
  await expect(group.locator('[data-task-row]')).toHaveCount(2);
  const firstRow = group.locator(`[data-task-row="${first.id}"]`);
  await firstRow.click({ button: 'right' });
  await page.getByRole('menu', { name: 'Task actions', exact: true }).getByRole('menuitem', { name: 'Move down', exact: true }).click();
  await expect(group.locator('[data-task-row]').first()).toHaveAttribute('data-task-row', second.id);
  await expect(group.locator('[data-task-row]').last()).toHaveAttribute('data-task-row', first.id);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(group.locator('[data-task-row]').first()).toHaveAttribute('data-task-row', second.id);
  await expect(group.locator('[data-task-row]').last()).toHaveAttribute('data-task-row', first.id);
  const stored = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.tasks as {
        id: string;
        status: string;
        due: string;
        start: string;
        assignee: string;
      }[],
  );
  expect(stored.find(task => task.id === first.id)).toMatchObject({ status: 'todo', due: '2026-12-01', start: '2026-11-01', assignee: 'm1' });
  expect(stored.find(task => task.id === second.id)).toMatchObject({ status: 'progress', due: '2026-12-01', start: '2026-11-02', assignee: 'm1' });
});

test('sharing from the project collection copies the selected project detail link', async ({ page }) => {
  await prepare(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/app-local/w/w1/projects');
  const project = data.projects.find(project => project.id === 'p1')!;
  const card = page.locator(`[data-project-id="${project.id}"]`);
  await card.getByLabel('Project options ' + project.name, { exact: true }).click();
  await card.getByRole('button', { name: 'Project members', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Project members', exact: true });
  await dialog.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Link copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const target = new URL(copied);
  expect(target.pathname).toBe('/app-local/w/w1/project');
  expect(target.searchParams.get('project')).toBe(project.id);
  await page.goto(copied);
  await expect(page.getByRole('navigation', { name: 'Project tabs', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
});

test('ungrouped table omits group headers and ignores a stale all-group collapse', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      'gr8r.preferences.local',
      JSON.stringify({ prefs: { lang: 'en', theme: 'dark', density: 'compact' }, views: { w1: { 'tasks:table': { group: 'none', collapsed: ['all'] } } } }),
    ),
  );
  await page.goto('/app-local/w/w1/tasks?view=table');
  const table = page.getByRole('table', { name: 'Tasks table', exact: true });
  await expect(table.locator('.grow-row')).toHaveCount(0);
  await expect(table.locator('[data-task-row]').first()).toBeVisible();
  await table.getByRole('button', { name: 'New task', exact: true }).click();
  await expect(table.getByRole('textbox', { name: 'New task in group: all', exact: true })).toBeVisible();
});

test('table width controls share original defaults through first adjustment and reset', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks?view=table');
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Columns', exact: true });
  const width = dialog.getByRole('slider', { name: 'Width: Title', exact: true });
  await expect(width).toHaveValue('314');
  await expect(dialog.getByRole('slider', { name: 'Width: Status', exact: true })).toHaveValue('132');
  await expect(dialog.getByRole('slider', { name: 'Width: Estimate', exact: true })).toHaveValue('92');
  await width.focus();
  await width.press('ArrowRight');
  await expect(width).toHaveValue('315');
  await page.keyboard.press('Escape');
  expect(Math.round((await page.locator('col[data-col="title"]').boundingBox())!.width)).toBe(315);
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  await dialog.getByRole('button', { name: 'Reset columns', exact: true }).click();
  await expect(width).toHaveValue('314');
  await page.keyboard.press('Escape');
  expect(Math.round((await page.locator('col[data-col="title"]').boundingBox())!.width)).toBe(314);
});

test('project list options retain personal favorite and unfavorite actions across reload', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/projects');
  await page.getByRole('tablist', { name: 'Layout', exact: true }).getByRole('tab', { name: 'List', exact: true }).click();
  const project = data.projects.find(project => project.id === 'p1')!;
  const row = page.locator(`[data-project-id="${project.id}"]`);
  await row.getByLabel('Project options ' + project.name, { exact: true }).click();
  const favorite = row.getByRole('button', { name: /^(Favorite|Unfavorite) project / });
  const wasFavorite = (await favorite.getAttribute('aria-pressed')) === 'true';
  await favorite.click();
  await expect(favorite).toHaveAttribute('aria-pressed', String(!wasFavorite));
  await page.reload();
  await row.getByLabel('Project options ' + project.name, { exact: true }).click();
  await expect(favorite).toHaveAttribute('aria-pressed', String(!wasFavorite));
  await favorite.click();
  await expect(favorite).toHaveAttribute('aria-pressed', String(wasFavorite));
});

test('mobile task and My tasks list cards keep every rendered metadata control inside the viewport', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['tasks', 'mytasks']) {
    await page.goto(`/app-local/w/w1/${route}`);
    const row = page.locator('.task-list-rows [data-task-row]').first();
    await expect(row).toBeVisible();
    for (const field of ['status', 'priority', 'due', 'project']) {
      const metadata = row.locator(`[data-task-column="${field}"]`);
      await expect(metadata).toBeInViewport({ ratio: 1 });
      const box = await metadata.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    expect((await row.boundingBox())!.height).toBeGreaterThan(90);
  }
});

test('calendar month grid fills the available desktop viewport and displays its actual project legend', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/calendar');
  const calendar = page.locator('.schedule-calendar');
  const box = await calendar.boundingBox();
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(998);
  await expect(page.getByRole('list', { name: 'Calendar projects', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Calendar projects', exact: true }).getByRole('listitem')).toHaveCount(5);
});

test('filtered Review table group creates a persistent task in that group through its compact add action', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      'gr8r.preferences.local',
      JSON.stringify({
        prefs: { lang: 'en', theme: 'dark', density: 'compact' },
        views: { w1: { 'tasks:table': { group: 'status', filters: [{ f: 'status', op: 'is', v: ['review'] }] } } },
      }),
    ),
  );
  await page.goto('/app-local/w/w1/tasks?view=table');
  const table = page.getByRole('table', { name: 'Tasks table', exact: true });
  await expect(table.locator('[data-task-row]').first()).toBeVisible();
  await expect(table.locator('[data-task-row]')).toHaveCount(data.tasks.filter(task => task.status === 'review').length);
  for (const status of await table.locator('[data-task-row] [data-task-column="status"]').all()) await expect(status).toContainText(/review/i);
  await expect(table.locator('.grow-row').filter({ hasText: 'In review' })).toHaveCount(1);
  const addReview = table.getByRole('button', { name: 'Add task in group: review', exact: true });
  await addReview.click();
  await expect(addReview).toBeDisabled();
  await table.getByRole('button', { name: 'Cancel creation', exact: true }).click();
  await expect(table.getByRole('textbox', { name: 'New task in group: review', exact: true })).toHaveCount(0);
  await expect(addReview).toBeEnabled();
  await addReview.click();
  const title = 'Review group creation remains visible after reload';
  await table.getByRole('textbox', { name: 'New task in group: review', exact: true }).fill(title);
  await table.getByRole('button', { name: 'Add to group: review', exact: true }).click();
  const created = table.locator('[data-task-row]').filter({ has: page.getByRole('button', { name: title, exact: true }) });
  await expect(created).toBeVisible();
  await expect(created.locator('[data-task-column="status"]')).toContainText(/review/i);
  const id = await created.getAttribute('data-task-row');
  expect(id).toBeTruthy();
  await page.reload();
  const persisted = page.getByRole('table', { name: 'Tasks table', exact: true }).locator(`[data-task-row="${id}"]`);
  await expect(persisted).toBeVisible();
  await expect(persisted).toContainText(title);
  await expect(persisted.locator('[data-task-column="status"]')).toContainText(/review/i);
});

test('mobile task toolbars and project header keep the original first-card rhythm and card height', async ({ page }) => {
  await prepare(page);
  await page.clock.install({ time: new Date('2026-10-21T08:30:00Z') });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['tasks', 'mytasks', 'project?project=p1&tab=list']) {
    await page.goto(`/app-local/w/w1/${route}`);
    const row = page.locator('.task-list-rows [data-task-row]').first();
    await expect(row).toBeVisible();
    const first = await row.boundingBox();
    expect(Math.abs(first!.y - (route.startsWith('project?') ? 285 : 270.359375))).toBeLessThanOrEqual(1);
    expect(Math.abs(first!.height - 131.5625)).toBeLessThanOrEqual(1);
    if (route === 'mytasks') await expect(page.getByRole('button', { name: /^Overdue/ })).toBeInViewport({ ratio: 1 });
    if (route.startsWith('project?')) {
      const tabs = await page.getByRole('navigation', { name: 'Project tabs', exact: true }).boundingBox();
      expect(Math.abs(tabs!.y - 152)).toBeLessThanOrEqual(1);
    }
  }
});

test('filter and mobile due-date popovers retain their original widths and quick-date row', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const filter = page.getByRole('dialog', { name: 'Filters', exact: true });
  expect(Math.round((await filter.boundingBox())!.width)).toBe(560);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('.task-list-rows [data-task-row]')
    .first()
    .getByRole('button', { name: /^Change due date:/ })
    .click();
  const date = page.getByRole('dialog', { name: 'Choose due date', exact: true });
  expect(Math.round((await date.boundingBox())!.width)).toBe(322);
  const today = (await date.getByRole('button', { name: 'Today', exact: true }).boundingBox())!;
  const later = (await date.getByRole('button', { name: 'In 2 weeks', exact: true }).boundingBox())!;
  expect(Math.abs(today.y - later.y)).toBeLessThanOrEqual(1);
});

test('mobile schedule toolbars expose manual sort and timeline controls without covering calendar navigation', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['timeline', 'project?project=p1&tab=timeline']) {
    await page.goto(`/app-local/w/w1/${route}`);
    const toolbar = page.getByLabel('View controls', { exact: true });
    for (const name of ['Sort', 'Weeks', 'Months', 'Today']) {
      const button = toolbar.getByRole('button', { name, exact: true });
      await expect(button).toBeInViewport({ ratio: 1 });
      expect(
        await button.evaluate(element => {
          const r = element.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return top === element || element.contains(top);
        }),
      ).toBe(true);
    }
    await expect(toolbar.getByRole('button', { name: 'Sort', exact: true })).toContainText('Manual');
    await expect(toolbar.getByRole('combobox', { name: 'Group', exact: true })).toBeInViewport({ ratio: 1 });
  }
  await page.goto('/app-local/w/w1/calendar');
  const sort = await page.getByLabel('View controls', { exact: true }).getByRole('button', { name: 'Sort', exact: true }).boundingBox();
  const navigation = await page.locator('.schedule-navigation').boundingBox();
  expect(sort!.y + sort!.height).toBeLessThanOrEqual(navigation!.y);
});

test('mobile table cards keep the original compact title and metadata height with real controls', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['tasks?view=table', 'project?project=p1&tab=table']) {
    await page.goto(`/app-local/w/w1/${route}`);
    const card = page.locator('.task-mobile-card').first();
    await expect(card).toBeInViewport({ ratio: 1 });
    expect(Math.abs((await card.boundingBox())!.height - 82.953125)).toBeLessThanOrEqual(1);
    await expect(card.getByRole('checkbox')).toBeVisible();
    await expect(card.getByRole('button', { name: /^Change priority:/ })).toBeVisible();
    await expect(card.getByRole('button', { name: /^Change assignee:/ })).toBeVisible();
    await expect(card.getByRole('button', { name: /^Change due date:/ })).toBeVisible();
  }
});

for (const theme of ['dark', 'light']) {
  for (const scope of ['workspace', 'project']) {
    for (const mode of ['month', 'week']) {
      test(`mobile calendar controls remain clear with a real day add action: ${theme} ${scope} ${mode}`, async ({ page }) => {
        await prepare(page);
        await page.clock.install({ time: new Date('2026-10-21T08:30:00Z') });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.addInitScript(prefs => localStorage.setItem('gr8r.preferences.local', JSON.stringify({ prefs })), {
          lang: 'en',
          theme,
          density: 'comfortable',
        });
        await page.goto(scope === 'project' ? '/app-local/w/w1/project?project=p1&tab=calendar' : '/app-local/w/w1/calendar');
        const navigation = page.locator('.schedule-navigation');
        await navigation.getByRole('button', { name: mode === 'week' ? 'Week' : 'Month', exact: true }).click();
        const toolbar = page.getByLabel('View controls', { exact: true });
        if (scope === 'project') {
          const create = await toolbar.getByRole('button', { name: 'New task', exact: true }).boundingBox();
          expect(create!.y + create!.height).toBeLessThanOrEqual((await navigation.boundingBox())!.y);
          await toolbar.getByRole('button', { name: 'New task', exact: true }).click({ trial: true });
        }
        for (const button of await navigation.getByRole('button').all()) {
          await expect(button).toBeInViewport({ ratio: 1 });
          expect(
            await button.evaluate(element => {
              const r = element.getBoundingClientRect(),
                top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
              return top === element || element.contains(top);
            }),
          ).toBe(true);
        }
        if (mode === 'week') {
          const today = (await navigation.getByRole('button', { name: 'Today', exact: true }).boundingBox())!;
          const week = (await navigation.getByRole('button', { name: 'Week', exact: true }).boundingBox())!;
          expect(week.y).toBeGreaterThanOrEqual(today.y + today.height + 4);
          await expect(page.locator('.schedule-week .wcol-h')).toHaveCount(7);
          const first = page.locator('.schedule-week .wcol').first();
          const day = await first.getAttribute('data-calendar-day');
          const add = first.locator('.wcol-h').getByRole('button', { name: /^Add task on / });
          await expect(add).toBeInViewport({ ratio: 1 });
          expect((await add.locator('svg').boundingBox())!.width).toBeGreaterThanOrEqual(12);
          await add.click();
          const dialog = page.getByRole('dialog', { name: 'New task', exact: true });
          await dialog.getByRole('button', { name: 'Due date', exact: true }).click();
          await expect(dialog.locator('[data-date-choice][aria-pressed=true]')).toHaveAttribute('data-date-choice', day!);
          await page.keyboard.press('Escape');
          await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
          await expect(dialog).toHaveCount(0);
        }
      });
    }
  }
}
