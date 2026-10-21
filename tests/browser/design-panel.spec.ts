import { test, expect, type Page } from '@playwright/test';
import { seed } from '../../src/data/seed.js';

async function openPanel(page: Page, route: string, data = seed()) {
  await page.addInitScript(data => localStorage.setItem('gr8r.v2', JSON.stringify({ data, prefs: { lang: 'en', theme: 'light' } })), data);
  await page.goto('/login');
  await page.getByRole('link', { name: /Continue on this device|Continuar neste dispositivo/ }).click();
  await page.goto('/app-local/w/w1/' + route);
  await expect(page.locator('#work-content')).toBeVisible();
}

for (const route of ['home', 'overview']) {
  test(`${route} restores the original joined stats and two-column dashboard hierarchy`, async ({ page }) => {
    await openPanel(page, route);
    const dashboard = page.locator('#work-content .dashboard-page');
    await expect(dashboard).toBeVisible();
    const stats = dashboard.locator(':scope > .stats');
    await expect(stats.locator('.stat')).toHaveCount(4);
    const grid = dashboard.locator(':scope > .grid2');
    await expect(grid).toBeVisible();
    const geometry = await grid.evaluate(element => {
      const children = [...element.children].map(child => child.getBoundingClientRect());
      return {
        columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
        left: children[0].x,
        right: children[1].x,
        topDelta: Math.abs(children[0].y - children[1].y),
      };
    });
    expect(geometry.columns).toBe(2);
    expect(geometry.right).toBeGreaterThan(geometry.left + 300);
    expect(geometry.topDelta).toBeLessThan(2);
    await expect(grid.getByRole('heading', { name: route === 'home' ? 'Project progress' : 'Portfolio', exact: true })).toBeVisible();
    await expect(grid.locator('table')).toBeVisible();
    if (route === 'home') {
      await expect(grid.getByRole('tablist')).toBeVisible();
      await expect(grid.getByRole('tab')).toHaveCount(3);
      const firstRow = grid.locator('.mini').first();
      await expect(firstRow).toBeVisible();
      expect((await firstRow.boundingBox())!.height).toBeLessThanOrEqual(44);
    } else {
      await expect(grid.locator('.stackbar')).toBeVisible();
      await expect(grid.getByRole('heading', { name: 'Upcoming milestones', exact: true })).toBeVisible();
    }
    await test.info().attach(`${route}-geometry`, { body: JSON.stringify(geometry), contentType: 'application/json' });
    await page.screenshot({ path: `/tmp/design-panel-${route}.png`, fullPage: true });
  });
}

test('recent activity has one seven-row feed without an empty placeholder before historical records', async ({ page }) => {
  await openPanel(page, 'home');
  const recent = page.locator('.dashboard-feed');
  await expect(recent.locator('.fitem')).toHaveCount(7);
  await expect(recent.getByText('Updates from people and agents will appear here.', { exact: true })).toHaveCount(0);
});

