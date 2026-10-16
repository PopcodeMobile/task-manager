import { test, expect } from '@playwright/test';

const name = '<img data-xss-probe src=x onerror="window.__teamXss = true">';
const description = '<svg data-xss-probe onload="window.__teamXss = true"></svg>';

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__gr8r?.S.workspace.ready && window.__gr8r.S.workspace.id);
  await expect(page.locator('.shell')).toBeVisible();
}

async function go(page, route, params = {}) {
  await page.evaluate(({ route, params }) => window.__gr8r.go(route, params), { route, params });
  await expect(page.locator('#main-content .skeleton')).toHaveCount(0);
}

async function expectTextOnly(page) {
  await expect(page.locator('[data-xss-probe]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__teamXss)).toBeUndefined();
}

test('stored team names and descriptions remain literal text in pages, navigation and forms', async ({ page }) => {
  await open(page);
  const me = await page.evaluate(() => window.__gr8r.D().me);
  await page.locator('[data-a="newTeam"]').first().click();
  await page.locator('#tm-name').fill(name);
  await page.locator('#tm-desc').fill(description);
  await page.locator(`[data-a="tformMember"][data-id="${me}"]`).check();
  await page.locator('[data-a="submitTeam"]').click();
  await expect(page.locator('#main-content h1')).toHaveText(name);
  await expectTextOnly(page);
  const teamId = await page.evaluate(() => window.__gr8r.S.ui.params.id);
  await expect(page.locator(`.side [data-r="team"][data-id="${teamId}"] .trunc`)).toHaveText(name);

  await page.reload();
  await page.waitForFunction(() => window.__gr8r?.S.workspace.ready && window.__gr8r.S.workspace.id);
  await expect(page.locator('.shell')).toBeVisible();
  expect(await page.evaluate(id => window.__gr8r.D().teams.find(team => team.id === id), teamId)).toMatchObject({ name, desc: description });
  for (const [route, params] of [
    ['home', {}],
    ['members', {}],
    ['teams', {}],
    ['team', { id: teamId }],
    ['member', { id: me }],
  ]) {
    await go(page, route, params);
    await expectTextOnly(page);
  }
  await go(page, 'team', { id: teamId });
  await expect(page.locator('#main-content .ph p')).toHaveText(description);
  await page.locator('[data-a="editTeam"]').click();
  await expect(page.locator('#tm-name')).toHaveValue(name);
  await expect(page.locator('#tm-desc')).toHaveValue(description);
  await page.locator('.modal button[data-a="closeModal"]').first().click();

  await page.locator('[data-a="newTeam"]').first().click();
  await page.locator('#tm-name').fill(name);
  await page.locator('[data-a="submitTeam"]').click();
  await expect(page.locator('#tm-name-err')).toContainText(name);
  await expectTextOnly(page);
  await page.locator('.modal button[data-a="closeModal"]').first().click();

  await page.locator('[data-a="newProject"]').first().click();
  await expect(page.locator(`#p-team option[value="${teamId}"]`)).toHaveText(name);
  await page.locator('#p-name').fill(`Project ${name}`);
  await page.locator('#p-desc').fill(description);
  await page.locator('#p-team').selectOption(teamId);
  await page.locator('[data-a="submitProject"]').click();
  const projectId = await page.evaluate(() => window.__gr8r.S.ui.params.id);
  await go(page, 'project', { id: projectId, tab: 'overview' });
  await expect(page.locator('#main-content h1')).toHaveText(`Project ${name}`);
  await expectTextOnly(page);
  await page.locator('.side [data-a="toggleSide"]').click();
  await expect(page.locator(`.side [data-r="team"][data-id="${teamId}"]`)).toHaveAttribute('data-tip', name);
  await expectTextOnly(page);
});

test('persisted member and attachment metadata is escaped without changing its value', async ({ page }) => {
  await open(page);
  const memberId = await page.evaluate(() => window.__gr8r.D().me);
  await go(page, 'settings', { sec: 'profile' });
  await page.locator('#pf-name').fill(name);
  await page.locator('#pf-title').fill(description);
  await page.locator('[data-a="saveProfile"]').click();
  await expect.poll(() => page.evaluate(() => window.__gr8r.D().members.find(member => member.id === window.__gr8r.D().me).name)).toBe(name);
  await page.reload();
  await page.waitForFunction(() => window.__gr8r?.S.workspace.ready && window.__gr8r.S.workspace.id);
  await expect(page.locator('.shell')).toBeVisible();
  await go(page, 'member', { id: memberId });
  await expect(page.locator('#main-content h1')).toHaveText(name);
  await expect(page.locator('#main-content .av').first()).toHaveAttribute('aria-label', name);
  await expectTextOnly(page);
  await go(page, 'members');
  await expectTextOnly(page);

  await page.evaluate(
    ({ name, description }) => {
      window.__gr8r.D().files.push({ id: 'literal-file', name, type: 'doc', size: description, by: window.__gr8r.D().me, at: Date.now() });
      window.__gr8r.A.previewFile({ dataset: { id: 'literal-file' } });
    },
    { name, description },
  );
  await expect(page.locator('.modal h2')).toHaveText(name);
  await expect(page.locator('.modal-h .muted')).toContainText(description);
  await expectTextOnly(page);
});
