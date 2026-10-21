import { test, expect } from '@playwright/test';
import { seed } from '../../src/data/seed.js';
const data = { ...seed(), preservedGraphMetadata: { literal: '<kept>', nested: ['unknown'] } };
const firstTask = { ...data.tasks[0], preservedTaskMetadata: { original: 'Home <literal>', nested: { value: 17 } } };
data.tasks[0] = firstTask;
const firstTitle = data.tasks[0].title;
async function prepare(page: import('@playwright/test').Page) {
  await page.addInitScript(value => {
    if (!localStorage.getItem('gr8r.v2'))
      localStorage.setItem(
        'gr8r.v2',
        JSON.stringify({
          data: value,
          prefs: { lang: 'en', theme: 'dark', density: 'compact', custom: 'keep' },
          views: { p1: { sort: 'due' } },
          collapsed: true,
        }),
      );
  }, data);
}
test('local entry edits existing browser graph, creates/comments, switches blank workspace and reloads', async ({ page }) => {
  await prepare(page);
  await page.goto('/login');
  await page.getByRole('link', { name: /Continue on this device|Continuar neste dispositivo/ }).click();
  await expect(page.locator('.work-status')).toContainText('Stored on this device');
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
  await expect(page.getByText('No tasks here yet', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.locator('.work-breadcrumb')).toContainText('Local second');
  await expect(page.getByRole('button', { name: 'Local created' })).toHaveCount(0);
  await page.getByLabel('Workspace', { exact: true }).selectOption(data.workspaces[0].id);
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
  await page.goto('/app-local');
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
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('My unsaved draft');
  await page.getByRole('button', { name: 'Reload version and discard draft' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Another tab saved');
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
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
  await prepare(page);
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
  await expect(page.getByRole('button', { name: firstTitle })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.preferences.local')!).views)).toEqual({ [originalId]: { p1: { sort: 'due' } } });
});
test('dirty completion requires explicit save and preserves effective fields after reload', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local');
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
  await page.goto('/app-local');
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
  await expect(page.getByRole('textbox', { name: 'Search tasks', exact: true })).toHaveValue('');
  await page.getByLabel('Workspace', { exact: true }).selectOption(data.workspaces[0].id);
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
  await page.goto('/app-local');
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
  await page.goto('/app-local');
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
  await page.goto('/app-local');
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
      await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('todo');
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
  await page.goto('/app-local');
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
  await page.goto('/app-local');
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
  await expect(page.getByRole('button', { name: 'Other workspace task' })).toBeVisible();
  await page.locator('[data-task-group="progress"] .task-group-heading').hover();
  await page.mouse.up();
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
  await page.goto('/app-local');
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
  await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('todo');
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
  await page.goto('/app-local');
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
    await page.goto('/app-local');
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
  await page.goto('/app-local');
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
  await page.goto('/app-local');
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
  await page.goto('/app-local');
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
  await page.goto('/app-local');
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
  await page.goto('/app-local');
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
  await page.goto('/app-local');
  await page.getByRole('button', { name: firstTitle }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy link', exact: true }).click();
  await page.getByLabel('Workspace', { exact: true }).selectOption('w2');
  await expect(page.locator('.work-breadcrumb')).toContainText('Pessoal');
  await page.evaluate(() => window.dispatchEvent(new Event('reject-clipboard')));
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('remote subtask deletion retains the dirty editor until explicit discard', async ({ page, context }) => {
  test.setTimeout(45000);
  await prepare(page);
  await page.goto('/app-local');
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
