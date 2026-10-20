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
