import { test, expect } from '@playwright/test';

async function open(page) {
  await page.goto('/');
  await expect(page.locator('.shell')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!window.__gr8r?.S.workspace.ready && !!window.__gr8r.S.workspace.id)).toBe(true);
}
async function go(page, route, params = {}) {
  await page.evaluate(({ route, params }) => window.__gr8r.go(route, params), { route, params });
}

test('every route and project view renders in both locales without failed-page fallbacks', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  for (const lang of ['pt-BR', 'en']) {
    await go(page, 'settings', { sec: 'language' });
    await page.locator('select[data-k="lang"]').selectOption(lang);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    for (const route of [
      'home',
      'overview',
      'mytasks',
      'tasks',
      'inbox',
      'notifications',
      'favorites',
      'projects',
      'members',
      'teams',
      'activity',
      'search',
      'calendar',
      'timeline',
      'archive',
      'system',
    ]) {
      await go(page, route);
      await expect(page.locator('#main-content .fullstate h1'), `${lang}:${route}`).toHaveCount(0);
    }
    for (const tab of ['board', 'list', 'table', 'calendar', 'timeline', 'files', 'overview']) {
      await go(page, 'project', { id: 'p1', tab });
      await expect(page.locator('#main-content .fullstate h1'), `${lang}:project:${tab}`).toHaveCount(0);
    }
  }
  expect(errors).toEqual([]);
});

test('language preference persists without translating user-entered task titles', async ({ page }) => {
  await open(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await page.locator('[data-a="newTask"]').first().click();
  await page.locator('#f-title').fill('Home');
  await page.locator('[data-a="submitTask"]').click();
  await go(page, 'settings', { sec: 'language' });
  await page.locator('select[data-k="lang"]').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate(() => window.__gr8r.D().tasks.some(task => task.title === 'Home'))).toBe(true);
});

test('new workspaces are empty, persist their selection and never inherit another workspace task', async ({ page }) => {
  await open(page);
  const oldCount = await page.evaluate(() => window.__gr8r.D().tasks.length);
  const oldId = await page.evaluate(() => window.__gr8r.S.workspace.id);
  await page.locator('[data-pop="ws"]').click();
  await page.locator('[data-a="newWorkspace"]').click();
  await page.locator('#workspace-name').fill('Organização B');
  await page.locator('form[data-submit="createWorkspace"] button[type="submit"]').click();
  await expect(page.locator('.ws-name')).toHaveText('Organização B');
  expect(await page.evaluate(() => window.__gr8r.D().tasks.length)).toBe(0);
  await page.reload();
  await expect(page.locator('.ws-name')).toHaveText('Organização B');
  await page.locator('[data-pop="ws"]').click();
  await page.locator(`[data-a="switchWs"][data-v="${oldId}"]`).click();
  await expect.poll(() => page.evaluate(() => window.__gr8r.D().tasks.length)).toBe(oldCount);
});

test('shared rich text preserves formatting and strips executable markup', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const { safeRichText } = await import('/src/core/rich-text.js');
    const clean = safeRichText('<b>Title</b><img src=x onerror=alert(1)><a href="javascript:alert(1)" data-a="delWorkspace">bad</a><script>alert(1)</script>');
    const box = document.createElement('div');
    box.innerHTML = clean;
    return {
      bold: box.querySelector('b')?.textContent,
      dangerous: box.querySelector('script,img,[onclick],[onerror],[data-a],[href^="javascript:"]') !== null,
    };
  });
  expect(result).toEqual({ bold: 'Title', dangerous: false });
});

test('reaction member names render as text even when auth metadata contains markup', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const { commentHtml } = await import('/src/overlays/drawer.js');
    const d = window.__gr8r.D();
    const member = d.members[0];
    member.name = '"><img src=x onerror="window.__reactionXss=1">';
    const box = document.createElement('div');
    box.innerHTML = commentHtml({ id: 'probe', by: member.id, at: Date.now(), text: 'Hello', re: { '👍': [member.id] } });
    document.body.append(box);
    return { images: box.querySelectorAll('img').length, title: box.querySelector('.react').title, name: member.name };
  });
  expect(result.images).toBe(0);
  expect(result.title).toBe(result.name);
});

test('a drag started in one workspace cannot reorder another workspace', async ({ page }) => {
  await open(page);
  const original = await page.evaluate(() => window.__gr8r.S.workspace.id);
  await page.locator('[data-pop="ws"]').click();
  await page.locator('[data-a="newWorkspace"]').click();
  await page.locator('#workspace-name').fill('Isolated drop');
  await page.locator('form[data-submit="createWorkspace"] button[type="submit"]').click();
  await expect(page.locator('.ws-name')).toHaveText('Isolated drop');
  await page.locator('[data-a="newProject"]').first().click();
  await page.locator('#p-name').fill('Drop target');
  await page.locator('[data-a="submitProject"]').click();
  const result = await page.evaluate(async () => {
    return { second: window.__gr8r.S.workspace.id, order: [...window.__gr8r.D().projOrder] };
  });
  const actual = await page.evaluate(
    async ({ original, second }) => {
      const { A, D } = window.__gr8r;
      await A.switchWs({ dataset: { v: original } });
      const firstProject = D().projects[0].id;
      const source = document.querySelector(`[data-drag-proj="${firstProject}"]`);
      const dataTransfer = new DataTransfer();
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
      await A.switchWs({ dataset: { v: second } });
      const target = document.querySelector('[data-proj-drop]');
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
      return D().projOrder;
    },
    { original, second: result.second },
  );
  expect(actual).toEqual(result.order);
});

test('theme and foundational token overrides propagate to controls', async ({ page }) => {
  await open(page);
  await go(page, 'settings', { sec: 'appearance' });
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const control = document.querySelector('.btn');
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
