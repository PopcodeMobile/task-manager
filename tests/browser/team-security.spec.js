import { test, expect } from '@playwright/test';
import { seed } from '../../src/data/seed.js';
const name = '<img src=x onerror="window.__literalXss=1"> & <team>',
  description = '<script>window.__literalXss=1</script> literal';
async function prepare(page) {
  const data = seed();
  data.files.push({ id: 'literal-file', name, type: 'doc', size: '12 KB', by: data.me, at: Date.now(), project: 'p1' });
  await page.addInitScript(data => {
    if (!localStorage.getItem('gr8r.v2')) localStorage.setItem('gr8r.v2', JSON.stringify({ data, prefs: { lang: 'en' } }));
  }, data);
  await page.goto('/app-local/w/w1/teams');
}
async function textOnly(page) {
  await expect(page.locator('#work-content img, .ui-sheet img, [onerror], [onclick], #work-content script')).toHaveCount(0);
  expect(await page.evaluate(() => window.__literalXss)).toBeUndefined();
}
test('team markup stays literal through editor reload duplicate validation and project team picker', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: 'Create team', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('textbox', { name: 'Description', exact: true }).fill(description);
  await dialog.getByRole('button', { name: 'Save team', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name, exact: true }).last()).toBeVisible();
  const teamUrl = page.url(),
    teamId = new URL(teamUrl).searchParams.get('id');
  await page.reload();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  await textOnly(page);
  await page.getByRole('button', { name: 'Edit team', exact: true }).click();
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(name);
  await expect(dialog.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue(description);
  await page.keyboard.press('Escape');
  for (const route of ['home', 'members', 'teams', 'member?id=m1']) {
    await page.goto('/app-local/w/w1/' + route);
    await expect(page.locator('#work-content h1')).toBeVisible();
    await textOnly(page);
  }
  await page.goto('/app-local/w/w1/teams');
  await page.getByRole('button', { name: 'Create team', exact: true }).click();
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Save team', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(name);
  await page.keyboard.press('Escape');
  await page.goto('/app-local/w/w1/projects');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Team', exact: true }).locator('option').filter({ hasText: name })).toHaveText(name);
  await dialog.getByLabel('Name', { exact: true }).fill('Project ' + name);
  await dialog.getByRole('textbox', { name: 'Description', exact: true }).fill(description);
  await dialog.getByRole('combobox', { name: 'Team', exact: true }).selectOption(teamId);
  await dialog.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Project ' + name, exact: true })).toBeVisible();
  await textOnly(page);
  // Final collapsed navigation is hidden; reopening preserves the literal project label.
  await page.getByRole('button', { name: /sidebar|barra lateral/i }).click();
  await expect(page.locator('.work-sidebar nav')).not.toBeVisible();
  await textOnly(page);
  await page.getByRole('button', { name: /sidebar|barra lateral/i }).click();
  await expect(page.locator('.work-sidebar').getByRole('link', { name: 'Project ' + name, exact: true })).toBeVisible();
  await textOnly(page);
});
test('local profile and attachment metadata remain literal after persistence and preview', async ({ page }) => {
  await prepare(page);
  await page.goto('/app-local/w/w1/settings?sec=profile');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Job title', { exact: true }).fill(description);
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(name);
  await expect(page.getByLabel('Job title', { exact: true })).toHaveValue(description);
  await page.goto('/app-local/w/w1/member?id=m1');
  await expect(page.getByRole('heading', { name, exact: true }).last()).toBeVisible();
  await textOnly(page);
  await page.goto('/app-local/w/w1/members');
  await expect(page.locator('#work-content').getByRole('button', { name, exact: true })).toBeVisible();
  await textOnly(page);
  await page.goto('/app-local/w/w1/files');
  await page.locator('#work-content').getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name, exact: true })).toBeVisible();
  await textOnly(page);
});
