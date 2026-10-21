import { test, expect } from '@playwright/test';
import { seed } from '../../src/data/seed.js';

test('first deep-link settings load reflects stored appearance after workspace discovery', async ({ page }) => {
  await page.addInitScript(data => localStorage.setItem('gr8r.v2', JSON.stringify({ data, prefs: { lang: 'en', theme: 'dark', accent: 'green' } })), seed());
  await page.goto('/app-local/w/w1/settings?sec=appearance');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radiogroup', { name: 'Theme', exact: true }).getByRole('radio', { name: 'Dark', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('radiogroup', { name: 'Accent color', exact: true }).getByRole('radio', { name: 'green', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.reload();
  await expect(page.getByRole('radiogroup', { name: 'Theme', exact: true }).getByRole('radio', { name: 'Dark', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.startsWith('first deep-link settings load')) return;
  const data = seed();
  if (testInfo.title.includes('bounded workspace popup')) {
    data.workspaces.push(...Array.from({ length: 24 }, (_, index) => ({ ...data.workspaces[1], id: `overflow-${index + 1}`, name: `Workspace ${index + 1}` })));
  }
  await page.addInitScript(
    data => localStorage.setItem('gr8r.v2', JSON.stringify({ data, prefs: { lang: 'en', theme: 'light', density: 'comfortable' } })),
    data,
  );
  await page.goto('/app-local');
  await expect(page).toHaveURL(/\/home$/);
});

// Values are taken from pinned upstream shell.css/components.css, not the React implementation.
test('original shell keeps personal navigation above workspace routes and compact topbar actions', async ({ page }) => {
  const sidebar = page.locator('.work-sidebar');
  await expect(sidebar.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  const positions = await sidebar.evaluate(el => {
    const a = [...el.querySelectorAll('a')];
    const y = (name: string) =>
      a
        .find(e => {
          const label = e.cloneNode(true) as HTMLElement;
          label.querySelectorAll('small').forEach(count => count.remove());
          return label.textContent?.trim() === name;
        })
        ?.getBoundingClientRect().y ?? -1;
    return { home: y('Home'), notifications: y('Notifications'), overview: y('Overview'), projects: y('Projects'), tasks: y('Tasks'), settings: y('Settings') };
  });
  expect(positions.projects).toBeGreaterThan(positions.overview);
  expect(positions.projects).toBeLessThan(positions.tasks);
  expect(positions.settings).toBeGreaterThan(positions.tasks);
  const search = page.getByRole('button', { name: 'Search and commands', exact: true });
  await expect(search).toBeVisible();
  expect((await search.boundingBox())!.width).toBe(220);
  expect((await search.boundingBox())!.height).toBe(26);
  await expect(page.getByRole('button', { name: 'Create new', exact: true })).toBeVisible();
  expect((await page.locator('.work-topbar').boundingBox())!.height).toBe(46);
  const status = await page.locator('.work-status').boundingBox();
  expect(status?.height ?? 0).toBeLessThanOrEqual(1);
});

test('compact shared controls preserve project creation, workspace switching and keyboard access', async ({ page }) => {
  await page.getByRole('button', { name: 'Create new', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'New project', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'New project', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const input = page.getByRole('dialog').getByRole('textbox').first();
  expect((await input.boundingBox())!.height).toBe(30);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Search and commands', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Search and commands', exact: true })).toBeFocused();
});

test('auth keeps the original centered narrow card and larger form controls', async ({ page }) => {
  await page.goto('/login');
  const card = page.locator('.auth-card');
  await expect(card).toBeVisible();
  expect((await card.boundingBox())!.width).toBe(380);
  await expect(card.locator('.auth-logo')).toBeVisible();
  expect((await card.getByRole('textbox').first().boundingBox())!.height).toBe(36);
  expect(await card.locator('h1').evaluate(el => getComputedStyle(el).textAlign)).toBe('center');
});

test('shared submit controls keep original compact geometry outside specialized page styles', async ({ page }) => {
  await page.getByRole('button', { name: 'Create new', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Create workspace', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const submit = dialog.getByRole('button', { name: 'Create workspace', exact: true });
  expect((await submit.boundingBox())!.height).toBe(30);
  expect(await submit.evaluate(el => getComputedStyle(el).borderRadius)).toBe('6px');
  expect((await dialog.getByRole('textbox').boundingBox())!.height).toBe(30);
});

test('collapsed Help actions remain fully visible and keyboard dismissible with named navigation', async ({ page }) => {
  await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).click();
  expect((await page.locator('.work-sidebar').boundingBox())!.width).toBe(52);
  await page.getByRole('button', { name: 'Help & resources', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Help & resources' });
  expect((await menu.boundingBox())!.width).toBeGreaterThan(200);
  for (const name of ['Files', 'Agents', 'Integrations']) {
    const item = menu.getByRole('menuitem', { name, exact: true });
    await expect(item).toBeVisible();
    const box = (await item.boundingBox())!;
    expect(
      await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role=menuitem]')?.textContent?.trim(), {
        x: box.x + box.width - 5,
        y: box.y + box.height / 2,
      }),
    ).toBe(name);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Help & resources', exact: true })).toBeFocused();
  await expect(page.locator('.work-sidebar-bottom').getByRole('link', { name: 'Settings', exact: true })).toHaveAccessibleName('Settings');
  for (const team of [{ name: 'Design' }, { name: 'Engineering' }])
    await expect(page.locator('.work-sidebar').getByRole('link', { name: team.name, exact: true })).toHaveAccessibleName(team.name);
});

test('sidebar project children can be expanded and reached with keyboard alone', async ({ page }) => {
  const row = page.locator('.sidebar-project-row').nth(1);
  await row.getByRole('link').focus();
  await expect(row.getByRole('button', { name: /Expand project/ })).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Tab');
  await expect(row.getByRole('button', { name: /Expand project/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(row.locator('..').locator('.project-children').getByRole('link', { name: 'Board', exact: true })).toBeFocused();
});

test('workspace popup performs a real workspace switch and restores its trigger on Escape', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Switch workspace', exact: true });
  await trigger.click();
  await expect(page.getByRole('menu', { name: 'Switch workspace' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('menuitemradio', { name: 'Pessoal', exact: true }).click();
  await expect(page).toHaveURL(/\/w\/w2\/home$/);
  await expect(trigger).toContainText('Pessoal');
});

test('responsive shell retains original 960px sidebar and 390px touch actions', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 900 });
  expect((await page.locator('.work-sidebar').boundingBox())!.width).toBe(252);
  await page.setViewportSize({ width: 390, height: 844 });
  const search = page.getByRole('button', { name: 'Search and commands', exact: true });
  expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  expect(await search.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
  await expect(page.locator('.work-topbar').getByRole('button', { name: 'Account menu', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.locator('.work-sidebar-bottom').getByRole('button', { name: 'Account menu', exact: true }).click();
  await expect(page.getByLabel('Language', { exact: true })).toBeVisible();
});

test('fresh workspace preserves original first-project children and compact segments', async ({ page }) => {
  const first = page.locator('.sidebar-project').first();
  await expect(first.getByRole('link', { name: 'Board', exact: true })).toBeVisible();
  await first.locator('.sidebar-project-row').getByRole('link').focus();
  await expect(first.getByRole('button', { name: /Expand project/ })).toHaveAttribute('aria-expanded', 'true');
  expect((await page.locator('.seg').first().boundingBox())!.height).toBe(28);
  expect((await page.locator('.seg button').first().boundingBox())!.height).toBe(24);
  await expect(page.locator('.work-sidebar').getByRole('link', { name: 'Teams', exact: true })).toHaveCount(0);
});

test('bounded workspace popup scrolls many choices and keeps the last keyboard selection reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 360 });
  const trigger = page.getByRole('button', { name: 'Switch workspace', exact: true });
  await trigger.click();
  const menu = page.getByRole('menu', { name: 'Switch workspace', exact: true });
  const box = (await menu.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(252);
  expect(box.y + box.height).toBeLessThanOrEqual(352);
  await menu.hover();
  await page.mouse.wheel(0, 10000);
  await expect.poll(() => menu.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  const last = menu.getByRole('menuitemradio', { name: 'Workspace 24', exact: true });
  await expect(last).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Invite members', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(last).toBeFocused();
  const itemBox = (await last.boundingBox())!,
    menuBox = (await menu.boundingBox())!;
  expect(itemBox.y).toBeGreaterThanOrEqual(menuBox.y);
  expect(itemBox.y + itemBox.height).toBeLessThanOrEqual(menuBox.y + menuBox.height);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/w\/overflow-24\/home$/);
  await expect(trigger).toContainText('Workspace 24');
});
