import { test, expect } from '@playwright/test';
import { seed } from '../../src/data/seed.js';
const data = seed();
async function prepare(page, value = data) {
  await page.addInitScript(value => {
    if (!localStorage.getItem('gr8r.v2')) localStorage.setItem('gr8r.v2', JSON.stringify({ data: value, prefs: { lang: 'en', theme: 'system' } }));
  }, value);
  await page.goto('/');
  await page.getByRole('link', { name: /Continue on this device|Continuar neste dispositivo/ }).click();
  await expect(page.locator('.work-status')).toContainText('Stored on this device');
}

test('final entry reaches every named route and eight project views in both locales', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page);
  const routes = [
    'home',
    'overview',
    'mytasks',
    'tasks',
    'inbox',
    'notifications',
    'favorites',
    'projects',
    'project?project=p1',
    'members',
    'member?id=m1',
    'teams',
    'team?id=design',
    'activity',
    'search',
    'calendar',
    'timeline',
    'archive',
    'system',
    'states',
    'settings',
  ];
  expect(routes).toHaveLength(21);
  for (const lang of ['pt-BR', 'en']) {
    await page.locator('#language').selectOption(lang);
    for (const route of routes) {
      await page.goto('/app-local/w/w1/' + route);
      await expect(page.locator('#work-content h1')).toBeVisible();
      await expect(page.locator('#work-content')).not.toContainText(/Page not found|Página não encontrada|Loading work/);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
    }
    for (const tab of ['overview', 'board', 'list', 'table', 'calendar', 'timeline', 'files', 'activity']) {
      await page.goto('/app-local/w/w1/project?project=p1&tab=' + tab);
      await expect(page.locator('.project-tabs a[aria-current="page"]')).toHaveAttribute('href', new RegExp('tab=' + tab));
    }
  }
  await page.goto('/app-local/w/w1/unknown');
  await expect(page.getByText('Page not found', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('language persistence retains literal task titles after create and reload', async ({ page }) => {
  await prepare(page);
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Home');
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Task details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.locator('#language').selectOption('pt-BR');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByRole('button', { name: /Home$/ })).toBeVisible();
});

test('new workspace is empty, selected after reload and isolated from the original workspace', async ({ page }) => {
  await prepare(page);
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  const title = data.tasks[0].title;
  await expect(page.getByRole('button', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Create workspace', exact: true }).last().click();
  await page.getByLabel('Workspace name').fill('Organização B');
  await page.getByRole('dialog').getByRole('button', { name: 'Create workspace', exact: true }).click();
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page.getByText('No tasks here yet')).toBeVisible();
  await page.reload();
  await expect(page.locator('.work-breadcrumb')).toContainText('Organização B');
  await expect(page.getByRole('button', { name: title })).toHaveCount(0);
  await page.getByLabel('Workspace', { exact: true }).selectOption('w1');
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('button', { name: title })).toBeVisible();
});

test('visible rich description retains formatting and strips executable markup', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/tasks?task=' + data.tasks[0].id);
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('<b>Title</b><img src=x onerror=alert(1)><a href="javascript:alert(1)" data-a="delWorkspace">bad</a><script>alert(1)</script>');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await page.reload();
  const rich = page.getByRole('dialog').locator('.rich-content').first();
  await expect(rich.locator('b')).toHaveText('Title');
  await expect(rich.locator('script,img,[onclick],[onerror],[data-a],[href^="javascript:"]')).toHaveCount(0);
});

test('reaction authors remain literal text in the actual task discussion', async ({ page }) => {
  const fixture = structuredClone(data),
    name = '"><img src=x onerror="window.__reactionXss=1">';
  fixture.members[0].name = name;
  fixture.comments = [
    { id: 'literal-comment', task: fixture.tasks[0].id, by: fixture.members[0].id, at: Date.now(), text: 'Hello', re: { '👍': [fixture.members[0].id] } },
  ];
  await prepare(page, fixture);
  await page.goto('/app-local/w/w1/tasks?task=' + fixture.tasks[0].id);
  const comment = page.locator('article.comment').filter({ hasText: 'Hello' });
  await expect(comment).toBeVisible();
  await expect(comment.getByRole('button', { name: 'React: 👍', exact: true })).toHaveAttribute('title', name);
  await expect(comment.locator('img')).toHaveCount(0);
});

// The old cross-workspace project-drag intent is covered by local-panel's real native
// cross-workspace task drag and project sidebar ordering/lifetime tests. No test-only renderer API.
test('foundation token overrides and system theme reach final React controls', async ({ page }) => {
  await prepare(page);
  const result = await page
    .locator('.ui-button')
    .first()
    .evaluate(control => {
      const root = document.documentElement;
      const before = getComputedStyle(control).borderRadius;
      root.style.setProperty('--radius-unit', '4px');
      const after = getComputedStyle(control).borderRadius;
      root.style.removeProperty('--radius-unit');
      return { before, after };
    });
  expect(result.after).not.toBe(result.before);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
