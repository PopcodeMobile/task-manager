import { test, expect, type Page } from '@playwright/test';
const origin = process.env.KAIROS_INVITE_TEST_ORIGIN ?? 'http://127.0.0.1:5199';
const workspace = '11111111-1111-4111-8111-111111111111',
  userId = '33333333-3333-4333-8333-333333333333',
  invitationId = '66666666-6666-4666-8666-666666666666';
const user = (email: string) => ({
  id: userId,
  email,
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: { provider: 'email' },
  user_metadata: { name: 'Fixture' },
  created_at: '2026-10-22T00:00:00Z',
});
const token = [
  { alg: 'HS256', typ: 'JWT' },
  { sub: userId, session_id: '44444444-4444-4444-8444-444444444444', role: 'authenticated', exp: 4102444800 },
  'fixture-signature',
]
  .map(x => (typeof x === 'string' ? x : Buffer.from(JSON.stringify(x)).toString('base64url')))
  .join('.');
const listed = { id: workspace, name: 'Delta fixture', storageVersion: 2, version: 1, color: '#5A67D8', slug: 'delta-fixture' };
async function fixture(page: Page, { role = 'owner', member = true, emailSent = true } = {}) {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  let joined = member,
    pending: Record<string, unknown>[] = [];
  const email = member ? 'owner@example.test' : 'ana@example.test';
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && route.request().method() === 'GET') return route.continue();
    if (url.pathname.includes('/auth/v1/'))
      return route.fulfill({
        json: url.pathname.includes('/token')
          ? { access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: user(email) }
          : user(email),
      });
    if (url.pathname.endsWith(`/functions/v1/api/v1/workspaces/${workspace}/invitations`)) {
      const body = route.request().postDataJSON();
      calls.push({ name: 'api_invitation', body: { ...body, authorization: route.request().headers().authorization } });
      const invitation = {
        id: invitationId,
        workspaceId: workspace,
        email: body.input.email,
        role: body.input.role,
        status: 'pending',
        expiresAt: '2026-10-29T12:00:00Z',
      };
      pending = [invitation];
      return route.fulfill({ status: 201, json: { data: invitation, emailSent, requestId: 'r' } });
    }
    if (!url.pathname.includes('/rest/v1/rpc/')) return route.abort();
    const name = url.pathname.split('/').pop()!,
      body = route.request().postDataJSON() ?? {},
      op = body.p_operation;
    calls.push({ name, body });
    if (name === 'list_workspace_invitations') return route.fulfill({ json: { items: pending } });
    if (name === 'revoke_workspace_invitation') {
      pending = [];
      return route.fulfill({ json: { id: body.p_id, status: 'revoked' } });
    }
    if (name === 'list_my_workspace_invitations')
      return route.fulfill({
        json: {
          items: joined
            ? []
            : [
                {
                  id: invitationId,
                  workspaceId: workspace,
                  workspaceName: 'Delta fixture',
                  role: 'member',
                  inviterName: 'Hugo',
                  expiresAt: '2026-10-29T12:00:00Z',
                },
              ],
        },
      });
    if (name === 'accept_workspace_invitation') {
      joined = true;
      return route.fulfill({ json: { workspaceId: workspace, role: 'member' } });
    }
    let data: unknown = { items: [], nextCursor: null };
    if (name === 'list_workspace_members') data = [{ user_id: userId, name: 'Fixture', email, role: joined && !member ? 'member' : role }];
    if (name === 'list_webhook_subscriptions') data = [];
    if (op === 'list_workspaces') data = { items: joined ? [{ ...listed, role: member ? role : 'member' }] : [], nextCursor: null };
    if (op === 'get_preferences') data = { data: null };
    if (op === 'get_event_cursor') data = { data: { cursor: '["",""]' } };
    return route.fulfill({ json: data });
  });
  await page.goto(member ? '/app' : '/login?invite=1');
  if (!member) await expect(page.getByText('Você recebeu um convite.', { exact: false })).toBeVisible();
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  return { calls };
}
async function openInvite(page: Page) {
  await expect(page.locator('.workspace-name')).toHaveText('Delta fixture');
  await page.goto(`/app/w/${workspace}/members`);
  await page.getByRole('button', { name: 'Convidar membro', exact: true }).first().click();
}
test('owner sends an email invitation with a role, sees it pending and revokes it', async ({ page }) => {
  const f = await fixture(page);
  await openInvite(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('option', { name: 'Admin', exact: true })).toHaveCount(1);
  await dialog.getByLabel('Email', { exact: true }).fill('ana@example.test');
  await dialog.getByLabel('Papel').selectOption('guest');
  await dialog.getByRole('button', { name: 'Enviar convite', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Convite enviado para ana@example.test.');
  const sent = f.calls.find(c => c.name === 'api_invitation')!;
  expect(sent.body).toMatchObject({ input: { email: 'ana@example.test', role: 'guest' }, authorization: `Bearer ${token}` });
  await expect(dialog.getByRole('list', { name: 'Convites pendentes' })).toContainText('ana@example.test');
  await dialog.getByRole('button', { name: 'Revogar convite de ana@example.test', exact: true }).click();
  await expect(dialog.getByRole('list', { name: 'Convites pendentes' })).toHaveCount(0);
  expect(f.calls.find(c => c.name === 'revoke_workspace_invitation')?.body).toEqual({ p_workspace_id: workspace, p_id: invitationId });
});
test('admin cannot offer the admin role and an email failure keeps the invitation with a link fallback', async ({ page }) => {
  await fixture(page, { role: 'admin', emailSent: false });
  await openInvite(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('option', { name: 'Admin', exact: true })).toHaveCount(0);
  await dialog.getByLabel('Email', { exact: true }).fill('ana@example.test');
  await dialog.getByRole('button', { name: 'Enviar convite', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('o e-mail não foi enviado');
  await expect(dialog.getByRole('button', { name: 'Copiar link do convite', exact: true })).toBeEnabled();
});
for (const role of ['member', 'guest'])
  test(`${role} sees why invitations are unavailable and sends nothing`, async ({ page }) => {
    const f = await fixture(page, { role });
    await openInvite(page);
    await expect(page.getByRole('dialog').getByText('Somente proprietários e administradores podem convidar pessoas.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar convite', exact: true })).toHaveCount(0);
    expect(f.calls.some(c => ['api_invitation', 'list_workspace_invitations', 'revoke_workspace_invitation'].includes(c.name))).toBe(false);
  });
test('invited newcomer sees the invitation instead of workspace creation and accepts it', async ({ page }) => {
  const f = await fixture(page, { member: false });
  await page.getByRole('button', { name: 'Aceitar convite para Delta fixture', exact: true }).click();
  await expect(page.locator('.workspace-name')).toHaveText('Delta fixture');
  await expect(page).toHaveURL(new RegExp(`/app/w/${workspace}/home`));
  expect(f.calls.find(c => c.name === 'accept_workspace_invitation')?.body).toEqual({ p_id: invitationId });
  await expect(page.getByRole('region', { name: 'Convites recebidos' })).toHaveCount(0);
});
