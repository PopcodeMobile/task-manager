import { test, expect, type Page } from '@playwright/test';
import { seed } from '../../src/data/seed.js';

async function open(page: Page, route: string) {
  await page.addInitScript(data => localStorage.setItem('gr8r.v2', JSON.stringify({ data, prefs: { lang: 'en', theme: 'dark' } })), seed());
  await page.goto('/app-local/w/w1/' + route);
}

test('project editor keeps the original side-by-side identity, palette and three-column templates', async ({ page }) => {
  await open(page, 'projects');
  await page.locator('#work-content').getByRole('button', { name: 'New project', exact: true }).click();
  const modal = page.getByRole('dialog');
  const icon = (await modal.locator('.project-name-row > .picon').boundingBox())!;
  const name = (await modal.getByRole('textbox', { name: 'Name', exact: true }).boundingBox())!;
  expect(name.x).toBeGreaterThan(icon.x + icon.width);
  expect(Math.abs(name.y - icon.y)).toBeLessThanOrEqual(3);
  const icons = (await modal.getByRole('radiogroup', { name: 'Icon', exact: true }).boundingBox())!;
  const colors = (await modal.getByRole('radiogroup', { name: 'Color', exact: true }).boundingBox())!;
  expect(colors.x).toBeGreaterThan(icons.x + icons.width);
  const templates = modal.getByRole('radiogroup', { name: 'Template', exact: true }).getByRole('radio');
  expect((await templates.nth(2).boundingBox())!.y).toBe((await templates.nth(0).boundingBox())!.y);
  const footer = (await modal.locator('.modal-f').boundingBox())!;
  const last = (await templates.last().boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(footer.y);
});

test('saved view uses the original compact modal and empty-filter information block', async ({ page }) => {
  await open(page, 'project?project=p1&tab=list');
  await page.getByRole('button', { name: 'Save view', exact: true }).click();
  const modal = page.getByRole('dialog');
  expect((await modal.boundingBox())!.width).toBe(420);
  await expect(modal.locator('.saved-view-no-filters')).toContainText('No filters are active');
  await expect(modal.locator('.saved-view-no-filters svg')).toBeVisible();
});

test('mobile sharing keeps member names beside compact permissions in a bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'project?project=p1&tab=overview');
  await page.locator('.project-members-trigger').click();
  const modal = page.getByRole('dialog');
  const box = (await modal.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(390);
  expect(box.y + box.height).toBe(844);
  const row = modal.locator('.project-members-list li').first();
  const name = (await row.locator('.sharing-person').boundingBox())!;
  const permission = (await row.getByRole('combobox').boundingBox())!;
  expect(name.width).toBeGreaterThan(150);
  expect(permission.x).toBeGreaterThan(name.x);
  expect((await row.boundingBox())!.height).toBe(44);
});

test('mobile project body scrolls every template above the opaque footer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'projects');
  await page.locator('#work-content').getByRole('button', { name: 'New project', exact: true }).click();
  const modal = page.getByRole('dialog');
  const body = modal.locator('.project-editor-scroll');
  const footer = modal.locator('.modal-f');
  expect((await body.boundingBox())!.y + (await body.boundingBox())!.height).toBeLessThanOrEqual((await footer.boundingBox())!.y);
  const last = modal.getByRole('radiogroup', { name: 'Template', exact: true }).getByRole('radio').last();
  await last.click();
  await expect(last).toHaveAttribute('aria-checked', 'true');
  expect((await last.boundingBox())!.y + (await last.boundingBox())!.height).toBeLessThanOrEqual((await footer.boundingBox())!.y);
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Keep editing', exact: true })).toBeVisible();
});

test('sharing keeps a pending edit open and exposes a competing version failure', async ({ page }) => {
  await open(page, 'project?project=p1&tab=overview');
  const other = await page.context().newPage();
  await other.goto('/app-local/w/w1/project?project=p1&tab=overview');
  await other.getByRole('button', { name: 'Project settings', exact: true }).click();
  await other.getByRole('textbox', { name: 'Name', exact: true }).fill('Changed in another tab');
  await page.locator('.project-members-trigger').click();
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        void navigator.locks.request('gr8r.workspaces.v1', () => {
          resolve();
          return new Promise<void>(release => {
            (window as Window & { releaseSharingLock?: () => void }).releaseSharingLock = release;
          });
        });
      }),
  );
  try {
    await other.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending?.length ?? 0)).toBeGreaterThanOrEqual(1);
    await page.locator('.project-members-list li').first().getByRole('combobox').selectOption('Can view');
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Project members', exact: true })).toBeVisible();
  } finally {
    await page.evaluate(() => (window as Window & { releaseSharingLock?: () => void }).releaseSharingLock?.());
  }
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed');
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeEnabled();
  await other.close();
});

test('pending label update lets Escape close only its popup and restores focus after the write', async ({ page }) => {
  const task = seed().tasks[0];
  await open(page, 'tasks');
  await page.locator(`[data-task-row="${task.id}"]`).getByRole('button', { name: task.title, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Task details', exact: true });
  const trigger = drawer.getByRole('button', { name: `Change labels: ${task.key}`, exact: true });
  await trigger.click();
  const popup = drawer.getByRole('menu', { name: 'Labels', exact: true });
  const label = popup.getByRole('menuitemcheckbox').first();
  const labelName = (await label.getAttribute('aria-label'))!;
  const checked = (await label.getAttribute('aria-checked')) === 'true';
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        void navigator.locks.request('gr8r.workspaces.v1', () => {
          resolve();
          return new Promise<void>(release => {
            (window as Window & { releaseLabelLock?: () => void }).releaseLabelLock = release;
          });
        });
      }),
  );
  try {
    await label.click();
    await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending?.length ?? 0)).toBeGreaterThanOrEqual(1);
    await expect(trigger).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(drawer).toBeVisible();
  } finally {
    await page.evaluate(() => (window as Window & { releaseLabelLock?: () => void }).releaseLabelLock?.());
  }
  await expect(trigger).toBeEnabled();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(popup.getByRole('menuitemcheckbox', { name: labelName, exact: true })).toHaveAttribute('aria-checked', String(!checked));
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(drawer).toBeVisible();
});