test('a newly saved team keeps its chosen rocket glyph in the actual team header', async ({ page }) => {
  await openPanel(page, 'teams');
  await page.getByRole('button', { name: 'Create team', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Name', { exact: true }).fill('Launch team');
  await editor.getByRole('radiogroup', { name: 'Icon', exact: true }).getByRole('radio', { name: 'rocket', exact: true }).click();
  await editor.getByRole('button', { name: 'Save team', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Launch team', exact: true })).toBeVisible();
  await expect(page.locator('.people-page > .ph .team-mark .lucide-rocket')).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.teams.find((team: { name: string }) => team.name === 'Launch team'),
  );
  expect(saved.icon).toBe('rocket');
});

test('custom team choices remain unchanged on open and expose keyboard entry to both palettes', async ({ page }) => {
  const data = { ...seed(), teams: [{ id: 'design', name: 'Custom palette team', icon: 'legacy-custom', c: '#123456', desc: 'Existing custom choices' }] };
  await openPanel(page, 'team?id=design', data);
  await page.getByRole('button', { name: 'Edit team', exact: true }).click();
  const editor = page.getByRole('dialog');
  const persisted = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.teams.find((team: { id: string }) => team.id === 'design'));
  const before = await persisted();
  await expect(editor.getByLabel('Color value', { exact: true })).toHaveValue('#123456');
  await editor.getByLabel('Description', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(editor.getByRole('radiogroup', { name: 'Icon', exact: true }).getByRole('radio', { name: 'users', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(editor.getByRole('radiogroup', { name: 'Color', exact: true }).getByRole('radio', { name: 'indigo', exact: true })).toBeFocused();
  await expect(editor.getByLabel('Color value', { exact: true })).toHaveValue('#123456');
  await page.keyboard.press('ArrowRight');
  await expect(editor.getByRole('radiogroup', { name: 'Color', exact: true }).getByRole('radio', { name: 'blue', exact: true })).toBeFocused();
  await expect(editor.getByLabel('Color value', { exact: true })).toHaveValue('blue');
  expect(await persisted()).toEqual(before);
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Edit team', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Color value', { exact: true })).toHaveValue('#123456');
  expect(await persisted()).toEqual(before);
});

test('settings archived projects require confirmation before their existing delete command', async ({ page }) => {
  const data = seed();
  data.projects = data.projects.map((project, index) => (index === 0 ? { ...project, archived: true, archivedAt: Date.now() - 2 * 86400000 } : project));
  await openPanel(page, 'settings?sec=projects', data);
  const archived = page.locator('.sblock').filter({ has: page.getByRole('heading', { name: 'Archived projects', exact: true }) });
  await archived.getByRole('button', { name: 'Delete permanently: ' + data.projects[0].name, exact: true }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText(data.projects[0].name);
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(archived.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
  await archived.getByRole('button', { name: 'Delete permanently: ' + data.projects[0].name, exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(archived.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(0);
  const ids = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.projects.map((project: { id: string }) => project.id),
  );
  expect(ids).toEqual(data.projects.slice(1).map(project => project.id));
});

test('archive preserves the known age of a numeric legacy project timestamp', async ({ page }) => {
  const data = seed();
  data.projects = data.projects.map((project, index) => (index === 0 ? { ...project, archived: true, archivedAt: Date.now() - 2 * 86400000 } : project));
  await openPanel(page, 'archive', data);
  await page.getByRole('button', { name: /^Projects/ }).click();
  await expect(page.locator('.archive-row').filter({ hasText: data.projects[0].name }).locator('.archive-time')).toHaveText('Archived 2d ago');
});

test('settings project deletion keeps a stale-version error accessible inside its confirmation', async ({ page, context }) => {
  const data = seed();
  data.projects = data.projects.map((project, index) => (index === 0 ? { ...project, archived: true } : project));
  await openPanel(page, 'settings?sec=projects', data);
  await page.getByRole('button', { name: 'Delete permanently: ' + data.projects[0].name, exact: true }).click();
  const confirmation = page.getByRole('alertdialog');
  const other = await context.newPage();
  await other.goto('/app-local/w/w1/settings?sec=projects');
  await other.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(other.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(0);
  await confirmation.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole('alert')).toContainText('Your draft was kept');
  const project = await page.evaluate(
    id => JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!).records.w1.data.projects.find((project: { id: string }) => project.id === id),
    data.projects[0].id,
  );
  expect(project).toBeTruthy();
  expect(project.archived).toBe(false);
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await other.close();
});

test('mobile settings stacks theme previews and preference controls in the original content gutter', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPanel(page, 'settings?sec=appearance');
  const cards = page.getByRole('radiogroup', { name: 'Theme', exact: true }).getByRole('radio');
  const first = (await cards.nth(0).boundingBox())!,
    second = (await cards.nth(1).boundingBox())!;
  expect(first.x).toBe(16);
  expect(first.width).toBe(358);
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height + 10);
  await page.goto('/app-local/w/w1/settings?sec=language');
  const language = page.locator('.settings-content .srow').first();
  const label = (await language.locator('.t').boundingBox())!,
    control = (await language.getByRole('combobox').boundingBox())!;
  expect(control.x).toBe(16);
  expect(control.y).toBeGreaterThan(label.y + label.height + 10);
});

test('mobile inbox keeps unread and per-row read actions visible beside wrapping notification text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPanel(page, 'inbox');
  await expect(page.getByRole('checkbox', { name: 'Unread', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark all as read', exact: true })).toBeVisible();
  const row = page.locator('.inbox-list .nrow').first();
  const action = row.getByRole('button', { name: /Mark (unread|read)/ });
  await expect(action).toBeVisible();
  const bounds = (await action.boundingBox())!;
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('search reads real local recent chips and an explicitly cleared list survives reload', async ({ page }) => {
  const data = seed();
  await openPanel(page, 'search', data);
  const recent = page.locator('.recent-searches');
  for (const value of data.recentSearches) await expect(recent.getByRole('button', { name: value, exact: true })).toBeVisible();
  await recent.getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(recent.locator('.badge')).toHaveCount(0);
  await page.reload();
  await expect(recent).toBeVisible();
  await expect(recent.locator('.badge')).toHaveCount(0);
});

test('activity keeps chronological groups with unsorted imported history and an older event-only day', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
  const data = seed();
  data.activity = [
    { ...data.activity[0], id: 'import-earlier', verb: 'Earlier imported record', at: Date.parse('2026-10-10T12:00:00Z') },
    { ...data.activity[0], id: 'import-today', verb: 'Today imported record', at: Date.parse('2026-10-21T11:00:00Z') },
    { ...data.activity[0], id: 'import-week', verb: 'This week imported record', at: Date.parse('2026-10-18T12:00:00Z') },
  ];
  await openPanel(page, 'activity', data);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('gr8r.workspaces.v1')!);
    state.reactPanels = {
      ...state.reactPanels,
      w1: {
        versions: {},
        requests: {},
        storageRevision: state.records.w1.revision,
        events: [
          {
            id: 'event-yesterday',
            operation: 'update_project',
            entityId: 'p1',
            actorUserId: 'm1',
            actorAgentId: null,
            createdAt: '2026-10-20T12:00:00.000Z',
            payload: { projectId: 'p1' },
          },
        ],
      },
    };
    localStorage.setItem('gr8r.workspaces.v1', JSON.stringify(state));
  });
  await page.reload();
  const feed = page.locator('.activity-page .activity-feed');
  await expect(feed.locator('.fitem')).toHaveCount(4);
  await expect(feed.locator('.activity-day > .day-h')).toHaveText(['Today', 'Yesterday', 'This week', 'Earlier']);
  for (const verb of ['Today imported record', 'This week imported record', 'Earlier imported record'])
    await expect(feed.getByText(verb, { exact: true })).toBeVisible();
});

test('mobile activity task text continues on the actor line while retaining task navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPanel(page, 'activity');
  const row = page.locator('.activity-page .fitem').first();
  const delta = await row.evaluate(element => {
    const task = element.querySelector('.obj')!;
    const text = task.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.max(1, text.textContent!.trimStart().indexOf(' ')));
    return Math.abs(range.getBoundingClientRect().y - element.querySelector('b')!.getBoundingClientRect().y);
  });
  expect(delta).toBeLessThan(2);
  await row.locator('.obj').click();
  await expect(page.getByRole('dialog', { name: 'Task details', exact: true })).toBeVisible();
});

test('inbox reply composer aligns with its conversation and retains the compact original action', async ({ page }) => {
  await openPanel(page, 'inbox');
  await page.locator('.inbox-list .nrow .inline-link').first().click();
  const conversation = page.locator('.inbox-conversation-body');
  const composer = conversation.locator('.task-comment-composer');
  await expect(composer.getByRole('textbox', { name: 'Reply', exact: true })).toBeVisible();
  const title = (await conversation.locator('h2').boundingBox())!,
    box = (await composer.boundingBox())!;
  expect(Math.abs(box.x - title.x)).toBeLessThan(2);
  expect(box.height).toBeLessThanOrEqual(94);
  expect((await composer.getByRole('button', { name: 'Reply', exact: true }).boundingBox())!.height).toBe(26);
});

test('project overview recent activity remains compact while the full activity tab keeps date groups', async ({ page }) => {
  await openPanel(page, 'project?project=p1&tab=overview');
  const recent = page.locator('.project-overview .panel').filter({ has: page.getByRole('heading', { name: 'Recent activity', exact: true }) });
  await expect(recent.locator('.compact-context-history')).toBeVisible();
  await expect(recent.locator('.fitem').first()).toBeVisible();
  await expect(recent.locator('.day-h')).toHaveCount(0);
  const inset = await recent.evaluate(panel => {
    const body = panel.querySelector('.panel-b')!;
    const contentX = body.getBoundingClientRect().x + parseFloat(getComputedStyle(body).paddingLeft);
    return Math.abs(contentX - panel.querySelector('.context-history')!.getBoundingClientRect().x);
  });
  expect(inset).toBeLessThan(2);
  await recent.getByRole('link', { name: 'View all', exact: true }).click();
  await expect(page.locator('.project-context-history .day-h').first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.locator('.project-context-history .activity-avatar').first().boundingBox())!.x).toBe(16);
});

test('inbox selected conversation fills the preview at 800px and read badges clear', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1000 });
  await openPanel(page, 'inbox');
  await page.locator('.inbox-list .nrow .inline-link').first().click();
  const preview = page.getByRole('region', { name: 'Selected conversation', exact: true });
  await expect(preview).toBeVisible();
  const box = (await preview.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  expect(box.width).toBe(800);
  await preview.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
  await expect(page.locator('.inbox-tabs .cnt')).toHaveCount(0);
});

