import { test, expect } from '@playwright/test';
import { seed } from '../../src/data/seed.js';
const data = { ...seed(), preservedGraphMetadata: { literal: '<kept>', nested: ['unknown'] } };
const firstTask = { ...data.tasks[0], preservedTaskMetadata: { original: 'Home <literal>', nested: { value: 17 } } };
data.tasks[0] = firstTask;
const firstTitle = data.tasks[0].title;
async function prepare(page: import('@playwright/test').Page, collapsed = false) {
  await page.addInitScript(
    value => {
      if (!localStorage.getItem('gr8r.v2'))
        localStorage.setItem(
          'gr8r.v2',
          JSON.stringify({
            data: value.data,
            prefs: { lang: 'en', theme: 'dark', density: 'compact', custom: 'keep' },
            views: { p1: { sort: 'due' } },
            collapsed: value.collapsed,
          }),
        );
    },
    { data, collapsed },
  );
}
test('local entry edits existing browser graph, creates/comments, switches blank workspace and reloads', async ({ page }) => {
  await prepare(page);
  await page.goto('/login');
  await page.getByRole('link', { name: /Continue on this device|Continuar neste dispositivo/ }).click();
  await expect(page.locator('.work-status')).toContainText('Stored on this device');
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  const retainedLegacy = await page.evaluate(() => localStorage.getItem('gr8r.v2'));
  await expect(page.getByRole('button', { name: firstTitle })).toBeVisible();
  await page.getByRole('button', { name: firstTitle }).click();
  await page.getByLabel('Title', { exact: true }).fill('Home <literal>');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Local created');
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Task details', exact: true })).toBeVisible();
  await page.getByLabel('Comment', { exact: true }).fill('Saved from this device');
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(page.locator('article.comment .rich-content').filter({ hasText: 'Saved from this device' })).toBeVisible();
  await page.getByRole('heading', { name: 'Task details', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/task6a-desktop-dark-en.png', fullPage: true });
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.getByRole('button', { name: 'Create workspace', exact: true }).last().click();
  await page.getByLabel('Workspace name').fill('Local second');
  await page.getByRole('dialog').getByRole('button', { name: 'Create workspace', exact: true }).click();
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page.getByText('No tasks here yet', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.locator('.work-breadcrumb')).toContainText('Local second');
  await expect(page.getByRole('button', { name: 'Local created' })).toHaveCount(0);
  await page.getByLabel('Workspace', { exact: true }).selectOption(data.workspaces[0].id);
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Local created' }).click();
  await expect(page.locator('article.comment .rich-content').filter({ hasText: 'Saved from this device' })).toBeVisible();
  await page.reload();
  await expect(page.locator('article.comment .rich-content').filter({ hasText: 'Saved from this device' })).toBeVisible();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Home <literal>' })).toBeVisible();
  const stored = await page.evaluate(id => {
    const state = JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!);
    return { data: state.records[id].data, legacy: localStorage.getItem('gr8r.v2') };
  }, data.workspaces[0].id);
  expect(stored.legacy).toBe(retainedLegacy);
  expect(stored.data.preservedGraphMetadata).toEqual(data.preservedGraphMetadata);
  expect(stored.data.tasks[0].preservedTaskMetadata).toEqual(firstTask.preservedTaskMetadata);
  expect(Object.keys(stored.data).sort()).toEqual(
    Object.keys(data)
      .filter(key => key !== 'workspaces')
      .sort(),
  );
  await page.getByRole('link', { name: 'Integrations', exact: true }).click();
  await expect(page.getByText('OAuth, agents and webhooks require a cloud workspace.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /connect|retry delivery/i })).toHaveCount(0);
  await page.getByLabel('Language', { exact: true }).selectOption('pt-BR');
  await page.getByRole('button', { name: 'Alternar tema' }).click();
  await page.screenshot({ path: '/tmp/task6a-desktop-light-pt.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/task6a-mobile-light-pt.png', fullPage: true });
  await page.getByRole('button', { name: 'Alternar tema' }).click();
  await page.getByLabel('Idioma', { exact: true }).selectOption('en');
  await page.screenshot({ path: '/tmp/task6a-mobile-dark-en.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('corrupted storage stays intact and shows a recoverable error without seeding over it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gr8r.workspaces.v1', '{broken'));
  await page.goto('/app-local');
  await expect(page.getByRole('alert')).toContainText(/armazenamento|storage/i);
  expect(await page.evaluate(() => localStorage.getItem('gr8r.workspaces.v1'))).toBe('{broken');
});
test('concurrent local edit keeps the original draft and blocks workspace switch until explicit conflict recovery', async ({ page, context }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  await page.getByRole('button', { name: firstTitle }).click();
  await page.getByLabel('Title', { exact: true }).fill('My unsaved draft');
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByLabel('Title', { exact: true }).fill('Another tab saved');
  await other.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(other.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your draft was kept');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My unsaved draft');
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export task draft', exact: true }).click();
  const download = await exported;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const draft = JSON.parse(Buffer.concat(chunks).toString());
  expect(draft.task.title).toBe('My unsaved draft');
  expect(draft.workspaceId).toBe(data.workspaces[0].id);

  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My unsaved draft');
  await page.getByRole('button', { name: 'Reload version and discard draft' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Another tab saved');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Another tab saved' })).toBeVisible();
});
test('stored system theme follows media changes and a pre-auth locale survives reload', async ({ page }) => {
  await page.addInitScript(value => {
    if (!localStorage.getItem('gr8r.v2')) localStorage.setItem('gr8r.v2', JSON.stringify({ data: value, prefs: { theme: 'system', lang: 'pt-BR' } }));
  }, data);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/login');
  await page.getByLabel('Idioma', { exact: true }).selectOption('en');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue on this device' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
test('fresh secondary-workspace deep link preserves selection and migrates original legacy views only once', async ({ page }) => {
  await prepare(page, true);
  const originalId = data.workspaces[0].id,
    selectedId = data.workspaces[1].id;
  await page.goto(`/app-local/w/${selectedId}/tasks`);
  await expect(page.getByLabel('Workspace', { exact: true })).toHaveValue(selectedId);
  await expect(page.getByText('No tasks here yet')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.preferences.local')!)))
    .toEqual({
      prefs: { lang: 'en', theme: 'dark', density: 'compact', custom: 'keep' },
      collapsed: true,
      views: { [originalId]: { p1: { sort: 'due' } } },
      activeWorkspace: selectedId,
    });
  await page.reload();
  await expect(page.getByLabel('Workspace', { exact: true })).toHaveValue(selectedId);
  await page.getByLabel('Workspace', { exact: true }).selectOption(originalId);
  await expect(page).toHaveURL(/\/home$/);
  await page.goto(`/app-local/w/${originalId}/tasks`);
  await expect(page.getByRole('button', { name: firstTitle })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.preferences.local')!).views)).toEqual({ [originalId]: { p1: { sort: 'due' } } });
});
test('dirty completion requires explicit save and preserves effective fields after reload', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  await page.getByRole('button', { name: data.tasks.find(task => task.status !== 'done')!.title }).click();
  await expect(page.getByRole('combobox', { name: 'Status', exact: true })).not.toHaveValue('done');
  await expect(page.getByRole('button', { name: 'Complete task', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('<p>Effective draft</p><img src=x onerror=alert(1)>');
  await page.getByLabel('Due date', { exact: true }).fill('2026-11-12');
  await page.getByRole('button', { name: 'Complete task', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Save changes before this action');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Complete task', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('done');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('done');
  await expect(page.getByLabel('Due date', { exact: true })).toHaveValue('2026-11-12');
  await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('<p>Effective draft</p><img src=x onerror=alert(1)>');
  await expect(page.locator('.rich-content [onerror]')).toHaveCount(0);
});
test('task table filters, inline edits, columns, collapse and workspace/view preferences survive reload', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  await page.getByRole('link', { name: 'Table', exact: true }).click();
  const rowTask = data.tasks.find(task => task.status !== 'done')!;
  await page.getByRole('textbox', { name: 'Search tasks', exact: true }).fill(rowTask.title);
  await expect(page.getByRole('button', { name: rowTask.title })).toHaveCount(1);
  const taskRow = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: rowTask.title }) });
  const compactHeight = (await taskRow.boundingBox())!.height;
  await page.getByRole('combobox', { name: 'Density', exact: true }).selectOption('comfortable');
  await expect.poll(async () => (await taskRow.boundingBox())!.height).toBeGreaterThan(compactHeight);
  await page.getByRole('combobox', { name: 'Density', exact: true }).selectOption('compact');
  await expect.poll(async () => (await taskRow.boundingBox())!.height).toBe(compactHeight);
  await page.getByRole('combobox', { name: 'Group', exact: true }).selectOption('none');
  await page.getByRole('combobox', { name: 'Priority: ' + rowTask.key, exact: true }).selectOption('urgent');
  await expect(page.getByRole('combobox', { name: 'Priority: ' + rowTask.key, exact: true })).toHaveValue('urgent');
  await page.getByRole('combobox', { name: 'Assignee: ' + rowTask.key, exact: true }).selectOption('m2');
  await page.getByLabel('Due date: ' + rowTask.key, { exact: true }).fill('2026-11-20');
  await page.getByText('Columns', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show column: Start date', exact: true }).check();
  const width = page.getByRole('slider', { name: 'Width: Start date', exact: true });
  await width.focus();
  await width.press('End');
  await page.getByText('Columns', { exact: true }).click();
  await expect.poll(async () => Math.round((await page.getByRole('columnheader', { name: 'Start date', exact: true }).boundingBox())!.width)).toBe(800);
  await page.getByLabel('Start date: ' + rowTask.key, { exact: true }).fill('2026-11-18');
  await page.getByRole('button', { name: 'Rename: ' + rowTask.key, exact: true }).click();
  await page.getByRole('textbox', { name: 'Rename task', exact: true }).fill('Table <literal>');
  await page.getByRole('textbox', { name: 'Rename task', exact: true }).press('Enter');
  await page.getByRole('textbox', { name: 'Search tasks', exact: true }).fill('Table <literal>');
  await expect(page.getByRole('button', { name: 'Table <literal>' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Search tasks', exact: true })).toHaveValue('Table <literal>');
  await expect(page.getByLabel('Start date: ' + rowTask.key, { exact: true })).toHaveValue('2026-11-18');
  await expect(page.getByRole('combobox', { name: 'Assignee: ' + rowTask.key, exact: true })).toHaveValue('m2');
  await page.getByText('Columns', { exact: true }).click();
  await expect(width).toHaveValue('800');
  await page.getByText('Columns', { exact: true }).click();
  await page.getByRole('button', { name: /All tasks 1/ }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: /All tasks 1/ })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: /All tasks 1/ }).click();
  await page.screenshot({ path: '/tmp/task6b1-table-desktop-dark-en.png', fullPage: true });
  await page.getByRole('link', { name: 'List', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search tasks', exact: true })).toHaveValue('');
  await page.getByRole('link', { name: 'Table', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search tasks', exact: true })).toHaveValue('Table <literal>');
  await page.getByLabel('Workspace', { exact: true }).selectOption(data.workspaces[1].id);
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search tasks', exact: true })).toHaveValue('');
  await page.getByLabel('Workspace', { exact: true }).selectOption(data.workspaces[0].id);
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await page.getByRole('link', { name: 'Table', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search tasks', exact: true })).toHaveValue('Table <literal>');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Language', { exact: true }).selectOption('pt-BR');
  await page.getByRole('button', { name: 'Alternar tema' }).click();
  await expect(page.getByRole('button', { name: 'Table <literal>' })).toBeVisible();
  await page.screenshot({ path: '/tmp/task6b1-table-mobile-light-pt.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('board drag preserves manual order and recurring completion, column menus and bulk selection mutate atomically', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const title = 'Recurring board <literal>';
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Due date', { exact: true }).fill('2026-11-20');
  await page.getByRole('combobox', { name: 'Recurrence', exact: true }).selectOption('Weekly');
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Task details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.getByRole('link', { name: 'Board', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search tasks', exact: true }).fill(title);
  const card = page.locator('.task-card').filter({ has: page.getByRole('button', { name: title }) });
  await card.dragTo(page.locator('[data-task-group="progress"]'));
  await expect(page.locator('[data-task-group="progress"]').getByRole('button', { name: title })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-task-group="progress"]').getByRole('button', { name: title })).toBeVisible();
  await card.dragTo(page.locator('[data-task-group="done"]'));
  await expect(page.locator('[data-task-group="done"]').getByRole('button', { name: title })).toBeVisible();
  await expect(page.locator('[data-task-group="todo"]').getByRole('button', { name: title })).toBeVisible();
  await page.locator('[data-task-group="todo"]').getByRole('button', { name: title }).click();
  await expect(page.getByLabel('Due date', { exact: true })).toHaveValue('2026-11-27');
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  const todo = page.locator('[data-task-group="todo"]');
  await todo.getByLabel('Column options: To do', { exact: true }).click();
  await todo.getByRole('button', { name: 'Complete column', exact: true }).click();
  await expect(todo.getByRole('button', { name: title })).toHaveCount(1); // recurring completion creates the next instance
  await page.getByRole('checkbox', { name: 'Select all visible tasks', exact: true }).check();
  await page.getByRole('combobox', { name: 'Bulk priority', exact: true }).selectOption('high');
  await expect(page.getByRole('combobox', { name: 'Bulk priority', exact: true })).toHaveCount(0);
  await page.reload();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!)
        .records.w1.data.tasks.filter((t: { title: string; priority: string }) => t.title === 'Recurring board <literal>')
        .every((t: { priority: string }) => t.priority === 'high'),
    ),
  ).toBe(true);
});
test('bulk bounds expose all 101 selected and never apply a partial mutation', async ({ page }) => {
  const many = structuredClone(data);
  many.tasks = Array.from({ length: 101 }, (_, i) => ({
    ...data.tasks[0],
    id: `bound-${i}`,
    key: `BOUND-${i}`,
    title: `Bound ${i}`,
    status: 'todo',
    subtasks: [],
    deps: [],
    attachments: [],
  }));
  await page.addInitScript(value => {
    localStorage.setItem('gr8r.v2', JSON.stringify({ data: value, prefs: { lang: 'en' } }));
  }, many);
  await page.goto('/app-local/w/w1/tasks');
  await page.getByRole('checkbox', { name: 'Select all visible tasks', exact: true }).check();
  await expect(page.getByRole('alert')).toContainText('More than 100 tasks selected');
  await expect(page.getByRole('combobox', { name: 'Bulk priority', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.revision)).toBe(0);
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select: Bound 0', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Select: Bound 100', exact: true }).check();
  await page.getByRole('combobox', { name: 'Bulk priority', exact: true }).selectOption('urgent');
  await expect(page.getByRole('combobox', { name: 'Priority: BOUND-100', exact: true })).toHaveValue('urgent');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Priority: BOUND-0', exact: true })).toHaveValue('urgent');
});
test('dirty move duplicate archive require save and preserve saved fields', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const initial = data.tasks.find(task => task.status !== 'done')!;
  await page.getByRole('button', { name: initial.title }).click();
  let archivedURL = '';
  for (const action of ['Move task', 'Duplicate task', 'Archive task']) {
    const beforeTask = new URL(page.url()).searchParams.get('task');
    if (action === 'Archive task') archivedURL = page.url();
    await page.getByRole('textbox', { name: 'Description', exact: true }).fill(action + ' description');
    if (action === 'Move task') await page.getByRole('combobox', { name: 'Destination project', exact: true }).selectOption('p2');
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Save changes before this action');
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: action, exact: true }).click();
    if (action === 'Duplicate task') {
      await expect.poll(() => new URL(page.url()).searchParams.get('task')).not.toBe(beforeTask);
      await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue(initial.status);
    }
    if (action !== 'Archive task') {
      await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue(action + ' description');
      await page.reload();
      await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue(action + ' description');
    }
  }
  await expect(page.getByRole('heading', { name: 'Task details', exact: true })).toHaveCount(0);
  const archived = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.tasks.filter(
      (t: { archived: boolean; desc: string }) => t.archived && t.desc === 'Archive task description',
    ),
  );
  expect(archived).toHaveLength(1);
  await page.goto(archivedURL);
  await page.getByRole('button', { name: 'Restore task', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Task details', exact: true })).toHaveCount(0);
  await page.reload();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.tasks.filter(
        (t: { archived: boolean; desc: string }) => t.archived && t.desc === 'Archive task description',
      ),
    ),
  ).toHaveLength(0);
});
test('multivalue filters and negation persist; list drag changes group and keyboard order; related deletion stays atomic', async ({ page }) => {
  const scoped = structuredClone(data);
  scoped.tasks = [
    {
      ...data.tasks[0],
      id: 'filter-a',
      key: 'FILTER-1',
      title: 'Filter alpha',
      status: 'todo',
      priority: 'high',
      order: 1,
      subtasks: [],
      deps: [],
      attachments: [],
    },
    {
      ...data.tasks[0],
      id: 'filter-b',
      key: 'FILTER-2',
      title: 'Filter beta',
      status: 'review',
      priority: 'high',
      order: 2,
      subtasks: [],
      deps: ['filter-a'],
      attachments: [],
    },
    {
      ...data.tasks[0],
      id: 'filter-c',
      key: 'FILTER-3',
      title: 'Filter gamma',
      status: 'todo',
      priority: 'low',
      order: 3,
      subtasks: [],
      deps: [],
      attachments: [],
    },
  ];
  await page.addInitScript(value => {
    if (!localStorage.getItem('gr8r.v2')) localStorage.setItem('gr8r.v2', JSON.stringify({ data: value, prefs: { lang: 'en' } }));
  }, scoped);
  await page.goto('/app-local/w/w1/tasks');
  await page.getByText('Filters (0)', { exact: true }).click();
  await page.getByRole('button', { name: 'Add filter', exact: true }).click();
  await page.getByRole('checkbox', { name: 'To do', exact: true }).check();
  await page.getByRole('checkbox', { name: 'In review', exact: true }).check();
  await page.getByRole('button', { name: 'Add filter', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filter field 2', exact: true }).selectOption('priority');
  await page.getByRole('checkbox', { name: 'High', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Filter alpha' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filter beta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filter gamma' })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Filter operator 1', exact: true }).selectOption('not');
  await expect(page.getByRole('button', { name: 'Filter alpha' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'In review', exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'Filter beta' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Filter beta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filter alpha' })).toHaveCount(0);
  await page.getByText('Filters (2)', { exact: true }).click();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByRole('combobox', { name: 'Group', exact: true }).selectOption('priority');
  const alpha = page.getByRole('button', { name: 'Drag task: FILTER-1', exact: true });
  await alpha.dragTo(page.locator('[data-task-group="low"] .task-group-heading'));
  await expect(page.locator('[data-task-group="low"]').getByRole('button', { name: 'Filter alpha' })).toBeVisible();
  await page.getByRole('button', { name: 'Move up: FILTER-1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Move up: FILTER-1', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Select: Filter alpha', exact: true }).check();
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('unlink dependencies');
  await expect(page.getByRole('button', { name: 'Filter alpha' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filter beta' })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-task-group="low"]').getByRole('button', { name: 'Filter alpha' })).toBeVisible();
});
test('a native task drag cannot mutate an identical ID after changing workspace', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const initial = data.tasks.find(task => task.status !== 'done')!;
  // Fixture preparation only: both workspaces deliberately contain the same text ID.
  await page.evaluate(
    ({ task, project }) => {
      const state = JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!);
      state.records.w2.data.projects = [project];
      state.records.w2.data.tasks = [{ ...task, title: 'Other workspace task', status: 'todo', subtasks: [], deps: [], attachments: [] }];
      localStorage.setItem('gr8r.workspaces.v1', JSON.stringify(state));
    },
    { task: initial, project: data.projects.find(p => p.id === initial.project)! },
  );
  const events: { type: string; scope: string }[] = [];
  page.on('console', message => {
    if (message.text().startsWith('task6b1-drag:')) events.push(JSON.parse(message.text().slice('task6b1-drag:'.length)));
  });
  await page.evaluate(() => {
    for (const type of ['dragstart', 'drop'])
      document.addEventListener(
        type,
        event => {
          const data = (event as DragEvent).dataTransfer?.getData('application/x-gr8r-task');
          if (data) {
            const payload = JSON.parse(data);
            console.debug('task6b1-drag:' + JSON.stringify({ type, scope: payload.scope }));
          }
        },
        type === 'drop',
      );
  });
  const handle = page.getByRole('button', { name: 'Drag task: ' + initial.key, exact: true });
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 18, box.y + box.height / 2 + 10, { steps: 5 });
  await expect.poll(() => events.filter(e => e.type === 'dragstart').length).toBe(1);
  await page.getByRole('combobox', { name: 'Workspace', exact: true }).selectOption('w2');
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole('button', { name: 'Other workspace task', exact: true }).first().hover();
  await page.mouse.up();
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Status: ' + initial.key, exact: true })).toHaveValue('todo');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w2.revision)).toBe(0);
  if (!events.some(e => e.type === 'drop'))
    test.info().annotations.push({
      type: 'native-drag-cancel',
      description: 'Chromium cancelled the drag when the old source was unmounted; the model separately proves rejection of the old repository nonce.',
    });
  else expect(events.find(e => e.type === 'drop')!.scope).toBe(events.find(e => e.type === 'dragstart')!.scope);
  await test.info().attach('native-drag-evidence', {
    body: JSON.stringify({
      dragStarts: events.filter(e => e.type === 'dragstart').length,
      drops: events.filter(e => e.type === 'drop').length,
      unchangedOtherWorkspaceRevision: 0,
    }),
    contentType: 'application/json',
  });
});
test('task context menu supports right click, keyboard focus and guarded core actions', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const initial = data.tasks.find(task => task.status !== 'done')!;
  const trigger = page.getByRole('button', { name: initial.title });
  await trigger.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Task actions', exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Open task', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Complete task', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Delete task…', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem', { name: 'Open task', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.press('Shift+F10');
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Status: ' + initial.key, exact: true })).toHaveValue('done');
  await page.getByRole('button', { name: 'Task actions: ' + initial.key, exact: true }).click();
  await menu.getByRole('menuitem', { name: 'Duplicate task', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Task details', exact: true })).toBeVisible();
  const cloneId = new URL(page.url()).searchParams.get('task');
  expect(cloneId).not.toBe(initial.id);
  await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('done');
  const cloneKey = await page.locator('.drawer-eyebrow').textContent();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.getByRole('button', { name: 'Task actions: ' + cloneKey, exact: true }).click();
  await menu.getByRole('menuitem', { name: 'Delete task…', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Task actions: ' + cloneKey, exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Task actions: ' + cloneKey, exact: true }).click();
  await menu.getByRole('menuitem', { name: 'Delete task…', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Task actions: ' + cloneKey, exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Status: ' + initial.key, exact: true })).toHaveValue('done');
  await page.getByRole('link', { name: 'Board', exact: true }).click();
  const card = page.locator('.task-card').filter({ has: page.getByRole('button', { name: initial.title }) });
  await card.click({ button: 'right', position: { x: 5, y: 5 } });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card.getByRole('button', { name: 'Task actions: ' + initial.key, exact: true })).toBeFocused();
});
test('task context menu is invalidated across workspaces even when text IDs match', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const initial = data.tasks.find(task => task.status !== 'done')!;
  await page.evaluate(
    ({ task, project }) => {
      const state = JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!);
      state.records.w2.data.projects = [project];
      state.records.w2.data.tasks = [{ ...task, title: 'Menu in another workspace', status: 'todo', subtasks: [], deps: [], attachments: [] }];
      localStorage.setItem('gr8r.workspaces.v1', JSON.stringify(state));
    },
    { task: initial, project: data.projects.find(p => p.id === initial.project)! },
  );
  await page.getByRole('button', { name: initial.title }).click({ button: 'right' });
  await expect(page.getByRole('menu', { name: 'Task actions', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Workspace', exact: true }).selectOption('w2');
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Menu in another workspace' })).toBeVisible();
  await expect(page.getByRole('menu', { name: 'Task actions', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Menu in another workspace' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Complete task', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Status: ' + initial.key, exact: true })).toHaveValue('done');
  const records = await page.evaluate(id => {
    const state = JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!);
    return {
      first: state.records.w1.data.tasks.find((t: { id: string }) => t.id === id).status,
      second: state.records.w2.data.tasks.find((t: { id: string }) => t.id === id).status,
    };
  }, initial.id);
  expect(records).toEqual({ first: initial.status, second: 'done' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('pt-BR');
  await page.getByRole('button', { name: 'Alternar tema' }).click();
  await page.getByRole('button', { name: 'Ações da tarefa: ' + initial.key, exact: true }).click();
  const mobileMenu = page.getByRole('menu', { name: 'Ações da tarefa', exact: true });
  await expect(mobileMenu).toBeVisible();
  const rect = (await mobileMenu.boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '/tmp/task6b1-context-mobile-light-pt.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Ações da tarefa: ' + initial.key, exact: true })).toBeFocused();
});
test.describe('local calendar boundary', () => {
  test.use({ timezoneId: 'America/Maceio' });
  test('Today composer uses the actual local day at 22:30 and preserves it after reload', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-20T22:30:00-03:00'));
    await prepare(page);
    await page.addInitScript(() => {
      const legacy = JSON.parse(localStorage.getItem('gr8r.v2')!);
      legacy.data.tasks[0] = { ...legacy.data.tasks[0], title: 'Calendar today seed', due: '2026-10-20', status: 'todo' };
      legacy.data.tasks[1] = { ...legacy.data.tasks[1], title: 'Calendar next day seed', due: '2026-10-21', status: 'todo' };
      localStorage.setItem('gr8r.v2', JSON.stringify(legacy));
    });
    await page.goto('/app-local/w/w1/tasks');
    await page.getByRole('combobox', { name: 'Group', exact: true }).selectOption('due');
    const today = page.locator('[data-task-group="today"]');
    await today.getByRole('combobox', { name: 'New task project: today', exact: true }).selectOption('p1');
    await today.getByRole('textbox', { name: 'New task in group: today', exact: true }).fill('Created on local Today');
    await today.getByRole('button', { name: 'Add to group: today', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Created on local Today' })).toBeVisible();
    const due = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!);
      return state.records.w1.data.tasks.find((task: { title: string }) => task.title === 'Created on local Today').due;
    });
    expect(due).toBe('2026-10-20');
    await expect(today.getByRole('button', { name: 'Calendar today seed' })).toBeVisible();
    await expect(today.getByRole('button', { name: 'Calendar next day seed' })).toHaveCount(0);
    await page.reload();
    await expect(today.getByRole('button', { name: 'Created on local Today' })).toBeVisible();
    await page.getByRole('button', { name: 'Created on local Today' }).click();
    await expect(page.getByLabel('Due date', { exact: true })).toHaveValue('2026-10-20');
  });
});
test('failed task view preferences show an explicit retry and retain stored bytes and unknown metadata', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  await expect(page.getByRole('textbox', { name: 'Search tasks', exact: true })).toBeVisible();
  const stored = await page.evaluate(title => {
    const key = 'gr8r.preferences.local';
    const personal = JSON.parse(localStorage.getItem(key)!);
    personal.unknown = { literal: '<preserved>', nested: [17] };
    personal.views.w1['tasks:table'] = { q: title, unknownView: ['keep'] };
    const repaired = JSON.stringify(personal);
    const broken = repaired + ' invalid-tail';
    localStorage.setItem(key, broken);
    return { repaired, broken };
  }, firstTitle);
  await page.getByRole('link', { name: 'Table', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Could not load view preferences. Your stored data was kept. Try again.');
  const retry = page.getByRole('button', { name: 'Try again', exact: true });
  await expect(retry).toBeEnabled();
  await expect(page.getByText('Loading view...', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('gr8r.preferences.local'))).toBe(stored.broken);
  await retry.click();
  await expect(retry).toBeEnabled();
  await expect(page.getByRole('textbox', { name: 'Search tasks', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('gr8r.preferences.local'))).toBe(stored.broken);
  await page.evaluate(raw => localStorage.setItem('gr8r.preferences.local', raw), stored.repaired);
  await retry.click();
  await expect(page.getByRole('textbox', { name: 'Search tasks', exact: true })).toHaveValue(firstTitle);
  await expect(page.getByRole('button', { name: firstTitle })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('gr8r.preferences.local'))).toBe(stored.repaired);
  await page.getByRole('textbox', { name: 'Search tasks', exact: true }).fill('');
  const metadata = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('gr8r.preferences.local')!);
    return { unknown: saved.unknown, unknownView: saved.views.w1['tasks:table'].unknownView };
  });
  expect(metadata).toEqual({ unknown: { literal: '<preserved>', nested: [17] }, unknownView: ['keep'] });
});
test('group composer creates in the hydrated default project and preserves an explicit valid choice', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const group = page.locator('[data-task-group="todo"]');
  await expect(group.getByRole('combobox', { name: 'New task project: todo', exact: true })).toHaveValue('p1');
  await group.getByRole('textbox', { name: 'New task in group: todo', exact: true }).fill('Created with hydrated project');
  await group.getByRole('button', { name: 'Add to group: todo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Created with hydrated project' })).toBeVisible();
  await group.getByRole('combobox', { name: 'New task project: todo', exact: true }).selectOption('p2');
  await group.getByRole('textbox', { name: 'New task in group: todo', exact: true }).fill('Created with explicit project');
  await group.getByRole('button', { name: 'Add to group: todo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Created with explicit project' })).toBeVisible();
  const projects = await page.evaluate(() => {
    const tasks = JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.tasks;
    return ['Created with hydrated project', 'Created with explicit project'].map(
      title => tasks.find((task: { title: string }) => task.title === title).project,
    );
  });
  expect(projects).toEqual(['p1', 'p2']);
  await expect(group.getByRole('combobox', { name: 'New task project: todo', exact: true })).toHaveValue('p2');
});

test('task details compose labels, subtask promotion, metadata, discussion and personal actions', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await prepare(page);
  await page.goto('/app-local/w/' + data.workspaces[0].id + '/tasks');
  await page.getByRole('button', { name: firstTitle }).click();
  await expect(page.getByRole('heading', { name: 'Labels', exact: true })).toBeVisible();
  await page.getByLabel('New label', { exact: true }).fill('Details <literal>');
  await page.getByRole('button', { name: 'Create and apply label', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Label: Details <literal>', { exact: true })).toBeChecked();
  await page.getByLabel('Description', { exact: true }).fill('Dirty description');
  await page.getByLabel('New subtask', { exact: true }).fill('Promote detail');
  await page.getByRole('button', { name: 'Add subtask', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Save changes before');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Add subtask', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Add subtask', exact: true }).click();
  await expect(page.getByLabel('New subtask', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Subtask details: Promote detail', exact: true }).click();
  await page.getByLabel('Subtask notes', { exact: true }).fill('Promoted notes');
  await page.getByLabel('Subtask due date', { exact: true }).fill('2026-10-25');
  await page.getByRole('button', { name: 'Save subtask', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save subtask', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Convert to task', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Convert to task', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.tasks.filter((task: { title: string }) => task.title === 'Promote detail')
            .length,
      ),
    )
    .toBe(1);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Promote detail');
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Promoted notes');
  await expect(page.getByLabel('Due date', { exact: true })).toHaveValue('2026-10-25');
  await page.getByLabel('Metadata name', { exact: true }).fill('Only metadata.pdf');
  await page.getByRole('button', { name: 'Add metadata', exact: true }).click();
  await expect(page.getByText('Only metadata.pdf', { exact: true })).toBeVisible();
  await page.getByText('View metadata: Only metadata.pdf', { exact: true }).click();
  await expect(page.getByText('No file content is stored here.', { exact: true })).toBeVisible();
  await page.getByRole('heading', { name: 'Attachments', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/task6b2-metadata-preview.png', fullPage: false });
  await page.getByLabel('Comment', { exact: true }).fill('Hello @');
  await page.getByRole('button', { name: 'Mention: ' + data.members[0].name, exact: true }).click();
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  const comment = page.locator('article.comment').filter({ hasText: 'Hello @' });
  await expect(comment).toBeVisible();
  await comment.getByRole('button', { name: 'React: 👍', exact: true }).click();
  await expect(comment.getByRole('button', { name: 'React: 👍', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Add to favorites', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove from favorites', exact: true })).toBeVisible();
  await expect(page.getByText('Only metadata.pdf', { exact: true })).toBeVisible();
  await page.locator('article.comment').filter({ hasText: 'Hello @' }).getByRole('button', { name: 'Delete comment', exact: true }).click();
  await expect(page.locator('article.comment').filter({ hasText: 'Hello @' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Activity', exact: true }).click();
  await expect(page.locator('.activity-feed')).toContainText('created the task');
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(page.url());
  await page.screenshot({ path: '/tmp/task6b2-local-details.png', fullPage: false });
});

test('subtask draft blocks drawer close and relation edits until explicitly saved', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const parent = data.tasks.find(task => task.subtasks.length > 0)!;
  await page.getByRole('button', { name: parent.title }).click();
  await page.getByRole('button', { name: 'Subtask details: ' + parent.subtasks[0].title, exact: true }).click();
  await page.getByLabel('Subtask notes', { exact: true }).fill('Unsaved child notes');
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(page.getByLabel('Subtask notes', { exact: true })).toHaveValue('Unsaved child notes');
  await expect(page.getByRole('alert')).toContainText('Save subtask');
  await page.getByRole('button', { name: 'Save subtask', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Convert to task', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: parent.title }).click();
  await page.getByRole('button', { name: 'Subtask details: ' + parent.subtasks[0].title, exact: true }).click();
  await expect(page.getByLabel('Subtask notes', { exact: true })).toHaveValue('Unsaved child notes');
});

test('canonical detail controls reject cycles and keep unsafe literal metadata separate from rich content on mobile', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    const saved = JSON.parse(localStorage.getItem('gr8r.v2')!);
    saved.data.tasks[0].title = '<img src=x onerror=alert(1)> literal task';
    saved.data.tasks[0].desc = '<b>Rich safe</b><img src=x onerror="window.detailUnsafe=1"><script>window.detailUnsafe=1</script>';
    saved.data.tasks[0].deps = [];
    saved.data.tasks[1].deps = [saved.data.tasks[0].id];
    saved.data.members[0].name = '<img src=x> literal author';
    saved.data.comments.push({
      id: 'unsafe-comment',
      task: saved.data.tasks[0].id,
      by: saved.data.members[0].id,
      text: '<b>Rich comment</b><img src=x onerror="window.detailUnsafe=1">',
      at: Date.now(),
      re: { '👍': [saved.data.members[0].id] },
    });
    (saved.data.labels ??= []).push({ id: 'literal-label', name: '<img src=x> literal label' });
    localStorage.setItem('gr8r.v2', JSON.stringify(saved));
  });
  await page.goto('/app-local/w/w1/tasks');
  await page.getByRole('button', { name: '<img src=x onerror=alert(1)> literal task' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.locator('.rich-content b').filter({ hasText: 'Rich safe' })).toBeVisible();
  await expect(drawer.locator('[onerror],script')).toHaveCount(0);
  const comment = drawer.locator('article.comment').filter({ hasText: 'Rich comment' });
  await expect(comment.locator('strong')).toHaveText('<img src=x> literal author');
  await expect(comment.getByRole('button', { name: 'React: 👍', exact: true })).toHaveAttribute('title', '<img src=x> literal author');
  await drawer.getByLabel('Label: <img src=x> literal label', { exact: true }).click();
  await expect(drawer.getByLabel('Label: <img src=x> literal label', { exact: true })).toBeChecked();
  await drawer.getByLabel('Add dependency', { exact: true }).selectOption(data.tasks[1].id);
  await drawer.getByRole('button', { name: 'Link task', exact: true }).click();
  await expect(drawer.getByRole('alert')).toBeVisible();
  const deps = await page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.tasks[0].deps);
  expect(deps).toEqual([]);
  await drawer.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.getByRole('link', { name: 'Table', exact: true }).click();
  const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: /literal task/ }) });
  await row.locator('[data-task-column=labels] summary').click();
  await expect(row.getByLabel('Label: <img src=x> literal label', { exact: true })).toBeChecked();
  await row.getByLabel('Label: <img src=x> literal label', { exact: true }).click();
  await expect(row.getByLabel('Label: <img src=x> literal label', { exact: true })).not.toBeChecked();
  await page.reload();
  await page.getByRole('button', { name: /literal task/ }).click();
  await expect(page.getByRole('dialog').getByLabel('Label: <img src=x> literal label', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.getByLabel('Language', { exact: true }).selectOption('pt-BR');
  await page.getByRole('button', { name: 'Alternar tema', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /literal task/ }).click();
  await expect(page.getByRole('heading', { name: 'Etiquetas', exact: true })).toBeVisible();
  await page.getByRole('heading', { name: 'Anexos', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/task6b2-mobile-light-pt.png', fullPage: false });
  const bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('detailed table completes subtasks and explicitly links and unlinks canonical dependencies', async ({ page }) => {
  await prepare(page);
  const parent = data.tasks.find(task => task.subtasks.length > 0)!;
  const target = data.tasks.find(task => task.id !== parent.id)!;
  await page.addInitScript(() => {
    const saved = JSON.parse(localStorage.getItem('gr8r.v2')!);
    for (const task of saved.data.tasks) task.deps = [];
    localStorage.setItem('gr8r.v2', JSON.stringify(saved));
  });
  await page.goto('/app-local/w/w1/tasks');
  await page.getByRole('link', { name: 'Table', exact: true }).click();
  const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: parent.title }) });
  await row.locator('[data-task-column=title] summary').click();
  const child = row.getByLabel(parent.subtasks[0].title, { exact: true });
  await child.click();
  await expect(child).toBeChecked({ checked: !parent.subtasks[0].done });
  await page.getByText('Columns', { exact: true }).click();
  await page.getByLabel('Show column: Dependencies', { exact: true }).check();
  await page.getByText('Columns', { exact: true }).click();
  await row.locator('[data-task-column=deps] summary').click();
  const dependency = row.getByLabel(target.title, { exact: true });
  await dependency.click();
  await expect(dependency).toBeChecked();
  await page.reload();
  await row.locator('[data-task-column=deps] summary').click();
  await expect(dependency).toBeChecked();
  await dependency.click();
  await expect(dependency).not.toBeChecked();
  const stored = await page.evaluate(
    id => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.tasks.find((task: { id: string }) => task.id === id),
    parent.id,
  );
  expect(stored.deps).toEqual([]);
  expect(stored.subtasks[0].done).toBe(!parent.subtasks[0].done);
});

test('late personal menu failure cannot publish an error in a different workspace', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: () =>
          new Promise((_, reject) => {
            window.addEventListener('reject-clipboard', () => reject(new Error('clipboard rejected')), { once: true });
          }),
      },
    });
  });
  await page.goto('/app-local/w/w1/tasks');
  await page.getByRole('button', { name: firstTitle }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy link', exact: true }).click();
  await page.getByLabel('Workspace', { exact: true }).selectOption('w2');
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page.locator('.work-breadcrumb')).toContainText('Pessoal');
  await page.evaluate(() => window.dispatchEvent(new Event('reject-clipboard')));
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('remote subtask deletion retains the dirty editor until explicit discard', async ({ page, context }) => {
  test.setTimeout(45000);
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const parent = data.tasks.find(task => task.subtasks.length > 0)!;
  const child = parent.subtasks[0];
  await page.getByRole('button', { name: parent.title }).click();
  await page.getByRole('button', { name: 'Subtask details: ' + child.title, exact: true }).click();
  await page.getByLabel('Subtask title', { exact: true }).fill('Retained remote draft');
  await page.getByLabel('Subtask notes', { exact: true }).fill('Notes kept after another tab deletes the child');
  await page.getByLabel('Subtask due date', { exact: true }).fill('2026-11-12');
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByRole('button', { name: 'Subtask details: ' + child.title, exact: true }).click();
  await other.getByRole('button', { name: 'Delete subtask', exact: true }).click();
  await expect(other.getByRole('button', { name: 'Subtask details: ' + child.title, exact: true })).toHaveCount(0);
  await page.bringToFront();
  await expect(page.getByRole('button', { name: 'Subtask details: ' + child.title, exact: true })).toHaveCount(0, { timeout: 18000 });
  await expect(page.getByLabel('Subtask notes', { exact: true })).toHaveValue('Notes kept after another tab deletes the child');
  await expect(page.getByLabel('Subtask title', { exact: true })).toHaveValue('Retained remote draft');
  await expect(page.getByLabel('Subtask due date', { exact: true })).toHaveValue('2026-11-12');
  await expect(page.getByRole('alert')).toContainText('This subtask was deleted elsewhere');
  await expect(page.getByRole('button', { name: 'Save subtask', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Convert to task', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(page.getByLabel('Subtask notes', { exact: true })).toHaveValue('Notes kept after another tab deletes the child');
  await page.locator('.subtask-editor').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/task6b2-fix1-deleted-subtask-draft.png', fullPage: false });
  await page.getByRole('button', { name: 'Discard subtask draft', exact: true }).click();
  await expect(page.getByLabel('Subtask notes', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const stored = await page.evaluate(
    id => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.tasks.find((task: { id: string }) => task.id === id).subtasks,
    parent.id,
  );
  expect(stored.some((row: { id: string }) => row.id === child.id)).toBe(false);
  await other.close();
});

test('shared calendar and timeline create on date, preserve duration on native drag and reload', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  const day = await page.locator('[data-calendar-day]').nth(15).getAttribute('data-calendar-day');
  await page
    .locator(`[data-calendar-day="${day}"]`)
    .getByRole('button', { name: /Add task on/ })
    .click();
  await page.getByLabel('Title', { exact: true }).fill('Schedule <literal>');
  await expect(page.getByLabel('Due date', { exact: true })).toHaveValue(day!);
  await page.getByLabel('Start date', { exact: true }).fill(day!);
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  const next = await page.locator('[data-calendar-day]').nth(17).getAttribute('data-calendar-day');
  await page.getByRole('button', { name: 'Schedule <literal>', exact: true }).dragTo(page.locator(`[data-calendar-day="${next}"]`));
  await expect(page.locator(`[data-calendar-day="${next}"]`).getByRole('button', { name: 'Schedule <literal>', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Schedule <literal>', exact: true }).click();
  await expect(page.getByLabel('Due date', { exact: true })).toHaveValue(next!);
  await expect(page.getByLabel('Start date', { exact: true })).toHaveValue(next!);
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(page).toHaveURL(/\/calendar/);
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.locator('[data-calendar-day]')).toHaveCount(7);
  await page.getByRole('link', { name: 'Timeline', exact: true }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  const bar = page.locator('[data-schedule-bar]').filter({ hasText: 'Schedule <literal>' });
  await page.locator('.schedule-timeline').hover();
  await page.mouse.wheel(-10000, 0);
  await expect.poll(() => page.locator('.schedule-timeline').evaluate(node => node.scrollLeft)).toBe(0);
  await bar.scrollIntoViewIfNeeded();
  const bounds = (await bar.boundingBox())!;
  await page.mouse.move(bounds.x + 8, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 72, bounds.y + bounds.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(bar).toHaveAttribute(
    'data-due-date',
    new Date(new Date(next! + 'T12:00:00').setDate(new Date(next! + 'T12:00:00').getDate() + 2)).toLocaleDateString('sv-SE'),
  );
  await page.getByRole('button', { name: 'Months', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Months', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const unchangedDue = await bar.getAttribute('data-due-date');
  for (const group of ['status', 'assignee', 'none', 'project']) {
    await page.getByLabel('Group', { exact: true }).selectOption(group);
    await expect(bar).toHaveAttribute('data-due-date', unchangedDue!);
  }
  await expect(page.locator('.timeline-dependencies path').first()).toBeAttached();
  await expect(page.locator('.timeline-milestone').first()).toBeAttached();
  await page.screenshot({ path: '/tmp/task6b3-timeline-dark.png' });
  await bar.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Open task', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Schedule <literal>');
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(page).toHaveURL(/\/timeline/);
});

test('shared files filter preview rename duplicate unlink delete preserve metadata and scope', async ({ page }) => {
  const fixture = structuredClone(data);
  Object.assign(fixture.files[0], { preservedFileMetadata: { literal: '<unknown>', nested: [3, 'kept'] } });
  await page.addInitScript(value => {
    if (!localStorage.getItem('gr8r.v2')) localStorage.setItem('gr8r.v2', JSON.stringify({ data: value, prefs: { lang: 'en', theme: 'dark' } }));
  }, fixture);
  await page.goto('/app-local/w/w1/tasks');
  await page.getByRole('link', { name: 'Files', exact: true }).click();
  const source = data.files[0];
  await page.getByLabel('Search files', { exact: true }).fill(source.name);
  await page.locator(`[data-file-id="${source.id}"]`).getByRole('button', { name: source.name, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Metadata only');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Link copied');
  expect(new URL(await page.evaluate(() => navigator.clipboard.readText())).searchParams.get('file')).toBe(source.id);
  await page.getByLabel('File name', { exact: true }).fill('<literal> renamed.pdf');
  await page.getByRole('button', { name: 'Rename file', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toContainText('<literal> renamed.pdf');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toContainText('<literal> renamed copy.pdf');
  const clonedMetadata = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.files.find((f: { name: string }) => f.name === '<literal> renamed copy.pdf'),
  );
  expect(clonedMetadata.preservedFileMetadata).toEqual({ literal: '<unknown>', nested: [3, 'kept'] });
  expect(clonedMetadata.by).toBe(data.me);
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.getByLabel('Search files', { exact: true }).fill('<literal>');
  await page.getByLabel('Filter by type', { exact: true }).selectOption('pdf');
  await page.getByLabel('Sort files', { exact: true }).selectOption('name');
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await expect(page.getByRole('button', { name: '<literal> renamed copy.pdf', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Search files', { exact: true })).toHaveValue('<literal>');
  await page.getByRole('button', { name: '<literal> renamed copy.pdf', exact: true }).click();
  await page.getByRole('button', { name: 'Delete file', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page.getByRole('button', { name: '<literal> renamed copy.pdf', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '<literal> renamed.pdf', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '<literal> renamed.pdf', exact: true }).click();
  await expect(page.getByRole('dialog').locator('img')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/task6b3-files-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '<literal> renamed.pdf', exact: true })).toBeFocused();
});

test('calendar overflow event details preferences and files beyond cursor stay literal on mobile', async ({ page }) => {
  const fixture = structuredClone(data),
    today = new Date().toLocaleDateString('sv-SE');
  fixture.tasks = fixture.tasks.slice(0, 4).map((task, index) => ({ ...task, title: `Overflow task ${index}`, due: today }));
  fixture.events = Array.from({ length: 103 }, (_, i) => ({
    id: `ev-${i}`,
    project: 'p1',
    title: i === 102 ? '<unsafe> last event' : `Event ${i}`,
    date: today,
    time: '09:30',
  }));
  fixture.files = Array.from({ length: 103 }, (_, i) => ({
    id: `file-${i}`,
    project: 'p1',
    name: `File ${String(i).padStart(3, '0')}.pdf`,
    type: 'pdf',
    size: '1 KB',
    by: 'm1',
    at: Date.now() + i,
  }));
  await page.addInitScript(value => {
    if (!localStorage.getItem('gr8r.v2'))
      localStorage.setItem(
        'gr8r.v2',
        JSON.stringify({
          data: value,
          prefs: { lang: 'en', theme: 'light', weekStart: 0, dateFmt: 'yyyy-MM-dd' },
          views: { cal: { q: 'Overflow task', custom: 'keep' } },
        }),
      );
  }, fixture);
  await page.goto('/app-local/w/w1/tasks');
  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  await expect(page.locator('.schedule-weekday').first()).toHaveText('Sun');
  await expect(page.getByLabel('Search tasks', { exact: true })).toHaveValue('Overflow task');
  await page.locator(`[data-calendar-day="${today}"]`).getByRole('button', { name: /more/ }).click();
  await page.getByRole('button', { name: '09:30 <unsafe> last event', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toHaveText('<unsafe> last event');
  await expect(page.getByRole('dialog')).toContainText(today);
  await expect(page.getByRole('dialog').locator('unsafe')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const nextMonth = await page.locator('.schedule-controls h2').textContent();
  await page.reload();
  await expect(page.locator('.schedule-controls h2')).toHaveText(nextMonth!);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('link', { name: 'Files', exact: true }).click();
  await expect(page.locator('[data-file-id]')).toHaveCount(105); // 103 global + two canonical embedded-only records
  await page.getByLabel('Search files', { exact: true }).fill('File 102');
  await page.getByRole('button', { name: 'File 102.pdf', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Language', { exact: true }).selectOption('pt-BR');
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await expect(page.locator('[data-calendar-day]')).toHaveCount(7);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/task6b3-calendar-mobile-pt.png' });
});

test('native schedule drag cannot cross workspace lifetime even with the same task ID', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  const initial = data.tasks.find(task => task.due && task.status !== 'done')!;
  await page.evaluate(
    ({ task, project }) => {
      const state = JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!);
      state.records.w2.data.projects = [project];
      state.records.w2.data.tasks = [{ ...task, title: 'Other schedule', subtasks: [], deps: [], attachments: [] }];
      localStorage.setItem('gr8r.workspaces.v1', JSON.stringify(state));
    },
    { task: initial, project: data.projects.find(p => p.id === initial.project)! },
  );
  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  // The fixture task can lie outside this week; date navigation is through the rendered controls.
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await page.getByLabel('Search tasks', { exact: true }).fill(initial.title);
  const events: { type: string; scope: string }[] = [];
  page.on('console', message => {
    if (message.text().startsWith('schedule-scope:')) events.push(JSON.parse(message.text().slice('schedule-scope:'.length)));
  });
  await page.evaluate(() => {
    for (const type of ['dragstart', 'drop'])
      document.addEventListener(
        type,
        event => {
          const value = (event as DragEvent).dataTransfer?.getData('application/x-gr8r-schedule');
          if (value) console.debug('schedule-scope:' + JSON.stringify({ type, scope: JSON.parse(value).scope }));
        },
        type === 'drop',
      );
  });
  const handle = page.getByRole('button', { name: initial.title, exact: true });
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 18, box.y + box.height / 2 + 10, { steps: 5 });
  await expect.poll(() => events.filter(event => event.type === 'dragstart').length).toBe(1);
  await page.getByRole('combobox', { name: 'Workspace', exact: true }).selectOption('w2');
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole('button', { name: 'Other schedule', exact: true }).first().hover();
  await page.mouse.up();
  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  await expect(page.locator(`[data-calendar-day="${initial.due}"]`).getByRole('button', { name: 'Other schedule', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w2.revision)).toBe(0);
  if (!events.some(event => event.type === 'drop'))
    test
      .info()
      .annotations.push({ type: 'native-drag-cancel', description: 'Chromium cancelled on source unmount; pure helper separately rejects stale scope.' });
  await test.info().attach('schedule-native-scope', { body: JSON.stringify(events), contentType: 'application/json' });
});

test('local file selection simulates metadata atomically and shared surfaces respect project scope', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tasks');
  const base = new URL(page.url()).pathname.replace(/\/tasks$/, '');
  const project = data.projects[0];
  const other = data.tasks.find(task => task.project !== project.id && task.due)!;
  await page.goto(`${base}/calendar?project=${project.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(project.name);
  await expect(page.getByRole('button', { name: other.title, exact: true })).toHaveCount(0);
  await page.goto(`${base}/timeline?project=${project.id}`);
  await expect(page.locator('[data-schedule-bar]').first()).toBeVisible();
  await expect(page.locator(`[data-schedule-bar="${other.id}"]`)).toHaveCount(0);
  await page.goto(`${base}/files?project=${project.id}`);
  const input = page.getByLabel('Select files for metadata simulation', { exact: true });
  await expect(input).toHaveCount(1);
  const before = await page.evaluate(() => localStorage.getItem('gr8r.workspaces.v1'));
  await input.setInputFiles(Array.from({ length: 101 }, (_, i) => ({ name: `Too many ${i}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('x') })));
  await expect(page.getByRole('alert')).toContainText('100');
  expect(await page.evaluate(() => localStorage.getItem('gr8r.workspaces.v1'))).toBe(before);
  await input.setInputFiles([{ name: 'Selected <literal>.pdf', mimeType: 'application/pdf', buffer: Buffer.from('metadata-only') }]);
  await page.getByRole('button', { name: 'Add selected metadata', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Selected <literal>.pdf', exact: true })).toBeVisible();
  await page.reload();
  const stored = await page.evaluate(id => {
    const record = JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records[id].data;
    return { file: record.files.find((file: { name: string }) => file.name === 'Selected <literal>.pdf'), actor: record.me };
  }, data.workspaces[0].id);
  expect(stored.file.project).toBe(project.id);
  expect(stored.file.by).toBe(stored.actor);
  expect(stored.file.size).toBe('13 B');
  await page.getByRole('button', { name: 'Selected <literal>.pdf', exact: true }).click();
  await page.getByLabel('File name', { exact: true }).fill('Scoped renamed.pdf');
  await page.getByRole('button', { name: 'Rename file', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toHaveText('Scoped renamed.pdf');
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['drop'], 'Dropped literal.txt', { type: 'text/plain' }));
    return data;
  });
  await page.locator('[data-metadata-drop]').dispatchEvent('drop', { dataTransfer: transfer });
  await page.getByRole('button', { name: 'Add selected metadata', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dropped literal.txt', exact: true })).toBeVisible();
  await page.goto(`${base}/files?project=${other.project}`);
  await expect(page.getByRole('button', { name: 'Scoped renamed.pdf', exact: true })).toHaveCount(0);
});

for (const panel of ['event', 'overflow', 'overflow event'] as const) {
  test(`calendar ${panel} restores keyboard opener after Escape and close`, async ({ page }) => {
    const fixture = structuredClone(data),
      today = new Date().toLocaleDateString('sv-SE');
    fixture.tasks = [{ ...fixture.tasks[0], title: 'Focus task', due: today }];
    fixture.events = Array.from({ length: 3 }, (_, i) => ({ id: `focus-event-${i}`, project: 'p1', title: `Focus event ${i}`, date: today, time: '09:00' }));
    await page.addInitScript(value => localStorage.setItem('gr8r.v2', JSON.stringify({ data: value, prefs: { lang: 'en', theme: 'light' } })), fixture);
    await page.goto('/app-local/w/w1/tasks');
    await page.getByRole('link', { name: 'Calendar', exact: true }).click();
    const day = page.locator(`[data-calendar-day="${today}"]`);
    const opener =
      panel === 'event' ? day.getByRole('button', { name: '09:00 Focus event 0', exact: true }) : day.getByRole('button', { name: '+1 more', exact: true });
    for (const dismiss of ['Escape', 'close']) {
      await opener.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toBeVisible();
      if (panel === 'overflow event') {
        const nested = page.getByRole('dialog').getByRole('button', { name: '09:00 Focus event 2', exact: true });
        await nested.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toHaveText('Focus event 2');
      }
      if (dismiss === 'Escape') await page.keyboard.press('Escape');
      else {
        await page.getByRole('button', { name: 'Close panel', exact: true }).focus();
        await page.keyboard.press('Enter');
      }
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(opener).toBeFocused();
    }
    if (panel === 'overflow') {
      await page.keyboard.press('Enter');
      const task = page.getByRole('dialog').getByRole('button', { name: 'Focus task', exact: true });
      await task.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toHaveText('Task details');
      await expect(page.getByRole('button', { name: 'Maximize task', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
    }
    if (panel === 'overflow event') {
      await opener.press('Enter');
      await page.getByRole('dialog').getByRole('button', { name: '09:00 Focus event 2', exact: true }).press('Enter');
      await page.getByRole('button', { name: 'Open project', exact: true }).press('Enter');
      // Implicit entry uses the current default tab; explicit/preferences overrides are covered below.
      await expect(page).toHaveURL(/\/project\?project=p1&tab=board/);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });
}

test('project workflows templates eight tabs saved views and keyboard persist locally', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks');
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  const opener = page.getByRole('button', { name: 'New project', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Template', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByLabel('Name', { exact: true }).fill('Home <project>');
  await page.getByLabel('Description', { exact: true }).fill('<img src=x onerror=alert(1)> literal project');
  await page.getByRole('combobox', { name: 'Template', exact: true }).selectOption('software');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home <project>', exact: true })).toBeVisible();
  for (const tab of ['Overview', 'Board', 'List', 'Table', 'Calendar', 'Timeline', 'Files', 'Activity']) {
    await page.getByRole('link', { name: tab, exact: true }).last().click();
    await expect(page.locator('.project-tabs [aria-current="page"]')).toHaveText(tab);
  }
  await page.getByRole('navigation', { name: 'Project tabs' }).getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('<img src=x onerror=alert(1)> literal project', { exact: true })).toBeVisible();
  await expect(page.locator('.project-overview img')).toHaveCount(0);
  await page.getByRole('link', { name: 'List', exact: true }).click();
  await expect(page.getByRole('button', { name: /HOM-1 Technical spec/ })).toBeVisible();
  await page.locator('.view-options summary').filter({ hasText: 'Filters' }).click();
  await page.getByRole('button', { name: 'Add filter', exact: true }).click();
  await page.getByLabel('Filter field 1', { exact: true }).selectOption('priority');
  await page.getByRole('group', { name: 'Filter values 1', exact: true }).getByRole('checkbox', { name: 'High', exact: true }).check();
  await page.getByRole('button', { name: 'Save view', exact: true }).click();
  await page.getByLabel('View name', { exact: true }).fill('High <view>');
  await page.getByRole('button', { name: 'Save view', exact: true }).last().click();
  await expect(page.locator('.project-tabs [aria-current="page"]')).toHaveText('High <view>');
  await page.reload();
  await expect(page.getByRole('button', { name: /HOM-1 Technical spec/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /HOM-4 Write tests/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Rename view', exact: true }).click();
  await page.getByLabel('View name', { exact: true }).fill('High renamed');
  await page.getByRole('button', { name: 'Save view', exact: true }).last().click();
  await page.getByRole('button', { name: 'Delete view', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete view', exact: true }).click();
  await expect(page.locator('.project-tabs [aria-current="page"]')).toHaveText('List');
  await page.reload();
  await expect(page.getByRole('link', { name: 'High renamed', exact: true })).toHaveCount(0);
});

async function projectLocalCommand(page: import('@playwright/test').Page, operation: string, input: Record<string, unknown>, version?: number) {
  return page.evaluate(
    async ({ operation, input, version }) => {
      const load = (path: string) => import(path);
      const [{ createLocalRepository }, { createLocalWorkspaceRepository }, { seed }, { emptyWorkspace }] = await Promise.all([
        load('/src/workspace/local.js'),
        load('/src/workspace/local-panel-repository.ts'),
        load('/src/data/seed.js'),
        load('/src/data/workspace.js'),
      ]);
      const persistence = createLocalRepository({ storage: localStorage, seed, blank: emptyWorkspace });
      const repo = createLocalWorkspaceRepository({ persistence, storage: localStorage, workspaceId: 'w1', identity: 'other-client' });
      return repo.command(operation, { input, expectedVersion: version, idempotencyKey: crypto.randomUUID() });
    },
    { operation, input, version },
  );
}
test('project editing members favorites sidebar ordering archive and full graph copies persist', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    if (localStorage.getItem('gr8r.workspaces.v1')) return;
    const raw = JSON.parse(localStorage.getItem('gr8r.v2')!);
    const task = raw.data.tasks[0];
    task.title = 'Graph literal';
    task.status = 'done';
    task.completedAt = Date.parse('2026-10-19T12:00:00Z');
    task.desc = '<b>Graph rich</b><img src=x onerror=alert(1)>';
    task.recur = 'Weekly';
    task.estimate = '3h';
    task.subtasks = [{ id: 'graph-sub', title: 'Done detail', done: true, note: '<b>note</b>', unknown: { kept: [1, 2] } }];
    task.deps = [raw.data.tasks.find((t: { project: string }) => t.project !== task.project).id];
    task.attachments = [{ id: 'graph-file', name: 'Graph <file>.pdf', type: 'pdf', order: 4, unknown: { kept: true } }];
    task.unknown = { literal: '<img>', deep: [5] };
    localStorage.setItem('gr8r.v2', JSON.stringify(raw));
  });
  await page.goto('/app-local/w/w1/project?project=p1&tab=overview');
  await expect(page.getByRole('heading', { name: data.projects[0].name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Team', exact: true })).toHaveValue('design');
  await page.getByLabel('Name', { exact: true }).fill('Project <edited>');
  await page.getByRole('combobox', { name: 'Lead', exact: true }).selectOption('m8');
  await page.getByRole('combobox', { name: 'Team', exact: true }).selectOption('eng');
  await page.getByRole('combobox', { name: 'Icon', exact: true }).selectOption('heart');
  await page.getByRole('combobox', { name: 'Color', exact: true }).selectOption('teal');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Favorite project Project <edited>', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Favorite project Project <edited>', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('combobox', { name: 'Project status', exact: true }).selectOption('risk');
  await page.getByRole('button', { name: /^Members \(/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Local demonstration');
  const memberRow = page.getByRole('dialog').locator('li').filter({ hasText: 'João Pereira' });
  await memberRow.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('combobox', { name: 'Add existing member', exact: true }).selectOption('m3');
  await page.getByLabel('Demo email', { exact: true }).fill('demo-project@example.test');
  await page.getByRole('combobox', { name: 'Local permission', exact: true }).selectOption('Can view');
  await page.getByRole('button', { name: 'Add local invitation', exact: true }).click();
  await expect(page.getByText('demo-project@example.test', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Local general access', exact: true }).selectOption('private');
  await page.keyboard.press('Escape');
  await page.goto(`/app-local/w/w1/project?project=p1&tab=list&task=${firstTask.id}`);
  await expect(page.getByRole('dialog').locator('.rich-content b').filter({ hasText: 'Graph rich' })).toBeVisible();
  await expect(page.getByRole('dialog').locator('[onerror],script')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add to favorites', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate task', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Graph literal (copy)');
  const individual = new URL(page.url()).searchParams.get('task');
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  expect(new URL(page.url()).pathname).toContain('/project');
  expect(new URL(page.url()).searchParams.get('tab')).toBe('list');
  await page.locator('.project-heading .project-options summary').click();
  await page.getByRole('button', { name: 'Duplicate project', exact: true }).click();
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Project <edited> copy', exact: true })).toBeVisible();
  const copyId = new URL(page.url()).searchParams.get('project');
  await page.reload();
  const stored = await page.evaluate(
    ({ copyId, individual, sourceId }) => {
      const d = JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data;
      const prefs = JSON.parse(localStorage.getItem('gr8r.preferences.local')!).preferences.w1;
      return {
        copy: d.projects.find((p: { id: string }) => p.id === copyId),
        source: d.tasks.find((t: { id: string }) => t.id === sourceId),
        individual: d.tasks.find((t: { id: string }) => t.id === individual),
        clones: d.tasks.filter((t: { project: string }) => t.project === copyId),
        prefs,
      };
    },
    { copyId, individual, sourceId: firstTask.id },
  );
  expect(stored.copy.status).toBe('planning');
  expect(stored.copy.members.sort()).toEqual(['m1', 'm8']);
  expect(stored.copy.milestones).toEqual([]);
  expect(stored.prefs.favoriteProjectIds).not.toContain(copyId);
  expect(stored.individual.status).toBe('done');
  expect(stored.individual.completedAt).toBe(stored.source.completedAt);
  expect(stored.prefs.favoriteTaskIds).not.toContain(individual);
  const copied = stored.clones.find((t: { title: string }) => t.title === 'Graph literal');
  expect(copied.status).toBe('todo');
  expect(copied.completedAt ?? null).toBeNull();
  expect(copied.unknown).toEqual(stored.source.unknown);
  expect(copied.subtasks[0].done).toBe(true);
  expect(copied.subtasks[0].id).not.toBe(stored.source.subtasks[0].id);
  expect(copied.subtasks[0].unknown).toEqual(stored.source.subtasks[0].unknown);
  expect(copied.deps).toEqual(stored.source.deps);
  expect(copied.attachments).toEqual(stored.source.attachments);
  expect(stored.prefs.favoriteTaskIds).toContain(copied.id);
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  const card = page.locator(`[data-project-id="${copyId}"]`);
  await card.locator('summary').click();
  await card.getByRole('button', { name: 'Move down in sidebar', exact: true }).click();
  await page.reload();
  const order = await page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.projOrder);
  expect(order[0]).not.toBe(copyId);
  await card.locator('summary').click();
  await card.getByRole('button', { name: 'Archive project', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archive project', exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Archived', exact: true }).check();
  await expect(card).toBeVisible();
  await card.locator('summary').click();
  await card.getByRole('button', { name: 'Restore project', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restore project', exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Archived', exact: true }).uncheck();
  await expect(card).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('pt-BR');
  await page.getByRole('button', { name: /Alternar tema|Toggle theme/ }).click();
  await page.screenshot({ path: '/tmp/task6b4-projects-mobile-pt-light.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('project and saved view conflicts preserve drafts after external update or deletion', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/project?project=p1&tab=overview');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Retained project draft');
  await projectLocalCommand(page, 'update_project', { id: 'p1', name: 'External project' }, 1);
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('draft was kept');
  await page.getByRole('button', { name: 'Check current version', exact: true }).click();
  await page.getByRole('button', { name: 'Use current version and keep draft', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('Retained project draft');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Retained project draft', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'List', exact: true }).click();
  await page.getByRole('button', { name: 'Save view', exact: true }).click();
  await page.getByLabel('View name', { exact: true }).fill('CAS view');
  await page.getByRole('dialog').getByRole('button', { name: 'Save view', exact: true }).click();
  await expect(page.locator('.project-tabs [aria-current]')).toHaveText('CAS view');
  const id = new URL(page.url()).searchParams.get('tab')!.slice(2);
  await page.getByRole('button', { name: 'Rename view', exact: true }).click();
  await page.getByLabel('View name', { exact: true }).fill('Retained view draft');
  await projectLocalCommand(page, 'update_view', { id, name: 'External view' }, 1);
  await page.getByRole('dialog').getByRole('button', { name: 'Save view', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('draft was kept');
  await page.getByRole('button', { name: 'Check current version', exact: true }).click();
  await page.getByRole('button', { name: 'Use current version and keep draft', exact: true }).click();
  await expect(page.getByLabel('View name', { exact: true })).toHaveValue('Retained view draft');
  await projectLocalCommand(page, 'delete_view', { id }, 2);
  await page.getByRole('dialog').getByRole('button', { name: 'Save view', exact: true }).click();
  await page.getByRole('button', { name: 'Check current version', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('view was removed');
  await expect(page.getByLabel('View name', { exact: true })).toHaveValue('Retained view draft');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await expect(page.getByText('View not found.', { exact: true })).toBeVisible();
});

test('project saved imported schedules stay scoped and missing project is safe', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    if (localStorage.getItem('gr8r.workspaces.v1')) return;
    const raw = JSON.parse(localStorage.getItem('gr8r.v2')!);
    raw.data.savedViews = [
      {
        id: 'calendar-import',
        project: 'p1',
        name: 'Calendar imported',
        type: 'calendar',
        filters: [{ f: 'priority', op: 'is', v: ['high'], unknown: { kept: true } }],
      },
      { id: 'timeline-import', project: 'p1', name: 'Timeline imported', type: 'timeline', filters: [] },
    ];
    localStorage.setItem('gr8r.v2', JSON.stringify(raw));
  });
  await page.goto('/app-local/w/w1/project?project=p1&tab=v%3Acalendar-import');
  await expect(page.locator('.project-tabs [aria-current]')).toHaveText('Calendar imported');
  await expect(page.locator('.schedule-view')).toBeVisible();
  await page.getByRole('link', { name: 'Timeline imported', exact: true }).click();
  await expect(page.locator('.schedule-view')).toBeVisible();
  const other = data.tasks.find(task => task.project !== 'p1' && task.due)!;
  await expect(page.locator(`[data-schedule-bar="${other.id}"]`)).toHaveCount(0);
  await page.goto('/app-local/w/w1/project?project=p2&tab=v%3Acalendar-import');
  await expect(page.getByText('View not found.', { exact: true })).toBeVisible();
  await page.goto('/app-local/w/w1/project?project=missing');
  await expect(page.getByRole('heading', { name: 'Project not found', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Browse projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
});

test('project copy atomic limit writes nothing and project deletion keeps live draft', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    if (localStorage.getItem('gr8r.workspaces.v1')) return;
    const raw = JSON.parse(localStorage.getItem('gr8r.v2')!);
    const source = raw.data.tasks[0];
    raw.data.tasks = Array.from({ length: 100 }, (_, i) => ({
      ...source,
      id: `bound-${i}`,
      key: `WEB-${i + 1}`,
      project: 'p1',
      subtasks: [],
      attachments: [],
      deps: [],
      archived: false,
    }));
    raw.data.comments = [];
    localStorage.setItem('gr8r.v2', JSON.stringify(raw));
  });
  await page.goto('/app-local/w/w1/project?project=p1&tab=overview');
  await page.locator('.project-heading .project-options summary').click();
  await page.getByRole('button', { name: 'Duplicate project', exact: true }).click();
  const before = await page.evaluate(() => localStorage.getItem('gr8r.workspaces.v1'));
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('100 changes');
  expect(await page.evaluate(() => localStorage.getItem('gr8r.workspaces.v1'))).toBe(before);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Deleted project draft remains');
  await projectLocalCommand(page, 'delete_project', { id: 'p1' }, 1);
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await page.getByRole('button', { name: 'Check current version', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('project was removed');
  await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('Deleted project draft remains');
  await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeDisabled();
});

test('project overview status navigation activity and personal view keys remain scoped', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/project?project=p1&tab=overview');
  await page.screenshot({ path: '/tmp/task6b4-overview-dark-en.png', fullPage: true });
  const complete = page
    .locator('.project-overview')
    .getByRole('button', { name: /^Complete / })
    .first();
  const taskName = (await complete.getAttribute('aria-label'))!.slice('Complete '.length);
  await complete.click();
  await page
    .locator('.project-overview')
    .getByRole('button', { name: /^Done / })
    .click();
  await expect(page.locator('.project-tabs [aria-current]')).toHaveText('List');
  await expect(page.locator('.view-filter-chips')).toContainText('Done');
  await expect(page.getByRole('button', { name: new RegExp(taskName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Save view', exact: true }).click();
  await page.getByLabel('View name', { exact: true }).fill('Done only');
  await page.getByRole('dialog').getByRole('button', { name: 'Save view', exact: true }).click();
  await expect(page.locator('.project-tabs [aria-current]')).toHaveText('Done only');
  await page.getByLabel('Search tasks', { exact: true }).fill('No matches saved');
  await page.reload();
  await expect(page.getByLabel('Search tasks', { exact: true })).toHaveValue('No matches saved');
  await page.getByRole('link', { name: 'List', exact: true }).click();
  await expect(page.getByLabel('Search tasks', { exact: true })).toHaveValue('');
  await expect(page.locator('.view-filter-chips')).toContainText('Done');
  await page.getByRole('link', { name: 'Activity', exact: true }).last().click();
  await expect(page.locator('.project-activity')).toContainText('completed the task');
  const other = data.tasks.find(task => task.project !== 'p1')!;
  await expect(page.locator('.project-activity').getByRole('button', { name: other.title, exact: true })).toHaveCount(0);
  await page.goto('/app-local/w/w1/project?project=p2&tab=list');
  await expect(page.locator('.view-filter-chips')).toHaveCount(0);
  await expect(page.getByLabel('Search tasks', { exact: true })).toHaveValue('');
  await page.goto('/app-local/w/w1/project?project=p1&tab=overview');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('pt-BR');
  await page.getByRole('button', { name: /Alternar tema|Toggle theme/ }).click();
  expect((await page.locator('.project-heading h1').boundingBox())!.width).toBeGreaterThan(200);
  await page.screenshot({ path: '/tmp/task6b4-overview-mobile-pt.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('project copy personal-save retry retains committed result and prevents a second project', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    const data = JSON.parse(localStorage.getItem('gr8r.v2')!).data;
    localStorage.setItem(
      'gr8r.preferences.local',
      JSON.stringify({
        prefs: { lang: 'en', theme: 'dark' },
        views: {},
        preferences: { w1: { favoriteTaskIds: [data.tasks[0].id], favoriteProjectIds: [], notificationReadStates: {} } },
      }),
    );
  });
  await page.goto('/app-local/w/w1/project?project=p1&tab=overview');
  await page.locator('.project-heading .project-options summary').click();
  await page.getByRole('button', { name: 'Duplicate project', exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'gr8r.preferences.local' && JSON.parse(value).preferences.w1.favoriteTaskIds.length > 1) {
        Storage.prototype.setItem = original;
        throw Error('Simulated personal storage failure');
      }
      return original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toBeDisabled();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.projects.length);
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('heading', { name: data.projects[0].name + ' copy', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.projects.length)).toBe(before);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.preferences.local')!).preferences.w1.favoriteTaskIds.length)).toBe(2);
});

test('project saved board view context menu supports keyboard rename delete and focus', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/project?project=p1&tab=board');
  await page.getByRole('button', { name: 'Save view', exact: true }).click();
  await page.getByLabel('View name', { exact: true }).fill('Board saved');
  await page.getByRole('dialog').getByRole('button', { name: 'Save view', exact: true }).click();
  await expect(page.locator('.project-tabs [aria-current]')).toHaveText('Board saved');
  const tab = page.getByRole('link', { name: 'Board saved', exact: true });
  await tab.focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menuitem', { name: 'Rename view', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(tab).toBeFocused();
  await tab.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename view', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(tab).toBeFocused();
  await tab.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete view', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(tab).toBeFocused();
  await page.getByRole('button', { name: 'Rename view', exact: true }).click();
  await page.getByLabel('View name', { exact: true }).fill('Board renamed');
  await page.getByRole('dialog').getByRole('button', { name: 'Save view', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rename view', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.locator('.project-tabs [aria-current]')).toHaveText('Board renamed');
  await expect(page.locator('.task-board')).toBeVisible();
});

test('project collection table has aligned labeled cells and persists layout', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/projects');
  await page.getByRole('combobox', { name: 'Project layout', exact: true }).selectOption('table');
  const table = page.getByRole('table', { name: 'Project collection' });
  await expect(table.getByRole('columnheader', { name: 'Project', exact: true })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Status', exact: true })).toBeVisible();
  await expect(table.getByRole('row').filter({ hasText: data.projects[0].name }).getByRole('cell')).toHaveCount(6);
  await page.reload();
  await expect(page.getByRole('table', { name: 'Project collection' })).toBeVisible();
});

async function copyRecoveryFixture(page: import('@playwright/test').Page) {
  await prepare(page);
  await page.goto('/app-local/w/w1/projects');
  await expect(page.getByRole('button', { name: 'New project', exact: true })).toBeEnabled();
  await projectLocalCommand(page, 'create_project', { id: 'recovery-project', name: 'Recovery source', key: 'REC', status: 'planning' });
  await projectLocalCommand(page, 'create_task', { id: 'recovery-task', projectId: 'recovery-project', title: 'Recovery task' });
  await projectLocalCommand(page, 'create_task', { id: 'remaining-task', projectId: 'recovery-project', title: 'Remaining task' });
  await page.goto('/app-local/w/w1/project?project=recovery-project&tab=overview');
  await page.locator('.project-heading .project-options summary').click();
  await page.getByRole('button', { name: 'Duplicate project', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Recovery destination');
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Keep this draft');
}
for (const change of ['update', 'delete'] as const) {
  test(`project copy replans after definitive source task ${change} with retained draft`, async ({ page }) => {
    await copyRecoveryFixture(page);
    await projectLocalCommand(page, `${change}_task`, { id: 'recovery-task', ...(change === 'update' ? { title: 'External task update' } : {}) }, 1);
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.projects.length);
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.projects.length)).toBe(before);
    await expect(page.getByRole('button', { name: 'Review current source tasks and keep draft', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Review current source tasks and keep draft', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Recovery destination');
    await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('Keep this draft');
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Recovery destination', exact: true })).toBeVisible();
    const id = new URL(page.url()).searchParams.get('project');
    const rows = await page.evaluate(
      id => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.tasks.filter((task: { project: string }) => task.project === id),
      id,
    );
    expect(rows.map((row: { title: string }) => row.title).sort()).toEqual(
      change === 'update' ? ['External task update', 'Remaining task'] : ['Remaining task'],
    );
    await page.reload();
    await expect(page.getByText('Keep this draft', { exact: true })).toBeVisible();
  });
  test(`project committed copy recovers favorites after source project ${change}`, async ({ page }) => {
    await copyRecoveryFixture(page);
    await page.evaluate(() => {
      const key = 'gr8r.preferences.local',
        personal = JSON.parse(localStorage.getItem(key)!);
      personal.preferences ??= {};
      personal.preferences.w1 ??= { favoriteProjectIds: [], notificationReadStates: {} };
      personal.preferences.w1.favoriteTaskIds = ['recovery-task'];
      localStorage.setItem(key, JSON.stringify(personal));
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'gr8r.preferences.local' && JSON.parse(value).preferences.w1.favoriteTaskIds.length > 1) {
          Storage.prototype.setItem = original;
          throw Error('Simulated personal failure');
        }
        return original.call(this, key, value);
      };
    });
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toBeDisabled();
    const destination = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.projects.find((p: { name: string }) => p.name === 'Recovery destination').id,
    );
    await projectLocalCommand(page, `${change}_project`, { id: 'recovery-project', ...(change === 'update' ? { name: 'Source changed' } : {}) }, 1);
    // Let the real parent snapshot refresh observe deletion/update while the committed sheet remains mounted.
    await page.getByRole('button', { name: 'Check current version', exact: true }).click();
    if (change === 'delete') await expect(page.locator('main h1')).toHaveText('Project not found');
    else await expect(page.locator('.project-heading h1')).toHaveText('Source changed');
    await expect(page.getByRole('dialog')).toContainText('The project was created');
    await expect(page.getByRole('button', { name: 'Use current version and keep draft', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Recovery destination', exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('project')).toBe(destination);
    const proof = await page.evaluate(() => ({
      data: JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data,
      prefs: JSON.parse(localStorage.getItem('gr8r.preferences.local')!).preferences.w1,
    }));
    expect(proof.data.projects.filter((p: { name: string }) => p.name === 'Recovery destination')).toHaveLength(1);
    expect(proof.prefs.favoriteTaskIds).toContain(
      proof.data.tasks.find((task: { project: string; title: string }) => task.project === destination && task.title === 'Recovery task').id,
    );
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Recovery destination', exact: true })).toBeVisible();
  });
}

async function prepareRemaining(page: import('@playwright/test').Page, route = 'home') {
  await page.addInitScript(value => {
    if (!localStorage.getItem('gr8r.v2'))
      localStorage.setItem(
        'gr8r.v2',
        JSON.stringify({ data: value, prefs: { lang: 'en', theme: 'light', unknown: 'keep', tz: 'Unknown/Preserved' }, collapsed: false }),
      );
  }, data);
  await page.goto('/app-local/w/w1/' + route);
  await expect(page.locator('.work-status')).toContainText('Stored on this device');
  await expect(page.locator('#work-content')).not.toContainText('Loading work...');
}
test('remaining routes teams members profile settings persist and canonical member relation survives reload', async ({ page }) => {
  await prepareRemaining(page, 'teams');
  await page.getByRole('button', { name: 'Create team', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Home <team>');
  await dialog.getByLabel('Description', { exact: true }).fill('Literal description');
  await dialog.getByLabel(data.members[0].name, { exact: true }).check();
  await dialog.getByRole('button', { name: 'Save team', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Home <team>', exact: true }).last()).toBeVisible();
  await page.reload();
  await expect(page.locator('#work-content').getByRole('button', { name: data.members[0].name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit team', exact: true }).click();
  await page.getByRole('dialog').getByLabel(data.members[0].name, { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save team', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#work-content').getByRole('button', { name: data.members[0].name, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit team', exact: true }).click();
  await page.getByRole('button', { name: 'Delete team', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/app-local/w/w1/settings?sec=profile');
  await page.getByLabel('Name', { exact: true }).fill('Literal Home');
  await page.getByLabel('Job title', { exact: true }).fill('Engineer');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('status', { exact: false }).filter({ hasText: 'Saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Literal Home');
  await page.goto('/app-local/w/w1/members');
  await page.getByLabel('Search people').fill('Literal Home');
  await page.locator('#work-content').getByRole('button', { name: 'Literal Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Literal Home', exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Assign task', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Assignee', exact: true })).toHaveValue(data.me);
  await page.getByLabel('Title', { exact: true }).fill('Assigned from profile');
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Task details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.goto('/app-local/w/w1/members');
  await page.getByRole('button', { name: 'Invite member', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Email', { exact: true }).fill('remaining-demo@example.test');
  await page.getByRole('button', { name: 'Create local invitation', exact: true }).click();
  const invited = page.locator('article.panel-row').filter({ hasText: 'remaining-demo@example.test' });
  await expect(invited).toBeVisible();
  await invited.getByRole('combobox', { name: 'Local role', exact: true }).selectOption('Guest');
  await page.reload();
  await expect(invited.getByRole('combobox', { name: 'Local role', exact: true })).toHaveValue('Guest');
  await invited.getByRole('button', { name: 'Resend local invitation', exact: true }).click();
  await invited.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(invited).toHaveCount(0);
  await page.reload();
  await expect(invited).toHaveCount(0);
});
test('remaining routes preferences apply full drawer project defaults Saturday theme and mobile catalogue focus', async ({ page }) => {
  await prepareRemaining(page, 'settings?sec=preferences');
  await page.getByRole('combobox', { name: 'Open tasks in', exact: true }).selectOption('full');
  await page.getByRole('combobox', { name: 'Open on launch', exact: true }).selectOption('inbox');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Open tasks in', exact: true })).toHaveValue('full');
  await page.goto('/app-local/w/w1/settings?sec=projects');
  await page.getByRole('combobox', { name: 'Default project view', exact: true }).selectOption('table');
  await page.locator('.project-nav').first().click();
  await expect(page).toHaveURL(/tab=table/);
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Default tab template');
  await page.getByRole('combobox', { name: 'Template', exact: true }).selectOption('software');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page).toHaveURL(/tab=table/);
  await page.goto('/app-local/w/w1/tasks');
  await page
    .getByRole('button', { name: new RegExp(firstTitle + '$') })
    .first()
    .click();
  await expect(page.locator('.task-full')).toBeVisible();
  await page.getByRole('button', { name: 'Minimize task', exact: true }).click();
  await expect(page.locator('.task-full')).toHaveCount(0);
  await page.getByRole('button', { name: 'Maximize task', exact: true }).click();
  await expect(page.locator('.task-full')).toBeVisible();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await page.goto('/app-local/w/w1/settings?sec=datetime');
  await expect(page.getByRole('combobox', { name: 'Time zone', exact: true })).toHaveValue('Unknown/Preserved');
  await page.getByRole('combobox', { name: 'Week starts on', exact: true }).selectOption('6');
  await page.getByRole('combobox', { name: 'Date format', exact: true }).selectOption('d/M');
  await page.goto('/app-local/w/w1/calendar');
  await expect(page.locator('.schedule-weekday').first()).toContainText(/Sat/);
  await page.goto('/app-local/w/w1/settings?sec=appearance');
  await page.getByRole('combobox', { name: 'Motion', exact: true }).selectOption('reduce');
  await page.getByRole('combobox', { name: 'Sidebar density', exact: true }).selectOption('compact');
  await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('dark');
  await page.getByRole('combobox', { name: 'Accent color', exact: true }).selectOption('teal');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  await expect(page.locator('html')).toHaveAttribute('data-side', 'compact');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app-local/w/w1/system');
  const opener = page.getByRole('button', { name: 'Open sample modal', exact: true });
  await opener.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.screenshot({ path: '/tmp/task6c-system-mobile-dark-en.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/app-local');
  await expect(page).toHaveURL(/\/home$/);
});
test('remaining routes inbox read reply favorites search archive and 404 visible workflows', async ({ page }) => {
  await prepareRemaining(page, 'inbox');
  await page.getByRole('button', { name: /Comments \(/, exact: false }).click();
  await page.getByRole('button', { name: /commented on Solicitações/ }).click();
  await page.getByLabel('Comment', { exact: true }).fill('Unique remaining reply');
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(page.locator('.comment .rich-content').filter({ hasText: 'Unique remaining reply' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark unread', exact: true }).first().click();
  await page.getByLabel(/Unread only/).check();
  await expect(page.getByRole('button', { name: /commented on Solicitações/ })).toBeVisible();
  await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
  await expect(page.getByText('No notifications.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel(/Unread only/).check();
  await expect(page.getByText('No notifications.', { exact: true })).toBeVisible();
  await page.goto('/app-local/w/w1/search');
  await page.getByLabel('Search workspace', { exact: true }).fill('Unique remaining reply');
  await page.getByRole('button', { name: 'Unique remaining reply', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(page).toHaveURL(/\/search$/);
  await page.goto('/app-local/w/w1/tasks');
  await page
    .getByRole('button', { name: new RegExp(firstTitle + '$') })
    .first()
    .click();
  await page
    .getByRole('button', { name: /favorite/i })
    .first()
    .click();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.goto('/app-local/w/w1/favorites');
  await expect(page.getByRole('button', { name: new RegExp(firstTitle + '$') })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(firstTitle + '$') }).click();
  await page.getByRole('button', { name: 'Archive task', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/app-local/w/w1/archive');
  const row = page.locator('.panel-row').filter({ hasText: firstTitle });
  await row.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.panel-row').filter({ hasText: firstTitle })).toHaveCount(0);
  await page.goto('/app-local/w/w1/unknown');
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go to Home', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
});
test('remaining all registered routes plus fallback eight project tabs auth and mobile PT navigation render', async ({ page }) => {
  await prepareRemaining(page);
  const routes = [
    'home',
    'inbox',
    'mytasks',
    'favorites',
    'notifications',
    'search',
    'overview',
    'projects',
    'project?project=p1',
    'tasks',
    'calendar',
    'timeline',
    'members',
    'member?id=m1',
    'teams',
    'team?id=tm1',
    'activity',
    'settings',
    'system',
    'states',
    'archive',
    'unknown',
  ];
  for (const route of routes) {
    await page.goto('/app-local/w/w1/' + route);
    await expect(page.locator('.work-status')).toContainText('Stored on this device');
    await expect(page.locator('#work-content')).not.toContainText('Loading work...');
    await expect(page.locator('#work-content h1')).toBeVisible();
  }
  for (const tab of ['overview', 'board', 'list', 'table', 'calendar', 'timeline', 'files', 'activity']) {
    await page.goto('/app-local/w/w1/project?project=p1&tab=' + tab);
    await expect(page.locator('.project-tabs').getByRole('link', { name: new RegExp('^' + tab + '$', 'i') })).toHaveAttribute('aria-current', 'page');
  }
  await page.goto('/app-local/w/w1/home');
  await page.getByLabel('Language', { exact: true }).selectOption('pt-BR');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/task6c-home-mobile-pt.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Buscar comandos').fill('Equipes');
  await page.getByLabel('Buscar comandos').press('Enter');
  await expect(page).toHaveURL(/\/teams$/);
  await page.goto('/login');
  await expect(page.getByRole('link', { name: /Continue on this device|Continuar neste dispositivo/ })).toBeVisible();
});

test('remaining home and my tasks create complete filters palette scopes and local demo settings preserve workspace', async ({ page }) => {
  await prepareRemaining(page, 'mytasks');
  await page.getByRole('button', { name: 'Add task in this group', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Assignee', exact: true })).toHaveValue(data.me);
  await expect(page.getByLabel('Due date', { exact: true })).not.toHaveValue('');
  await page.getByLabel('Title', { exact: true }).fill('Remaining Today task');
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Task details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(page).toHaveURL(/\/mytasks$/);
  await page.getByRole('textbox', { name: 'New task in group: todo', exact: true }).fill('Inline assigned today');
  await page.getByRole('button', { name: 'Add to group: todo', exact: true }).click();
  await expect(page.getByRole('button', { name: /Inline assigned today$/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /Inline assigned today$/ })).toBeVisible();
  await page.goto('/app-local/w/w1/home');
  const row = page.locator('.panel-row').filter({ hasText: 'Remaining Today task' }).first();
  await row.getByRole('checkbox').click();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: /Completed$/ }).click();
  await expect(page).toHaveURL(/filter=done/);
  await expect(page.getByRole('button', { name: /Remaining Today task$/ })).toBeVisible();
  const opener = page.getByRole('button', { name: 'Open commands', exact: true });
  await opener.click();
  await page.getByLabel('Search commands').press('Tab');
  await page.getByRole('combobox', { name: 'Search category', exact: true }).selectOption('task');
  await page.getByLabel('Search commands').fill('Remaining Today');
  await page.getByLabel('Search commands').press('Enter');
  await expect(page.getByRole('dialog')).toContainText('Task details');
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await opener.click();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await page.goto('/app-local/w/w1/settings?sec=notif-email');
  await page.getByRole('checkbox', { name: 'Daily digest', exact: true }).check();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Daily digest', exact: true })).toBeChecked();
  await page.goto('/app-local/w/w1/settings?sec=2fa');
  await page.getByLabel('Demo code (6 digits)', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Enable demo', exact: true }).click();
  await expect(page.getByText('Enabled in demo', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Enabled in demo', { exact: true })).toBeVisible();
  await page.goto('/app-local/w/w1/settings?sec=plan');
  await page.getByRole('button', { name: 'Business', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Business', exact: true })).toBeDisabled();
  await page.goto('/app-local/w/w1/settings?sec=workspace');
  await page.getByRole('button', { name: 'Reset demo data', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.goto('/app-local/w/w1/search');
  await page.getByLabel('Search workspace').fill('Remaining Today task');
  await expect(page.getByRole('button', { name: 'Remaining Today task', exact: true })).toBeVisible();
});

test('6c fix inbox drafts stay with their task across failed send navigation and mobile Back', async ({ page }) => {
  const fixture = structuredClone(data);
  fixture.notifs = [
    { ...fixture.notifs[0], id: 'draft-notif-a', task: fixture.tasks[0].id, text: 'Conversation A', read: false },
    { ...fixture.notifs[0], id: 'draft-notif-b', task: fixture.tasks[1].id, text: 'Conversation B', read: false },
  ];
  await page.addInitScript(value => {
    if (!localStorage.getItem('gr8r.v2')) localStorage.setItem('gr8r.v2', JSON.stringify({ data: value, prefs: { lang: 'en' } }));
  }, fixture);
  await page.goto('/app-local/w/w1/inbox');
  await page.getByRole('button', { name: /^Conversation A/ }).click();
  const preview = page.getByRole('region', { name: 'Selected conversation' });
  await preview.getByRole('textbox', { name: 'Comment', exact: true }).fill('Draft belongs to A');
  await page.getByRole('button', { name: /^Conversation B/ }).click();
  await expect(preview.getByRole('heading', { name: 'Conversation A', exact: true })).toBeVisible();
  await expect(preview.getByRole('textbox', { name: 'Comment', exact: true })).toHaveValue('Draft belongs to A');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'gr8r.workspaces.v1' && JSON.parse(value).records.w1.data.comments.some((c: { text: string }) => c.text === 'Draft belongs to A')) {
        Storage.prototype.setItem = original;
        throw Error('Simulated write failure');
      }
      return original.call(this, key, value);
    };
  });
  await preview.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(preview.getByRole('textbox', { name: 'Comment', exact: true })).toHaveValue('Draft belongs to A');
  await page.getByRole('button', { name: /^Conversation B/ }).click();
  await expect(preview.getByRole('heading', { name: 'Conversation A', exact: true })).toBeVisible();
  await preview.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(preview.locator('.rich-content').filter({ hasText: 'Draft belongs to A' })).toHaveCount(1);
  await expect(preview.getByRole('textbox', { name: 'Comment', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: /^Conversation B/ }).click();
  await expect(preview.getByRole('textbox', { name: 'Comment', exact: true })).toHaveValue('');
  await preview.getByRole('textbox', { name: 'Comment', exact: true }).fill('Discard only B');
  await preview.getByRole('button', { name: 'Discard reply draft', exact: true }).click();
  await expect(preview.getByRole('textbox', { name: 'Comment', exact: true })).toHaveValue('');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/task6c-fix1-inbox-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await preview.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Conversation A/ })).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.comments.filter((c: { text: string }) => c.text === 'Draft belongs to A'),
  );
  expect(saved).toHaveLength(1);
  expect(saved[0].task).toBe(fixture.tasks[0].id);
});

test.describe('6c fix local calendar boundary', () => {
  test.use({ timezoneId: 'America/Maceio' });
  test('overdue metric opens the same tasks at 22:30 local after UTC midnight', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-20T22:30:00-03:00'));
    const fixture = structuredClone(data);
    fixture.tasks = [
      { ...fixture.tasks[0], id: 'yesterday', title: 'Yesterday overdue', due: '2026-10-19', status: 'todo', subtasks: [], deps: [], attachments: [] },
      { ...fixture.tasks[0], id: 'today', title: 'Due today not overdue', due: '2026-10-20', status: 'todo', subtasks: [], deps: [], attachments: [] },
    ];
    await page.addInitScript(value => {
      if (!localStorage.getItem('gr8r.v2')) localStorage.setItem('gr8r.v2', JSON.stringify({ data: value, prefs: { lang: 'en', tz: 'Unknown/StoreOnly' } }));
    }, fixture);
    await page.goto('/app-local/w/w1/home');
    const overdue = page.getByRole('button', { name: /Overdue$/ });
    await expect(overdue).toContainText('1');
    await overdue.click();
    await expect(page.getByRole('button', { name: /Yesterday overdue$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Due today not overdue$/ })).toHaveCount(0);
  });
});

test('6c fix project creation requests reopen mounted collection and project with dirty guard', async ({ page }) => {
  await prepareRemaining(page, 'projects');
  for (const origin of ['projects', 'project?project=p1&tab=overview']) {
    await page.goto('/app-local/w/w1/' + origin);
    for (let round = 0; round < 2; round++) {
      await page.keyboard.press('p');
      await expect(page.getByRole('dialog').getByLabel('Name', { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await page.keyboard.press('Control+k');
    const search = page.getByRole('textbox', { name: 'Search commands', exact: true });
    await search.fill('Create project');
    // The filtered result and input focus must be committed before keyboard activation.
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Create project', exact: true })).toBeVisible();
    await expect(search).toBeFocused();
    await search.press('Enter');
    await expect(page.getByRole('dialog').getByLabel('Name', { exact: true })).toBeVisible();
    await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Keep mounted draft');
    await page.goBack();
    await expect(page.getByRole('dialog').getByLabel('Name', { exact: true })).toHaveValue('Keep mounted draft');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('6c evidence overview workload and milestone links preserve destination', async ({ page }) => {
  await prepareRemaining(page, 'overview');
  await page.locator('#work-content .panel-row').getByRole('button', { name: data.members[0].name, exact: true }).click();
  await expect(page).toHaveURL(/\/member\?id=m1$/);
  await expect(page.getByRole('heading', { name: data.members[0].name, exact: true, level: 1 })).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: /^Wireframes aprovados/ }).click();
  await expect(page).toHaveURL(/project=p1&tab=timeline/);
  await expect(page.locator('.project-tabs').getByRole('link', { name: 'Timeline', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('6c evidence states controls simulate safely and restore keyboard focus', async ({ page }) => {
  await prepareRemaining(page, 'states');
  const content = page.locator('#work-content');
  const before = await page.evaluate(() => localStorage.getItem('gr8r.workspaces.v1'));
  await content.getByRole('button', { name: 'Simulate offline', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Offline simulation active.');
  await page.getByRole('button', { name: 'Exit simulation', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Simulate loading', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Loading demonstration...' })).toHaveAttribute('aria-busy', 'true');
  await page.getByRole('button', { name: 'Stop loading', exact: true }).click();
  await expect(page.getByText('Loading demonstration...', { exact: true })).toHaveCount(0);
  const modal = page.getByRole('button', { name: 'Open sample modal', exact: true });
  await modal.click();
  await page.getByRole('button', { name: 'Finish example', exact: true }).click();
  await expect(modal).toBeFocused();
  await modal.click();
  await page.keyboard.press('Escape');
  await expect(modal).toBeFocused();
  const confirmation = page.getByRole('button', { name: 'Open confirmation', exact: true });
  await confirmation.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(confirmation).toBeFocused();
  await confirmation.click();
  await page.getByRole('button', { name: 'Confirm example', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Example confirmed.' })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await page.getByRole('button', { name: 'Show message', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Demonstration message.' })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await content.getByRole('button', { name: 'Open commands', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => localStorage.getItem('gr8r.workspaces.v1'))).toBe(before);
  await page.getByRole('button', { name: 'Open 404 example', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go to Home', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test('6c evidence project and task favorites star unstar and survive reload', async ({ page }) => {
  const fixture = structuredClone(data);
  fixture.projects.forEach(project => {
    project.fav = false;
  });
  fixture.tasks.forEach(task => {
    task.fav = false;
  });
  await page.addInitScript(value => {
    if (!localStorage.getItem('gr8r.v2')) localStorage.setItem('gr8r.v2', JSON.stringify({ data: value, prefs: { lang: 'en' } }));
  }, fixture);
  await page.goto('/app-local/w/w1/projects');
  await page.getByRole('button', { name: 'Favorite project ' + fixture.projects[0].name, exact: true }).click();
  await page.goto('/app-local/w/w1/tasks');
  await page.getByRole('button', { name: new RegExp(firstTitle + '$') }).click();
  await page.getByRole('button', { name: 'Add to favorites', exact: true }).click();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.goto('/app-local/w/w1/favorites');
  await page.reload();
  await expect(page.locator('#work-content').getByRole('button', { name: fixture.projects[0].name, exact: true })).toBeVisible();
  await expect(page.locator('#work-content').getByRole('button', { name: firstTitle, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove favorite', exact: true }).click();
  await page.locator('#work-content').getByRole('button', { name: firstTitle, exact: true }).click();
  await page.getByRole('button', { name: 'Remove from favorites', exact: true }).click();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.reload();
  await expect(page.locator('#work-content').getByRole('button', { name: fixture.projects[0].name, exact: true })).toHaveCount(0);
  await expect(page.locator('#work-content').getByRole('button', { name: firstTitle, exact: true })).toHaveCount(0);
});

test('6c evidence activity category and actor filters retain historical literals and localize new events', async ({ page }) => {
  const fixture = structuredClone(data);
  fixture.activity = [
    { ...fixture.activity[0], id: 'history-status', by: 'm1', verb: 'status literal <kept>' },
    { ...fixture.activity[0], id: 'history-comment', by: 'm2', verb: 'comment literal <kept>' },
    { ...fixture.activity[0], id: 'history-project', by: 'm1', verb: 'project literal <kept>' },
  ];
  await page.addInitScript(value => {
    if (!localStorage.getItem('gr8r.v2')) localStorage.setItem('gr8r.v2', JSON.stringify({ data: value, prefs: { lang: 'en' } }));
  }, fixture);
  await page.goto('/app-local/w/w1/settings?sec=workspace');
  await page.getByLabel('Workspace name', { exact: true }).fill('Localized activity');
  await page.getByRole('button', { name: 'Save workspace', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await page.goto('/app-local/w/w1/activity');
  await expect(page.locator('.activity-feed')).toContainText('updated the workspace');
  const rows = page.locator('#work-content .panel-row');
  for (const [value, text] of [
    ['status', 'status literal <kept>'],
    ['comments', 'comment literal <kept>'],
    ['projects', 'project literal <kept>'],
  ]) {
    await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption(value);
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText(text);
  }
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('all');
  await expect(rows).toHaveCount(3);
  await page.getByRole('combobox', { name: 'Person', exact: true }).selectOption('m2');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('comment literal <kept>');
  await page.getByRole('combobox', { name: 'Person', exact: true }).selectOption('');
  await page.getByLabel('Language', { exact: true }).selectOption('pt-BR');
  await expect(page.locator('.activity-feed')).toContainText('alterou o espaço de trabalho');
  await expect(rows.filter({ hasText: 'comment literal <kept>' })).toBeVisible();
  await page.goto('/app-local/w/w1/system');
  await expect(page.getByRole('combobox', { name: 'Tema', exact: true }).locator('option')).toHaveText(['Claro', 'Escuro', 'Sistema']);
});

test('6c fix2 deleted team preserves visible draft through polling and explicit discard releases navigation', async ({ page, context }) => {
  await page.clock.install();
  await prepareRemaining(page, 'teams');
  await projectLocalCommand(page, 'create_team', { id: 'fix2-team', name: 'Removal target' });
  await page.goto('/app-local/w/w1/teams');
  await page.getByRole('button', { name: 'Removal target', exact: true }).click();
  await page.getByRole('button', { name: 'Edit team', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Retained removed team draft');
  await dialog.getByRole('textbox', { name: 'Description', exact: true }).fill('Keep this text until I discard');
  const other = await context.newPage();
  await other.goto('/app-local/w/w1/teams');
  await projectLocalCommand(other, 'delete_team', { id: 'fix2-team' }, 1);
  await page.clock.runFor(10001);
  await expect(page.locator('#work-content').getByText('Page not found', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Retained removed team draft');
  const description = dialog.getByRole('textbox', { name: 'Description', exact: true });
  await expect(description).toHaveValue('Keep this text until I discard');
  await expect(description).toHaveAccessibleName('Description');
  const label = await description.evaluate(element => ({
    markup: element.closest('label')!.outerHTML,
    alerts: element.closest('label')!.querySelectorAll('[role=alert]').length,
  }));
  expect(label.alerts).toBe(0);
  await test.info().attach('removed-team-label-contract', { body: JSON.stringify(label), contentType: 'application/json' });
  await expect(dialog.getByRole('button', { name: 'Save team', exact: true })).toBeDisabled();
  await page.goBack();
  await expect(page).toHaveURL(/\/team\?id=fix2-team$/);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: '/tmp/task6c-fix2-deleted-team.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Discard team draft', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Go to Home', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.teams.some((team: { id: string }) => team.id === 'fix2-team'),
    ),
  ).toBe(false);
  await other.close();
});

test('6c fix2 reset refreshes settings baseline and discovery while external workspace edits still reject stale saves', async ({ page, context }) => {
  await prepareRemaining(page, 'settings?sec=workspace');
  const other = await context.newPage();
  await other.goto('/app-local/w/w1/settings?sec=workspace');
  await other.getByLabel('Workspace name', { exact: true }).fill('Draft opened before reset');
  await page.getByRole('button', { name: 'Reset demo data', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('textbox').fill(data.ws.name);
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await other.getByRole('button', { name: 'Save workspace', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('draft was kept');
  await expect(other.getByLabel('Workspace name', { exact: true })).toHaveValue('Draft opened before reset');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.ws.name)).toBe(data.ws.name);
  await page.getByLabel('Workspace name', { exact: true }).fill('Renamed after reset');
  await page.getByRole('button', { name: 'Save workspace', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Workspace', exact: true }).locator('option:checked')).toHaveText('Renamed after reset');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('Workspace name', { exact: true }).fill('Retained stale workspace draft');
  await other.reload();
  await other.getByLabel('Workspace name', { exact: true }).fill('External winner');
  await other.getByRole('button', { name: 'Save workspace', exact: true }).click();
  await expect(other.getByRole('combobox', { name: 'Workspace', exact: true }).locator('option:checked')).toHaveText('External winner');
  await page.getByRole('button', { name: 'Save workspace', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('draft was kept');
  await expect(page.getByLabel('Workspace name', { exact: true })).toHaveValue('Retained stale workspace draft');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.ws.name)).toBe('External winner');
  await other.close();
});
