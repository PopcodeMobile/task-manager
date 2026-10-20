import { test, expect } from '@playwright/test';
test('direct consent reload opens independent React auth and retains the request', async ({ page }) => {
  await page.goto('/oauth/consent?authorization_id=invalid-request');
  await expect(page.getByRole('heading', { name: 'Entre pra continuar' })).toBeVisible();
  await expect(page.getByLabel('E-mail')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('E-mail')).toBeVisible();
  await expect(page).toHaveURL(/authorization_id=invalid-request/);
  await page.screenshot({ path: '/tmp/task3-react-auth.png', fullPage: true });
});

test.describe('real OAuth consent', () => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, 'Requires the dedicated local Auth server');
  const base = process.env.TEST_SUPABASE_URL!,
    key = process.env.TEST_SUPABASE_ANON_KEY!,
    secret = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;
  let email: string, password: string, userId: string, workspace: string;
  const clientIds: string[] = [];
  let human: import('@supabase/supabase-js').SupabaseClient, service: import('@supabase/supabase-js').SupabaseClient;
  test.beforeAll(async () => {
    const { createClient } = await import('@supabase/supabase-js');
    service = createClient(base, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    human = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
    email = `oauth-ui-${crypto.randomUUID()}@example.test`;
    password = `Task3-${crypto.randomUUID()}!`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;
    const signed = await human.auth.signInWithPassword({ email, password });
    expect(signed.error).toBeNull();
    const ws = await human.rpc('create_workspace_v2', {
      p_name: 'Design do produto',
      p_slug: `oauth-ui-${crypto.randomUUID()}`,
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(ws.error).toBeNull();
    workspace = ws.data.data.id;
  });
  test.afterAll(async () => {
    if (workspace) {
      const deleted = await service.from('workspaces').delete().eq('id', workspace);
      expect(deleted.error).toBeNull();
    }
    for (const clientId of clientIds) await service.auth.admin.oauth.deleteClient(clientId);
    if (userId) await service.auth.admin.deleteUser(userId);
  });
  async function request(clientName: string) {
    const registration = await fetch(`${base}/auth/v1/oauth/clients/register`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: clientName,
        redirect_uris: ['http://127.0.0.1:5180/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
    });
    expect(registration.status).toBe(201);
    const registered = await registration.json();
    clientIds.push(registered.client_id);
    const verifier = crypto.randomUUID() + crypto.randomUUID(),
      state = crypto.randomUUID();
    const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
    const url = new URL(`${base}/auth/v1/oauth/authorize`);
    for (const [k, v] of Object.entries({
      client_id: registered.client_id,
      response_type: 'code',
      redirect_uri: 'http://127.0.0.1:5180/callback',
      scope: 'openid',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    }))
      url.searchParams.set(k, v);
    const response = await fetch(url, { redirect: 'manual' });
    expect(response.status).toBe(302);
    await response.body?.cancel();
    return { clientId: registered.client_id, verifier, state, consentUrl: response.headers.get('location')! };
  }
  async function login(page: import('@playwright/test').Page) {
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  }
  test('approve selected workspace, exchange actual PKCE code, and revoke connection', async ({ page }) => {
    const flow = await request('Claude de teste');
    await page.goto(flow.consentUrl);
    await login(page);
    await expect(page.getByRole('heading', { name: 'Conectar Claude de teste' })).toBeVisible();
    await page.getByRole('checkbox', { name: /Design do produto/ }).check();
    await page.getByRole('combobox', { name: 'Acesso em Design do produto' }).selectOption('write');
    await expect(page.getByText('Identificar sua conta', { exact: true })).toBeVisible();
    await page.screenshot({ path: '/tmp/task3-react-consent.png', fullPage: true });
    await page.getByRole('button', { name: 'Permitir acesso' }).click();
    await page.waitForURL(/\/callback\?code=/);
    const callback = new URL(page.url());
    expect(callback.searchParams.get('state')).toBe(flow.state);
    const response = await fetch(`${base}/auth/v1/oauth/token`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: flow.clientId,
        redirect_uri: 'http://127.0.0.1:5180/callback',
        code: callback.searchParams.get('code')!,
        code_verifier: flow.verifier,
      }),
    });
    const tokens = await response.json();
    expect(response.status).toBe(200);
    expect(tokens.access_token).toBeTruthy();
    await page.goto('/integrations');
    await expect(page.getByRole('heading', { name: 'Suas conexões' })).toBeVisible();
    const connection = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Claude de teste', exact: true }) });
    await expect(connection.getByText('Conectado', { exact: true })).toBeVisible();
    await expect(connection.getByText('Leitura e escrita')).toBeVisible();
    await connection.getByRole('button', { name: 'Revogar acesso' }).click();
    await expect(connection.getByText('Revogado', { exact: true })).toBeVisible();
    const denied = await fetch(`${base}/rest/v1/rpc/read_operation`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${tokens.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_workspace_id: workspace, p_operation: 'list_tasks' }),
    });
    expect(denied.status).toBe(403);
    await denied.body?.cancel();
    await page.screenshot({ path: '/tmp/task3-react-connections.png', fullPage: true });
  });
  test('deny creates no active grant, invalid callback stays safe, and English/theme work', async ({ page }) => {
    const flow = await request('Aplicativo recusado');
    await page.goto(flow.consentUrl);
    await login(page);
    await expect(page.getByRole('heading', { name: 'Conectar Aplicativo recusado' })).toBeVisible();
    await page.getByRole('button', { name: 'Recusar', exact: true }).click();
    await page.waitForURL(/error=access_denied/);
    expect(new URL(page.url()).searchParams.get('state')).toBe(flow.state);
    const connections = await human.rpc('list_integration_connections');
    expect(connections.error).toBeNull();
    expect(connections.data.items.filter((c: { clientId: string; status: string }) => c.clientId === flow.clientId && c.status === 'active')).toHaveLength(0);
    await page.goto('/oauth/consent?authorization_id=invalid-request');
    await expect(page.getByRole('alert')).toContainText('Este pedido expirou');
    await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
    await expect(page.getByRole('heading', { name: 'Access request unavailable' })).toBeVisible();
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/task3-react-mobile-dark.png', fullPage: true });
  });
  test('failure after Auth approval leaves no active connection or executor', async ({ page }) => {
    const flow = await request('Conexão incompleta');
    await page.goto(flow.consentUrl);
    await login(page);
    await expect(page.getByRole('heading', { name: 'Conectar Conexão incompleta' })).toBeVisible();
    await page.getByRole('checkbox', { name: /Design do produto/ }).check();
    await page.getByRole('combobox', { name: 'Acesso em Design do produto' }).selectOption('write');
    await page.route('**/rest/v1/rpc/activate_integration_consent', route =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'PT503', message: 'temporarily_unavailable' }) }),
    );
    await page.getByRole('button', { name: 'Permitir acesso' }).click();
    await expect(page.getByRole('alert')).toContainText('Não foi possível confirmar');
    const connections = await human.rpc('list_integration_connections');
    expect(connections.error).toBeNull();
    const connection = connections.data.items.find((c: { clientId: string }) => c.clientId === flow.clientId);
    expect(connection.status).toBe('revoked');
    const agents = await human.rpc('read_operation', { p_workspace_id: workspace, p_operation: 'list_agents' });
    expect(agents.error).toBeNull();
    expect(agents.data.items.filter((a: { clientId: string }) => a.clientId === flow.clientId)).toHaveLength(0);
  });
  test('two tabs with the same request preserve the first read selection when the write tab fails', async ({ page, context }) => {
    const flow = await request('Consentimento entre abas');
    await page.goto(flow.consentUrl);
    await login(page);
    await expect(page.getByRole('heading', { name: 'Conectar Consentimento entre abas' })).toBeVisible();
    const second = await context.newPage();
    await second.goto(flow.consentUrl);
    await expect(second.getByRole('heading', { name: 'Conectar Consentimento entre abas' })).toBeVisible();
    await page.getByRole('checkbox', { name: /Design do produto/ }).check();
    await second.getByRole('checkbox', { name: /Design do produto/ }).check();
    await second.getByRole('combobox', { name: 'Acesso em Design do produto' }).selectOption('write');
    let releaseApproval = () => {},
      signalApproval = () => {};
    const reached = new Promise<void>(resolve => {
      signalApproval = resolve;
    });
    const release = new Promise<void>(resolve => {
      releaseApproval = resolve;
    });
    await page.route('**/auth/v1/oauth/authorizations/*/consent', async route => {
      signalApproval();
      await release;
      await route.continue();
    });
    try {
      await page.getByRole('button', { name: 'Permitir acesso' }).click();
      await reached;
      await second.getByRole('button', { name: 'Permitir acesso' }).click();
      await expect(second.getByRole('alert')).toContainText('Não foi possível confirmar');
      releaseApproval();
      await page.waitForURL(/\/callback\?code=/);
      const callback = new URL(page.url());
      expect(callback.searchParams.get('state')).toBe(flow.state);
      const exchange = await fetch(`${base}/auth/v1/oauth/token`, {
        method: 'POST',
        headers: { apikey: key, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: flow.clientId,
          redirect_uri: 'http://127.0.0.1:5180/callback',
          code: callback.searchParams.get('code')!,
          code_verifier: flow.verifier,
        }),
      });
      expect(exchange.status).toBe(200);
      const tokens = await exchange.json();
      const connections = await human.rpc('list_integration_connections');
      expect(connections.error).toBeNull();
      const connection = connections.data.items.find((c: { clientId: string }) => c.clientId === flow.clientId);
      expect(connection.status).toBe('active');
      expect(connection.grants).toEqual([{ workspaceId: workspace, workspaceName: 'Design do produto', capability: 'read' }]);
      const agents = await human.rpc('read_operation', { p_workspace_id: workspace, p_operation: 'list_agents' });
      expect(agents.data.items.filter((a: { clientId: string }) => a.clientId === flow.clientId)).toHaveLength(0);
      const denied = await fetch(`${base}/rest/v1/rpc/execute_operation`, {
        method: 'POST',
        headers: { apikey: key, authorization: `Bearer ${tokens.access_token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          p_workspace_id: workspace,
          p_operation: 'create_task',
          p_command: { projectId: 'unused', title: 'Denied write' },
          p_idempotency_key: crypto.randomUUID(),
        }),
      });
      expect(denied.status).toBe(403);
      await denied.body?.cancel();
    } finally {
      releaseApproval();
      await second.close();
    }
  });
  test('lost activation response cannot cancel committed access and explicit revoke still works', async ({ page }) => {
    const flow = await request('Resposta de ativação perdida');
    await page.goto(flow.consentUrl);
    await login(page);
    await expect(page.getByRole('heading', { name: 'Conectar Resposta de ativação perdida' })).toBeVisible();
    await page.getByRole('checkbox', { name: /Design do produto/ }).check();
    await page.route('**/rest/v1/rpc/activate_integration_consent', async route => {
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'PT503', message: 'temporarily_unavailable' }) });
    });
    await page.getByRole('button', { name: 'Permitir acesso' }).click();
    await expect(page.getByRole('alert')).toContainText('Não foi possível confirmar');
    await expect(page.getByRole('alert')).toContainText('Confira o acesso em Conexões');
    await expect(page.getByRole('link', { name: 'Ver conexões', exact: true })).toHaveAttribute('href', '/integrations');
    const connections = await human.rpc('list_integration_connections');
    expect(connections.error).toBeNull();
    expect(connections.data.items.find((c: { clientId: string }) => c.clientId === flow.clientId).status).toBe('active');
    await page.goto('/integrations');
    const connection = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Resposta de ativação perdida', exact: true }) });
    await expect(connection.getByText('Conectado', { exact: true })).toBeVisible();
    await connection.getByRole('button', { name: 'Revogar acesso' }).click();
    await expect(connection.getByText('Revogado', { exact: true })).toBeVisible();
  });
});