test('appearance exposes one visible preference control and preserves every saved accent choice', async ({ page }) => {
  await openPanel(page, 'settings?sec=appearance');
  await expect(page.locator('.settings-content .sr-only select')).toHaveCount(0);
  const accents = page.getByRole('radiogroup', { name: 'Accent color', exact: true });
  await expect(accents.getByRole('radio', { name: 'green', exact: true })).toBeVisible();
  await expect(accents.getByRole('radio', { name: 'amber', exact: true })).toBeVisible();
  const theme = page.getByRole('radiogroup', { name: 'Theme', exact: true });
  await theme.getByRole('radio', { name: 'Light', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(theme.getByRole('radio', { name: 'Dark', exact: true })).toBeFocused();
});

test('design galleries render the original states and examples through safe sample dialogs', async ({ page }) => {
  await openPanel(page, 'system');
  const gallery = page.locator('.catalogue-page');
  await expect(gallery.locator('.ds-sidebar')).toBeVisible();
  await expect(gallery.locator('.ds-crumbs')).toBeVisible();
  await expect(gallery.locator('.ds-multiselect')).toBeVisible();
  await expect(gallery.locator('.ds-richtext')).toBeVisible();
  await expect(gallery.locator('.ds-alerts > .alert')).toHaveCount(4);
  expect(await gallery.locator('.ui-button.state-hover').count()).toBeGreaterThanOrEqual(4);
  expect(await gallery.locator('.ui-button.state-active').count()).toBeGreaterThanOrEqual(4);
  await page.goto('/app-local/w/w1/states');
  await expect(page.locator('.states-grid')).toHaveCount(3);
  await expect(page.locator('.states-grid').nth(0).locator(':scope > .panel')).toHaveCount(4);
  await expect(page.locator('.states-grid').nth(1).locator(':scope > .panel')).toHaveCount(4);
  await expect(page.locator('.states-grid').nth(2).locator(':scope > .panel')).toHaveCount(6);
  const before = await page.evaluate(() => localStorage.getItem('gr8r.workspaces.v1'));
  await page.locator('.gallery-confirmations').getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('This example does not delete data.');
  await page.getByRole('button', { name: 'Confirm example', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('gr8r.workspaces.v1'))).toBe(before);
});
