import { test, expect, type Page } from '@playwright/test';
import { openAccount } from './visible-controls.js';
const workspace = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  userId = '33333333-3333-4333-8333-333333333333';
const secret = 'krs_' + 'a'.repeat(32) + '_' + 'B'.repeat(43),
  rotated = 'krs_' + 'c'.repeat(32) + '_' + 'D'.repeat(43);
const user = {
  id: userId,
  email: 'admin@example.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: { provider: 'email' },
  user_metadata: { name: 'Admin fixture' },
  created_at: '2026-10-21T00:00:00Z',
};
const token = [
  { alg: 'HS256', typ: 'JWT' },
  { sub: userId, session_id: '44444444-4444-4444-8444-444444444444', role: 'authenticated', exp: 4102444800 },
  'fixture-signature',
]
  .map(x => (typeof x === 'string' ? x : Buffer.from(JSON.stringify(x)).toString('base64url')))
  .join('.');
async function fixture(page: Page, role = 'owner') {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  let connection: Record<string, unknown> | null = null,
    fail = false,
    delay = false,
    release = () => {};
  let reached = () => {};
  const arrived = new Promise<void>(r => {
    reached = r;
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === (process.env.KAIROS_TOKEN_TEST_ORIGIN ?? 'http://127.0.0.1:5198') && route.request().method() === 'GET') return route.continue();
    if (url.pathname.includes('/auth/v1/'))
      return route.fulfill({
        json: url.pathname.includes('/token')
          ? { access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user }
          : user,
      });
    if (!url.pathname.includes('/rest/v1/rpc/')) return route.abort();
    const name = url.pathname.split('/').pop()!,
      body = route.request().postDataJSON() ?? {},
      op = body.p_operation;
    calls.push({ name, body });
    if (name === 'create_organization_agent_token' || name === 'rotate_organization_agent_token') {
      if (fail) return route.fulfill({ status: 500, json: { code: 'XX000', message: 'unsafe internal ' + secret } });
      if (delay) {
        reached();
        await new Promise<void>(r => {
          release = r;
        });
      }
      connection = {
        id: '55555555-5555-4555-8555-555555555555',
        workspaceId: body.p_workspace_id,
        agentId: 'fixture-agent',
        name: body.p_name ?? 'Hermes VPS',
        capability: body.p_capability ?? 'write',
        prefix: 'krs_aaaaaaaa',
        createdByUserId: userId,
        createdAt: '2026-10-21T00:00:00Z',
        expiresAt: body.p_expires_in_days === null ? null : '2027-01-19T00:00:00Z',
        lastUsedAt: null,
        revokedAt: null,
        status: 'active',
      };
      return route.fulfill({ json: { token: name === 'create_organization_agent_token' ? secret : rotated, connection } });
    }
    if (name === 'revoke_organization_agent_token') {
      connection = { ...connection, status: 'revoked', revokedAt: '2026-10-21T01:00:00Z' };
      return route.fulfill({ json: { connection } });
    }
    if (name === 'list_organization_agent_tokens')
      return route.fulfill({ json: { items: connection && connection.workspaceId === body.p_workspace_id ? [connection] : [], nextCursor: null } });
    let data: unknown = { items: [], nextCursor: null };
    if (name === 'list_workspace_members') data = [{ user_id: userId, name: 'Admin fixture', email: user.email, role }];
    if (name === 'list_webhook_subscriptions') data = [];
    if (op === 'list_workspaces')
      data = {
        items: [
          { id: workspace, name: 'Delta fixture', role, storageVersion: 2, version: 1, color: '#5A67D8', slug: 'delta-fixture' },
          { id: other, name: 'Outra organização', role: 'owner', storageVersion: 2, version: 1, color: '#5A67D8', slug: 'outra' },
        ],
        nextCursor: null,
      };
    if (op === 'list_projects')
      data = {
        items: [{ id: 'fixture-project', workspaceId: workspace, name: 'Projeto fixture', key: 'TOK', status: 'active', version: 1, legacyMetadata: {} }],
        nextCursor: null,
      };
    if (op === 'list_tasks')
      data = {
        items: [
          {
            id: 'fixture-task',
            workspaceId: workspace,
            projectId: 'fixture-project',
            title: 'Tarefa fixture',
            description: '',
            status: 'todo',
            priority: 'none',
            version: 1,
            archived: false,
            assigneeUserId: null,
            executorAgentId: null,
            recurrence: null,
            dueDate: null,
            startDate: null,
            sortOrder: 0,
            key: 'TOK-1',
            legacyMetadata: {},
            createdAt: '2026-10-21T00:00:00Z',
            updatedAt: '2026-10-21T00:00:00Z',
          },
        ],
        nextCursor: null,
      };
    if (op === 'list_agents')
      data = {
        items: [{ id: 'fixture-agent', name: 'Hermes VPS', authUserId: null, clientId: null, connectionSource: 'organization_token' }],
        nextCursor: null,
      };
    if (op === 'list_comments')
      data = {
        items: [
          {
            id: 'agent-comment',
            workspaceId: workspace,
            taskId: 'fixture-task',
            body: 'Resposta do agente',
            authorUserId: null,
            authorAgentId: 'fixture-agent',
            createdAt: '2026-10-21T00:00:00Z',
            version: 1,
            legacyMetadata: {},
          },
        ],
        nextCursor: null,
      };
    if (op === 'get_preferences') data = { data: null };
    if (op === 'get_event_cursor') data = { data: { cursor: '["",""]' } };
    return route.fulfill({ json: data });
  });
  await page.goto('/app');
  await page.getByLabel('E-mail', { exact: true }).fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('.workspace-name')).toHaveText('Delta fixture');
  await page.goto(`/app/w/${workspace}/integrations`);
  return {
    calls,
    fail: () => {
      fail = true;
    },
    delay: () => {
      delay = true;
    },
    arrived,
    release: () => release(),
  };
}
test('admin issues one-time organization token, rotates and revokes without persistent secret', async ({ page }) => {
  const f = await fixture(page);
  await expect(page.getByRole('heading', { name: 'Tokens de agentes', exact: true })).toBeVisible();
  await page.getByLabel('Nome do token', { exact: true }).fill('Hermes VPS');
  await page.getByLabel('Permissão do token', { exact: true }).selectOption('write');
  await page.getByRole('button', { name: 'Gerar token', exact: true }).click();
  await expect(page.getByLabel('Token gerado', { exact: true })).toHaveValue(secret);
  const create = f.calls.find(c => c.name === 'create_organization_agent_token')!;
  expect(create.body).toMatchObject({ p_workspace_id: workspace, p_name: 'Hermes VPS', p_capability: 'write', p_expires_in_days: 90 });
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(secret);
  await page.getByRole('button', { name: 'Já guardei, fechar', exact: true }).click();
  await expect(page.getByLabel('Token gerado', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Token gerado', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Rotacionar token Hermes VPS', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Rotacionar token', exact: true }).click();
  await expect(page.getByLabel('Token gerado', { exact: true })).toHaveValue(rotated);
  await page.getByRole('button', { name: 'Já guardei, fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Revogar token Hermes VPS', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Revogar token', exact: true }).click();
  await expect(page.locator('.agent-token-row').getByText('Revogado', { exact: true })).toBeVisible();
});
for (const role of ['member', 'guest'])
  test(`${role} cannot access token management`, async ({ page }) => {
    const f = await fixture(page, role);
    await expect(page.getByText('Somente proprietários e administradores podem gerenciar tokens.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gerar token', exact: true })).toHaveCount(0);
    expect(f.calls.some(c => c.name.includes('organization_agent_token'))).toBe(false);
  });
test('invalid name and unsafe server failure remain inline without exposing token', async ({ page }) => {
  const f = await fixture(page);
  await page.getByLabel('Nome do token', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'Gerar token', exact: true }).click();
  await expect(page.locator('.agent-tokens [role="alert"]')).toContainText('nome');
  expect(f.calls.some(c => c.name === 'create_organization_agent_token')).toBe(false);
  f.fail();
  await page.getByLabel('Nome do token', { exact: true }).fill('Hermes VPS');
  await page.getByRole('button', { name: 'Gerar token', exact: true }).click();
  await expect(page.locator('.agent-tokens [role="alert"]')).toBeVisible();
  await expect(page.getByLabel('Nome do token', { exact: true })).toHaveValue('Hermes VPS');
  await expect(page.locator('body')).not.toContainText(secret);
  await expect(page.locator('body')).not.toContainText('unsafe internal');
});
test('late issuance cannot show a secret in a different organization', async ({ page }) => {
  const f = await fixture(page);
  f.delay();
  await page.getByLabel('Nome do token', { exact: true }).fill('Hermes VPS');
  await page.getByRole('button', { name: 'Gerar token', exact: true }).click();
  await f.arrived;
  await page.getByRole('button', { name: 'Alternar organização', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Outra organização', exact: true }).click();
  await expect(page.locator('.workspace-name')).toHaveText('Outra organização');
  f.release();
  await page.evaluate(url => {
    history.pushState({}, '', url);
    dispatchEvent(new PopStateEvent('popstate'));
  }, `/app/w/${other}/integrations`);
  await expect(page.getByRole('heading', { name: 'Tokens de agentes', exact: true })).toBeVisible();
  await expect(page.getByLabel('Token gerado', { exact: true })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(secret);
});

test('token-authored comments show the agent instead of a human author', async ({ page }) => {
  await fixture(page);
  await page.goto(`/app/w/${workspace}/tasks?task=fixture-task`);
  const comment = page.locator('.cmt').filter({ hasText: 'Resposta do agente' });
  await expect(comment).toBeVisible();
  await expect(comment.locator('strong')).toHaveText('Hermes VPS');
  await expect(comment.locator('.lucide-bot')).toBeVisible();
});

test('admin can explicitly issue a nonexpiring token and logout removes its secret', async ({ page }) => {
  const f = await fixture(page, 'admin');
  await page.getByLabel('Nome do token', { exact: true }).fill('Hermes VPS');
  await page.getByLabel('Validade do token', { exact: true }).selectOption('none');
  await page.getByRole('button', { name: 'Gerar token', exact: true }).click();
  await expect(page.getByLabel('Token gerado', { exact: true })).toHaveValue(secret);
  expect(f.calls.find(call => call.name === 'create_organization_agent_token')?.body.p_expires_in_days).toBeNull();
  await expect(page.locator('.agent-token-details')).toContainText('Sem expiração');
  await openAccount(page);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Token gerado', { exact: true })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(secret);
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(secret);
});

test('a maximum-length token name keeps its status inside the mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.getByLabel('Nome do token', { exact: true }).fill('X'.repeat(100));
  await page.getByRole('button', { name: 'Gerar token', exact: true }).click();
  await expect(page.getByLabel('Token gerado', { exact: true })).toHaveValue(secret);
  await page.getByRole('button', { name: 'Já guardei, fechar', exact: true }).click();
  const status = page.locator('.agent-token-row .connection-heading span');
  await expect(status).toHaveText('Ativo');
  const bounds = await status.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  const name = await page.locator('.agent-token-row .connection-heading strong').boundingBox();
  expect(name!.x + name!.width).toBeLessThanOrEqual(bounds!.x);
});

for (const entry of [
  ['Arquivos', 'files'],
  ['Agentes', 'agents'],
  ['Integrações', 'integrations'],
  ['Busca', 'search'],
  ['Sistema visual', 'system'],
  ['Estados', 'states'],
  ['Atalhos de teclado', 'settings?sec=shortcuts'],
])
  test(`help menu navigates by mouse: ${entry[0]}`, async ({ page }) => {
    await fixture(page);
    await page.goto(`/app/w/${workspace}/settings?sec=payment`);
    await page.getByRole('button', { name: 'Ajuda e recursos', exact: true }).click();
    await page.getByRole('menuitem', { name: entry[0], exact: true }).click();
    await expect(page).toHaveURL(`/app/w/${workspace}/${entry[1]}`);
    await expect(page.getByRole('menu', { name: 'Ajuda e recursos', exact: true })).toHaveCount(0);
  });
test('organization integrations are reachable from settings and can issue a token', async ({ page }) => {
  const f = await fixture(page);
  await page.locator('.work-sidebar-bottom').getByRole('link', { name: 'Configurações', exact: true }).click();
  await page.getByRole('navigation', { name: 'Seções de configurações', exact: true }).getByRole('button', { name: 'Integrações', exact: true }).click();
  await expect(page).toHaveURL(`/app/w/${workspace}/settings?sec=integrations`);
  await expect(page.getByRole('heading', { name: 'Tokens de agentes', exact: true })).toBeVisible();
  await page.getByLabel('Nome do token', { exact: true }).fill('Hermes settings');
  await page.getByRole('button', { name: 'Gerar token', exact: true }).click();
  await expect(page.getByLabel('Token gerado', { exact: true })).toHaveValue(secret);
  expect(f.calls.find(c => c.name === 'create_organization_agent_token')?.body.p_workspace_id).toBe(workspace);
});

test('help menu supports keyboard navigation and external dismissal', async ({ page }) => {
  await fixture(page);
  const trigger = page.getByRole('button', { name: 'Ajuda e recursos', exact: true });
  const menu = page.getByRole('menu', { name: 'Ajuda e recursos', exact: true });
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Arquivos', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/app/w/${workspace}/agents`);
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator('.work-content').click({ position: { x: 10, y: 10 } });
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await page.locator('.work-sidebar-bottom').getByRole('link', { name: 'Configurações', exact: true }).focus();
  await expect(menu).toHaveCount(0);
});
