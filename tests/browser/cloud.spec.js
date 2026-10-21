import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

test.describe('final-entry live cloud lifecycle', () => {
  test.skip(!process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, 'Requires private dedicated local Auth/DB credentials.');
  let service, userId, email, password;
  const workspaces = [];
  test.beforeAll(async () => {
    service = createClient(process.env.TEST_SUPABASE_URL, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    email = `cutover-${crypto.randomUUID()}@example.test`;
    password = crypto.randomUUID() + 'Aa1!';
    const result = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(result.error).toBeNull();
    userId = result.data.user.id;
  });
  test.afterAll(async () => {
    // Capture only workspaces owned by this unique fixture, including partial failed flows.
    if (userId) {
      const owned = await service.from('workspace_memberships').select('workspace_id').eq('user_id', userId).eq('role', 'owner');
      expect(owned.error).toBeNull();
      for (const row of owned.data) workspaces.push(row.workspace_id);
      for (const id of new Set(workspaces)) expect((await service.from('workspaces').delete().eq('id', id)).error).toBeNull();
      expect((await service.auth.admin.deleteUser(userId)).error).toBeNull();
    }
  });
  test('root login creates isolated tenant project and task then logout clears rendered tenant', async ({ page }) => {
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.goto('/');
    await page.getByLabel('Idioma', { exact: true }).selectOption('en');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Workspace name').fill('Árvore de teste');
    await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
    await expect(page.locator('.work-status')).toContainText(/Cloud|Saved/);
    await page.getByRole('link', { name: 'Tasks', exact: true }).click();
    await expect(page.getByText('No tasks here yet')).toBeVisible();
    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Cloud project');
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await page.locator('.project-tabs').getByRole('link', { name: 'Board', exact: true }).click();
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Cloud browser task');
    await page.getByRole('button', { name: 'Create task', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Task details', exact: true })).toBeVisible();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Cloud browser task');
    await page.reload();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Cloud browser task');
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.getByText('Cloud browser task', { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.getByText('Cloud browser task', { exact: true })).toHaveCount(0);
    expect(failures).toEqual([]);
  });
  test('pre-auth language survives root document reload', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Idioma', { exact: true }).selectOption('en');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  });
});
