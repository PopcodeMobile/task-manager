import { test, expect, type Page } from '@playwright/test';
const userId = '11111111-1111-4111-8111-111111111111',
  workspace = '22222222-2222-4222-8222-222222222222',
  other = '33333333-3333-4333-8333-333333333333';
const token = [
  { alg: 'HS256', typ: 'JWT' },
  { sub: userId, session_id: '44444444-4444-4444-8444-444444444444', role: 'authenticated', exp: 4102444800 },
  'signature',
]
  .map(x => (typeof x === 'string' ? x : Buffer.from(JSON.stringify(x)).toString('base64url')))
  .join('.');
const user = {
  id: userId,
  email: 'supervisor@example.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: { provider: 'email' },
  user_metadata: { name: 'Rafa Costa' },
  created_at: '2026-10-20T00:00:00Z',
};
const session = { access_token: token, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user };
const baseTask = {
  id: 'task-1',
  workspaceId: workspace,
  projectId: 'project-1',
  key: 'WEB-1',
  title: 'Revisar navegação',
  description: '<p>Pesquisa com <strong>clientes</strong></p><img src=x onerror=alert(1)>',
  status: 'todo',
  priority: 'high',
  version: 1,
  assigneeUserId: userId,
  executorAgentId: null,
  reservation: null,
  recurrence: null,
  dueDate: '2026-10-24',
  startDate: null,
  sortOrder: 0,
  archived: false,
  legacyMetadata: {},
  createdAt: '2026-10-20T00:00:00Z',
  updatedAt: '2026-10-20T00:00:00Z',
};
async function fixture(page: Page) {
  let tasks: Record<string, unknown>[] = [{ ...baseTask }],
    comments: Record<string, unknown>[] = [],
    conflict = false,
    offline = false,
    late = false,
    writeOffline = false,
    eventOffline = false;
  const taskLabels: Record<string, unknown>[] = [];
  let reachedLate = () => {},
    releaseLate = () => {},
    finishedLate = () => {};
  let lateArrived = Promise.resolve(),
    lateGate = Promise.resolve(),
    lateFinished = Promise.resolve();
  const commands: Record<string, unknown>[] = [],
    events: Record<string, unknown>[] = [];
  await page.route('**/auth/v1/**', route =>
    route.fulfill({ json: route.request().url().includes('/token') ? session : route.request().url().includes('/logout') ? {} : user }),
  );
  await page.route('**/rest/v1/rpc/**', async route => {
    const name = route.request().url().split('/').pop(),
      body = route.request().postDataJSON() ?? {},
      op = body.p_operation;
    if (eventOffline && op === 'list_domain_events') return route.abort('failed');
    if (offline && op === 'list_tasks') return route.abort('failed');
    const delayed = late && body.p_workspace_id === other && op === 'list_tasks';
    if (delayed) {
      late = false;
      reachedLate();
      await lateGate;
    }
    if (name === 'execute_operation') {
      if (writeOffline) return route.abort('failed');
      commands.push(body);
      if (conflict) {
        conflict = false;
        tasks = tasks.map(t => ({ ...t, version: Number(t.version) + 1 }));
        return route.fulfill({ status: 409, json: { code: 'PT409', message: 'version_conflict' } });
      }
      const input = body.p_command;
      let data: Record<string, unknown> = {};
      if (op === 'create_task') {
        data = { ...baseTask, ...input, id: input.id ?? 'created', key: 'WEB-2' };
        tasks.push(data);
      }
      if (op === 'update_task' || op === 'intervene_task' || op === 'complete_task')
        tasks = tasks.map(t => {
          if (t.id !== input.id) return t;
          data = {
            ...t,
            ...input,
            version: Number(t.version) + 1,
            ...(op === 'intervene_task' ? { executorAgentId: input.executorAgentId ?? null, reservation: null } : {}),
            ...(op === 'complete_task' ? { status: 'done' } : {}),
          };
          return data;
        });
      if (op === 'add_task_comment') {
        data = { ...input, id: 'comment-1', authorUserId: userId, version: 1, createdAt: '2026-10-20T00:00:00Z' };
        comments.push(data);
      }
      if (op === 'set_task_label') {
        taskLabels.push({ taskId: input.id, labelId: input.labelId });
        tasks = tasks.map(t => (t.id === input.id ? { ...t, version: Number(t.version) + 1 } : t));
      }
      if (op === 'delete_comment') comments = comments.filter(c => c.id !== input.id);
      if (op === 'delete_task') tasks = tasks.filter(t => t.id !== input.id);
      events.push({
        id: `event-${events.length}`,
        operation: op,
        entityId: input.id ?? 'task-1',
        actorUserId: userId,
        createdAt: new Date().toISOString(),
        payload: { taskId: 'task-1' },
      });
      return route.fulfill({ json: { data, eventId: `event-${events.length}` } });
    }
    let data: unknown = { items: [], nextCursor: null };
    if (name === 'list_workspace_members') data = [{ user_id: userId, name: 'Rafa Costa', email: user.email, role: 'owner' }];
    if (op === 'list_workspaces')
      data = {
        items: [
          { id: workspace, name: 'Gr8r Studio', role: 'owner', storageVersion: 2 },
          { id: other, name: 'Outro espaço', role: 'owner', storageVersion: 2 },
        ],
        nextCursor: null,
      };
    if (op === 'get_preferences') data = { data: null };
    if (op === 'list_projects')
      data = {
        items: [
          {
            id: 'project-1',
            workspaceId: body.p_workspace_id,
            name: 'Redesign do site',
            description: 'Experiência do produto',
            status: 'active',
            version: 1,
            key: 'WEB',
            archived: false,
            legacyMetadata: {},
          },
        ],
        nextCursor: null,
      };
    if (op === 'list_tasks')
      data = {
        items: body.p_workspace_id === other ? [{ ...baseTask, id: 'other-task', title: 'Tarefa do outro espaço', workspaceId: other }] : tasks,
        nextCursor: null,
      };
    if (op === 'get_task') data = { data: tasks.find(t => t.id === body.p_query.id) };
    if (op === 'list_labels') data = { items: [{ id: 'detail-label', name: 'Recovered label', version: 1 }], nextCursor: null };
    if (op === 'list_task_labels') data = { items: taskLabels, nextCursor: null };
    if (op === 'list_comments') data = { items: comments, nextCursor: null };
    if (op === 'list_agents') data = { items: [{ id: 'agent-1', name: 'Assistente de produto', authUserId: userId, clientId: 'client-1' }], nextCursor: null };
    if (op === 'list_domain_events' || op === 'list_task_activity') data = { items: body.p_query?.cursor ? [] : events, nextCursor: null };
    if (name === 'list_integration_connections') data = { items: [] };
    if (name === 'list_webhook_subscriptions') data = [];
    try {
      await route.fulfill({ json: data });
    } finally {
      if (delayed) finishedLate();
    }
  });
  return {
    commands,
    eventOffline: (value: boolean) => {
      eventOffline = value;
    },
    writeOffline: (value: boolean) => {
      writeOffline = value;
    },
    conflict: () => {
      conflict = true;
    },
    offline: (value: boolean) => {
      offline = value;
    },
    late: () => {
      late = true;
      lateArrived = new Promise<void>(resolve => {
        reachedLate = resolve;
      });
      lateGate = new Promise<void>(resolve => {
        releaseLate = resolve;
      });
      lateFinished = new Promise<void>(resolve => {
        finishedLate = resolve;
      });
    },
    waitLate: () => lateArrived,
    releaseLate: async () => {
      releaseLate();
      await lateFinished;
    },
    external: () => {
      events.push({
        id: 'external',
        operation: 'update_task',
        entityId: 'task-1',
        actorAgentId: 'agent-1',
        createdAt: new Date().toISOString(),
        payload: { taskId: 'task-1' },
      });
      tasks[0] = { ...tasks[0], title: 'Atualizada pelo MCP', version: 8 };
    },
    claim: () => {
      tasks[0] = {
        ...tasks[0],
        executorAgentId: 'agent-1',
        reservation: { agentId: 'agent-1', claimedAt: '2026-10-20T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', active: true },
      };
    },
  };
}
async function login(page: Page) {
  await page.goto('/app');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tarefas', exact: true })).toBeVisible();
}
test('login, workspace, create, edit, board, drawer, comment and agent supervision', async ({ page }) => {
  const f = await fixture(page);
  await login(page);
  await expect(page.getByText('Revisar navegação', { exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'A fazer', exact: true }).getByRole('columnheader')).toHaveCount(10);
  await expect(page.getByRole('table', { name: 'A fazer', exact: true }).getByRole('cell')).toHaveCount(10);
  await page.getByRole('button', { name: 'Nova tarefa', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Publicar pesquisa');
  await page.getByRole('button', { name: 'Criar tarefa', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Título', { exact: true }).fill('Publicar pesquisa revisada');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await page.getByLabel('Comentário', { exact: true }).fill('Revisão pronta');
  await page.getByRole('button', { name: 'Comentar', exact: true }).click();
  await expect(page.getByText('Revisão pronta', { exact: true })).toBeVisible();
  await page.getByLabel('Agente executor').selectOption('agent-1');
  await page.getByRole('button', { name: 'Atribuir agente' }).click();
  await expect(page.getByText('Atribuído, sem reserva ativa')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await page.getByRole('link', { name: 'Quadro', exact: true }).click();
  await expect(page.locator('.task-board')).toBeVisible();
  await expect(page.getByText('Publicar pesquisa revisada', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/task5-board-light-pt.png', fullPage: true });
  await page.reload();
  await expect(page.locator('.task-board')).toBeVisible();
  expect(f.commands.some(c => c.p_operation === 'intervene_task')).toBeTruthy();
});
test('active reservation blocks completion and explicit human resume is audited', async ({ page }) => {
  const f = await fixture(page);
  f.claim();
  await login(page);
  await page.getByText('Revisar navegação', { exact: true }).click();
  await expect(page.getByText('Execução reservada')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Concluir tarefa', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retomar controle humano' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.screenshot({ path: '/tmp/task5-alert-resume.png', fullPage: true });
  await page.getByRole('button', { name: 'Confirmar retomada' }).click();
  await expect(page.getByText('Sem agente executor')).toBeVisible();
  expect(f.commands.find(c => c.p_operation === 'intervene_task')?.p_command).toMatchObject({ action: 'release' });
});
test('version conflict keeps draft, network failure retries, safe rich text and empty personal preferences', async ({ page }) => {
  const f = await fixture(page);
  await login(page);
  await expect(page.getByTestId('favorite-count')).toHaveText('0');
  await page.getByText('Revisar navegação', { exact: true }).click();
  await expect(page.locator('.rich-content strong')).toHaveText('clientes');
  await expect(page.locator('.rich-content [onerror]')).toHaveCount(0);
  await page.getByLabel('Título', { exact: true }).fill('Meu rascunho');
  f.conflict();
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('alert')).toContainText('mudou');
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Meu rascunho');
  await page.getByRole('button', { name: 'Recarregar versão e descartar rascunho' }).click();
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  f.offline(true);
  await page.getByRole('button', { name: 'Atualizar dados' }).click();
  await expect(page.getByRole('alert')).toContainText('conexão');
  f.offline(false);
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Revisar navegação', { exact: true })).toBeVisible();
});
test('workspace switch and logout cannot hydrate delayed identity results', async ({ page }) => {
  const f = await fixture(page);
  await login(page);
  f.late();
  await page.getByLabel('Organização', { exact: true }).selectOption(other);
  await f.waitLate();
  await page.getByLabel('Organização', { exact: true }).selectOption(workspace);
  await f.releaseLate();
  await expect(page.getByText('Revisar navegação', { exact: true })).toBeVisible();
  await expect(page.getByText('Tarefa do outro espaço', { exact: true })).toHaveCount(0);
  f.late();
  await page.getByLabel('Organização', { exact: true }).selectOption(other);
  await f.waitLate();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entre pra continuar' })).toBeVisible();
  await f.releaseLate();
  await expect(page.getByText('Tarefa do outro espaço', { exact: true })).toHaveCount(0);
});
test('MCP activity polling invalidates without reload; light dark PT EN mobile visual evidence', async ({ page }) => {
  const f = await fixture(page);
  await login(page);
  await page.screenshot({ path: '/tmp/task5-desktop-light-pt.png', fullPage: true });
  f.external();
  await expect(page.getByText('Atualizada pelo MCP', { exact: true })).toBeVisible({ timeout: 18000 });
  await page.getByRole('link', { name: 'Atividade', exact: true }).click();
  await expect(page.getByText('Agente alterou a tarefa', { exact: false })).toBeVisible();
  await page.getByLabel('Idioma').selectOption('en');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await page.screenshot({ path: '/tmp/task5-desktop-dark-en.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/task5-mobile-dark-en.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.getByLabel('Language').selectOption('pt-BR');
  await page.screenshot({ path: '/tmp/task5-mobile-light-pt.png', fullPage: true });
});
test('signup verification and neutral password reset preserve the consent destination', async ({ page }) => {
  await fixture(page);
  let signup: Record<string, unknown> | null = null;
  await page.route('**/auth/v1/signup**', route => {
    signup = route.request().postDataJSON();
    return route.fulfill({ json: { user, session: null } });
  });
  await page.route('**/auth/v1/recover**', route => route.fulfill({ json: {} }));
  await page.goto('/oauth/consent?authorization_id=pending-request');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await page.getByLabel('Nome completo').fill('Rafa Costa');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('password-with-123');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
  expect(signup).toMatchObject({ data: { name: 'Rafa Costa' } });
  await expect(page).toHaveURL(/authorization_id=pending-request/);
  await page.getByRole('button', { name: 'Voltar para entrar' }).click();
  await page.getByRole('button', { name: 'Esqueceu a senha?' }).click();
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByRole('button', { name: 'Enviar link de recuperação' }).click();
  await expect(page.getByText('Se esta conta existir, o link de recuperação chegará em instantes.')).toBeVisible();
});
test.describe('real normalized backend', () => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, 'Requires dedicated local Supabase credentials');
  test('validated JWT operations, agent lease, human intervention and safe activity', async ({ page }) => {
    const { createClient } = await import('@supabase/supabase-js');
    const base = process.env.TEST_SUPABASE_URL!,
      key = process.env.TEST_SUPABASE_ANON_KEY!,
      secret = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;
    const service = createClient(base, secret, { auth: { persistSession: false, autoRefreshToken: false } }),
      human = createClient(base, key, { auth: { persistSession: false } }),
      executor = createClient(base, key, { auth: { persistSession: false } });
    const suffix = crypto.randomUUID(),
      email = `task5-ui-${suffix}@example.test`,
      password = `Task5-${crypto.randomUUID()}!`;
    const users: string[] = [],
      workspaceIds: string[] = [];
    let ws = '';
    try {
      for (const address of [email, `executor-${suffix}@example.test`]) {
        const result = await service.auth.admin.createUser({ email: address, password, email_confirm: true });
        expect(!!result.error).toBeFalsy();
        users.push(result.data.user!.id);
      }
      const signed = await human.auth.signInWithPassword({ email, password });
      expect(!!signed.error).toBeFalsy();
      const er = await executor.auth.signInWithPassword({ email: `executor-${suffix}@example.test`, password });
      expect(!!er.error).toBeFalsy();
      const created = await human.rpc('create_workspace_v2', { p_name: 'Supervisão real', p_slug: `task5-${suffix}`, p_idempotency_key: suffix });
      expect(!!created.error).toBeFalsy();
      ws = created.data.data.id;
      workspaceIds.push(ws);
      expect(!!(await service.from('workspace_memberships').insert({ workspace_id: ws, user_id: users[1], role: 'member' })).error).toBeFalsy();
      expect(!!(await service.from('agents').insert({ workspace_id: ws, id: 'real-agent', name: 'Agente real', auth_user_id: users[1] })).error).toBeFalsy();
      async function command(client: typeof human, operation: string, input: Record<string, unknown>, version?: number) {
        const result = await client.rpc('execute_operation', {
          p_workspace_id: ws,
          p_operation: operation,
          p_command: input,
          p_expected_version: version ?? null,
          p_idempotency_key: crypto.randomUUID(),
        });
        expect(!!result.error).toBeFalsy();
        return result.data.data;
      }
      const project = await command(human, 'create_project', { name: 'Projeto real' });
      const task = await command(human, 'create_task', { projectId: project.id, title: 'Execução real' });
      await command(executor, 'claim_task', { id: task.id }, task.version);
      await page.goto(`/app/w/${ws}/tasks`);
      await page.getByLabel('E-mail').fill(email);
      await page.getByLabel('Senha', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.getByText('Execução real', { exact: true }).click();
      await expect(page.getByText('Execução reservada')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Concluir tarefa', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: 'Retomar controle humano' }).click();
      await page.getByRole('button', { name: 'Confirmar retomada' }).click();
      await expect(page.getByText('Sem agente executor')).toBeVisible();
      await page.getByLabel('Comentário', { exact: true }).fill('Decisão humana registrada');
      await page.getByRole('button', { name: 'Comentar', exact: true }).click();
      await expect(page.getByText('Decisão humana registrada', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Concluir tarefa', exact: true }).click();
      const read = await human.rpc('read_operation', { p_workspace_id: ws, p_operation: 'get_task', p_query: { id: task.id } });
      expect(read.data.data.status).toBe('done');
      expect(read.data.data.reservation).toBeNull();
      expect(JSON.stringify(read.data).includes('claimToken')).toBeFalsy();
      const events = await human.rpc('read_operation', { p_workspace_id: ws, p_operation: 'list_domain_events', p_query: { limit: 100 } });
      expect(events.data.items.some((event: { operation: string }) => event.operation === 'intervene_task')).toBeTruthy();
      await page.locator('.ui-sheet').evaluate(element => {
        element.scrollTop = 0;
      });
      await page.screenshot({ path: '/tmp/task5-real-backend-drawer.png', fullPage: true });
      await page.getByRole('button', { name: 'Fechar painel' }).click();
      await page.getByRole('button', { name: 'Criar organização', exact: true }).click();
      await page.getByLabel('Nome da organização').fill('Segundo espaço real');
      await page.getByRole('button', { name: 'Criar organização', exact: true }).click();
      await expect(page.getByText('Nenhuma tarefa por aqui')).toBeVisible();
      const secondWorkspace = new URL(page.url()).pathname.split('/')[3];
      workspaceIds.push(secondWorkspace);
      expect(secondWorkspace !== ws).toBeTruthy();
      await page.reload();
      await expect(page.getByText('Nenhuma tarefa por aqui')).toBeVisible();
      await expect(page.getByLabel('Organização', { exact: true })).toHaveValue(secondWorkspace);
      await page.getByLabel('Organização', { exact: true }).selectOption(ws);
      await expect(page.getByText('Execução real', { exact: true })).toBeVisible();
      await command(human, 'update_task', { id: task.id, title: 'Atualização externa real' }, read.data.data.version);
      await expect(page.getByText('Atualização externa real', { exact: true })).toBeVisible({ timeout: 18000 });
      await page.screenshot({ path: '/tmp/task5-real-polling.png', fullPage: true });
    } finally {
      for (const id of workspaceIds) expect(!!(await service.from('workspaces').delete().eq('id', id)).error).toBeFalsy();
      for (const id of users) await service.auth.admin.deleteUser(id);
      await human.auth.signOut();
      await executor.auth.signOut();
    }
  });
});

test('failed draft flush retains drawer and prevents navigation until retry succeeds', async ({ page }) => {
  const f = await fixture(page);
  await login(page);
  await page.getByText('Revisar navegação', { exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Rascunho preservado');
  f.writeOffline(true);
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('conexão');
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Rascunho preservado');
  f.writeOffline(false);
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Rascunho preservado', { exact: true })).toBeVisible();
});

test('recovery validates matching passwords and returns to the preserved destination', async ({ page }) => {
  await fixture(page);
  let callbackUrl = '';
  await page.route('**/auth/v1/recover**', route => {
    callbackUrl = new URL(route.request().url()).searchParams.get('redirect_to')!;
    return route.fulfill({ json: {} });
  });
  let updated = false;
  await page.route('**/auth/v1/user', route => {
    if (route.request().method() === 'PUT') updated = true;
    return route.fulfill({ json: user });
  });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Esqueceu a senha?' }).click();
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByRole('button', { name: 'Enviar link de recuperação' }).click();
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
  const callback = new URL(callbackUrl);
  callback.searchParams.set('code', 'fixture-recovery');
  await page.goto(callback.href);
  await expect(page.getByRole('heading', { name: 'Escolha uma nova senha' })).toBeVisible();
  await page.getByLabel('Nova senha').fill('new-password-123');
  await page.getByLabel('Confirme a senha').fill('different-password-123');
  await page.getByRole('button', { name: 'Atualizar senha' }).click();
  await expect(page.getByRole('alert')).toContainText('não coincidem');
  expect(updated).toBeFalsy();
  await page.getByLabel('Confirme a senha').fill('new-password-123');
  await page.getByRole('button', { name: 'Atualizar senha' }).click();
  await expect(page.getByRole('heading', { name: 'Tarefas', exact: true })).toBeVisible();
  expect(updated).toBeTruthy();
});

test('explicit task deletion uses current CAS and confirmation', async ({ page }) => {
  const f = await fixture(page);
  await login(page);
  await page.getByText('Revisar navegação', { exact: true }).click();
  await page.getByRole('button', { name: 'Excluir tarefa', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect(page.getByText('Revisar navegação', { exact: true })).toHaveCount(0);
  expect(f.commands.find(c => c.p_operation === 'delete_task')?.p_expected_version).toBe(1);
});

test('browser back keeps an unsaved draft when its flush fails', async ({ page }) => {
  const f = await fixture(page);
  await login(page);
  await page.getByText('Revisar navegação', { exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Rascunho no histórico');
  f.writeOffline(true);
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Rascunho no histórico');
  await expect(page.getByRole('alert')).toContainText('conexão');
});

test('an event committed during initial hydration cannot be skipped by the polling cursor', async ({ page }) => {
  const f = await fixture(page);
  let reached = () => {},
    release = () => {};
  const arrived = new Promise<void>(resolve => {
      reached = resolve;
    }),
    gate = new Promise<void>(resolve => {
      release = resolve;
    });
  let held = false;
  await page.route('**/rest/v1/rpc/read_operation', async route => {
    if (route.request().postDataJSON().p_operation === 'list_domain_events' && !held) {
      held = true;
      reached();
      await gate;
    }
    await route.fallback();
  });
  await login(page);
  await arrived;
  f.external();
  release();
  await expect(page.getByText('Atualizada pelo MCP', { exact: true })).toBeVisible({ timeout: 1500 });
});

test('same-session token rotation preserves dirty draft, original CAS and failed-command retry identity', async ({ page }) => {
  const f = await fixture(page);
  await login(page);
  await page.getByText('Revisar navegação', { exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Rascunho após rotação');
  const attempts: Record<string, unknown>[] = [];
  let fail = true;
  await page.route('**/rest/v1/rpc/execute_operation', async route => {
    attempts.push(route.request().postDataJSON());
    if (fail) {
      fail = false;
      await route.abort('failed');
    } else await route.fallback();
  });
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('alert')).toContainText('conexão');
  const rotate = async (sessionId: string, identity = user) => {
    const access = [
      { alg: 'HS256', typ: 'JWT' },
      { sub: identity.id, session_id: sessionId, role: 'authenticated', exp: 4102444800, iat: Date.now() },
      'signature',
    ]
      .map(x => (typeof x === 'string' ? x : Buffer.from(JSON.stringify(x)).toString('base64url')))
      .join('.');
    await page.route('**/auth/v1/token?grant_type=refresh_token', route =>
      route.fulfill({ json: { ...session, user: identity, access_token: access, refresh_token: 'rotated-refresh' } }),
    );
    await page.evaluate(async () => {
      const path = '/src/app/integrations/client.ts';
      const { supabase } = await import(path);
      await supabase.auth.refreshSession();
    });
  };
  await rotate('44444444-4444-4444-8444-444444444444');
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Rascunho após rotação');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(attempts).toHaveLength(2);
  expect(attempts[1].p_idempotency_key === attempts[0].p_idempotency_key).toBeTruthy();
  expect(attempts[1].p_expected_version).toBe(1);
  expect(f.commands.at(-1)?.p_operation).toBe('update_task');
  await page.getByLabel('Título', { exact: true }).fill('Não transferir para nova sessão');
  await rotate('55555555-5555-4555-8555-555555555555');
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Rascunho após rotação');
  await page.getByLabel('Título', { exact: true }).fill('Não transferir para outra pessoa');
  await rotate('66666666-6666-4666-8666-666666666666', {
    ...user,
    id: '77777777-7777-4777-8777-777777777777',
    email: 'other@example.test',
    user_metadata: { name: 'Outra pessoa' },
  });
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Rascunho após rotação');
});

test('actual OAuth MCP agent write reaches already-open task and agent activity by polling', async ({ page }) => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, 'Requires dedicated local Auth and Edge MCP');
  test.setTimeout(60000);
  const { createClient } = await import('@supabase/supabase-js');
  const base = process.env.TEST_SUPABASE_URL!,
    key = process.env.TEST_SUPABASE_ANON_KEY!;
  const service = createClient(base, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }),
    human = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = crypto.randomUUID(),
    email = `task5-mcp-${suffix}@example.test`,
    password = `Task5-${crypto.randomUUID()}!`;
  let uid = '',
    ws = '',
    clientId = '',
    connectionId = '',
    taskId = '',
    failed = false;
  let mcp: import('@modelcontextprotocol/client').Client | undefined;
  const cleanupErrors: string[] = [];
  try {
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(!!created.error).toBeFalsy();
    uid = created.data.user!.id;
    expect(!!(await human.auth.signInWithPassword({ email, password })).error).toBeFalsy();
    const made = await human.rpc('create_workspace_v2', { p_name: 'MCP transport real', p_slug: `mcp-ui-${suffix}`, p_idempotency_key: suffix });
    expect(!!made.error).toBeFalsy();
    ws = made.data.data.id;
    const command = async (operation: string, input: Record<string, unknown>, version?: number) => {
      const result = await human.rpc('execute_operation', {
        p_workspace_id: ws,
        p_operation: operation,
        p_command: input,
        p_expected_version: version ?? null,
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(!!result.error).toBeFalsy();
      return result.data.data;
    };
    const project = await command('create_project', { name: 'Projeto MCP' }),
      task = await command('create_task', { projectId: project.id, title: 'Antes da ação MCP' });
    taskId = task.id;
    await page.goto(`/app/w/${ws}/tasks`);
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByText('Antes da ação MCP', { exact: true })).toBeVisible();
    let navigations = 0;
    page.on('request', request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
    });
    const registered = await fetch(`${base}/auth/v1/oauth/clients/register`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Agente MCP do painel',
        redirect_uris: ['http://127.0.0.1:5180/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
    });
    expect(registered.status).toBe(201);
    clientId = (await registered.json()).client_id;
    const verifier = crypto.randomUUID() + crypto.randomUUID(),
      state = crypto.randomUUID(),
      challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
    const authUrl = new URL(`${base}/auth/v1/oauth/authorize`);
    for (const [name, value] of Object.entries({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: 'http://127.0.0.1:5180/callback',
      scope: 'openid',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    }))
      authUrl.searchParams.set(name, value);
    const authorization = await fetch(authUrl, { redirect: 'manual' });
    expect(authorization.status).toBe(302);
    await authorization.body?.cancel();
    const authorizationId = new URL(authorization.headers.get('location')!).searchParams.get('authorization_id')!;
    const details = await human.auth.oauth.getAuthorizationDetails(authorizationId);
    expect(!!details.error).toBeFalsy();
    const prepared = await human.rpc('prepare_integration_consent', {
      p_authorization_id: authorizationId,
      p_grants: [{ workspaceId: ws, capability: 'write' }],
    });
    expect(!!prepared.error).toBeFalsy();
    connectionId = prepared.data.connectionId;
    const approved = await human.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
    expect(!!approved.error).toBeFalsy();
    const callback = new URL(approved.data!.redirect_url);
    expect(callback.searchParams.get('state')).toBe(state);
    expect(
      !!(await human.rpc('activate_integration_consent', { p_authorization_id: authorizationId, p_attempt_id: prepared.data.attemptId })).error,
    ).toBeFalsy();
    const exchanged = await fetch(`${base}/auth/v1/oauth/token`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: 'http://127.0.0.1:5180/callback',
        code: callback.searchParams.get('code')!,
        code_verifier: verifier,
      }),
    });
    expect(exchanged.status).toBe(200);
    const oauth = await exchanged.json();
    expect(typeof oauth.access_token === 'string').toBeTruthy();
    const { Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client');
    mcp = new Client({ name: 'task5-browser-acceptance', version: '1.0.0' });
    await mcp.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/functions/v1/mcp`), { requestInit: { headers: { authorization: `Bearer ${oauth.access_token}` } } }),
    );
    const claimed = await mcp.callTool({
      name: 'claim_task',
      arguments: { workspace_id: ws, idempotency_key: crypto.randomUUID(), expected_version: task.version, input: { id: task.id } },
    });
    expect(!!claimed.isError).toBeFalsy();
    const lease = (claimed.structuredContent as { data: { task: { version: number; executorAgentId: string }; claimToken: string } }).data;
    expect(typeof lease.claimToken === 'string').toBeTruthy();
    const changed = await mcp.callTool({
      name: 'update_task',
      arguments: {
        workspace_id: ws,
        idempotency_key: crypto.randomUUID(),
        expected_version: lease.task.version,
        input: { id: task.id, title: 'Alterada pelo MCP real', claimToken: lease.claimToken },
      },
    });
    expect(!!changed.isError).toBeFalsy();
    await expect(page.getByText('Alterada pelo MCP real', { exact: true })).toBeVisible({ timeout: 18000 });
    await page.screenshot({ path: '/tmp/task5-r1-real-mcp-task.png', fullPage: true });
    await page.getByRole('button', { name: /Alterada pelo MCP real/ }).click();
    await expect(page.getByLabel('Comentário', { exact: true })).toBeEnabled();
    const discussion = await mcp.callTool({
      name: 'add_task_comment',
      arguments: {
        workspace_id: ws,
        idempotency_key: crypto.randomUUID(),
        input: { taskId: task.id, body: 'Comentário externo pelo MCP real' },
      },
    });
    expect(!!discussion.isError).toBeFalsy();
    await expect(page.locator('article.comment .rich-content').filter({ hasText: 'Comentário externo pelo MCP real' })).toBeVisible({ timeout: 18000 });
    await page.getByRole('button', { name: 'Fechar painel', exact: true }).click();
    await page.getByRole('link', { name: 'Atividade', exact: true }).click();
    await expect(page.getByText('Agente alterou a tarefa', { exact: false })).toBeVisible({ timeout: 1500 });
    expect(navigations).toBe(0);
    const audit = await human.rpc('read_operation', { p_workspace_id: ws, p_operation: 'list_domain_events', p_query: { limit: 100 } });
    expect(!!audit.error).toBeFalsy();
    expect(
      audit.data.items.some(
        (event: { operation: string; actorAgentId: string; actorClientId: string }) =>
          event.operation === 'update_task' && event.actorAgentId === lease.task.executorAgentId && event.actorClientId === clientId,
      ),
    ).toBeTruthy();
    await page.screenshot({ path: '/tmp/task5-r1-real-mcp-activity.png', fullPage: true });
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    const clean = async (name: string, run: () => Promise<unknown>) => {
      try {
        await run();
      } catch {
        cleanupErrors.push(name);
      }
    };
    await clean('mcp-close', async () => {
      await mcp?.close();
    });
    if (ws && taskId)
      await clean('human-release', async () => {
        const current = await human.rpc('read_operation', { p_workspace_id: ws, p_operation: 'get_task', p_query: { id: taskId } });
        if (current.error) throw new Error('read_failed');
        if (current.data.data.executorAgentId || current.data.data.reservation) {
          const released = await human.rpc('execute_operation', {
            p_workspace_id: ws,
            p_operation: 'intervene_task',
            p_command: { id: taskId, action: 'release' },
            p_expected_version: current.data.data.version,
            p_idempotency_key: crypto.randomUUID(),
          });
          if (released.error) throw new Error('release_failed');
        }
      });
    if (connectionId)
      await clean('connection', async () => {
        if ((await human.rpc('revoke_integration_connection', { p_connection_id: connectionId })).error) throw new Error('revoke_failed');
      });
    if (clientId)
      await clean('oauth-client', async () => {
        if ((await service.auth.admin.oauth.deleteClient(clientId)).error) throw new Error('delete_failed');
      });
    if (ws)
      await clean('workspace', async () => {
        if ((await service.from('workspaces').delete().eq('id', ws)).error) throw new Error('delete_failed');
      });
    if (uid)
      await clean('user', async () => {
        if ((await service.auth.admin.deleteUser(uid)).error) throw new Error('delete_failed');
      });
    await clean('sign-out', async () => {
      await human.auth.signOut();
    });
    if (cleanupErrors.length && failed) test.info().annotations.push({ type: 'fixture-cleanup', description: cleanupErrors.join(', ') });
  }
  if (cleanupErrors.length) throw new Error('Fixture cleanup failed: ' + cleanupErrors.join(', '));
});
test('actual cloud task views follow cursors, keep atomic CAS/claim guards and require saving dirty actions', async ({ page }) => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, 'Requires dedicated local Supabase');
  test.setTimeout(90000);
  const { createClient } = await import('@supabase/supabase-js');
  const base = process.env.TEST_SUPABASE_URL!,
    key = process.env.TEST_SUPABASE_ANON_KEY!;
  const service = createClient(base, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }),
    human = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    executor = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const builder = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = crypto.randomUUID(),
    email = `task6b1-${suffix}@example.test`,
    agentEmail = `task6b1-executor-${suffix}@example.test`,
    builderEmail = `task6b1-setup-${suffix}@example.test`,
    password = `Task6b1-${crypto.randomUUID()}!`,
    users: string[] = [];
  let ws = '';
  const cleanupErrors: string[] = [];
  try {
    for (const address of [email, agentEmail, builderEmail]) {
      const result = await service.auth.admin.createUser({ email: address, password, email_confirm: true });
      expect(!!result.error).toBe(false);
      users.push(result.data.user!.id);
    }
    expect(!!(await human.auth.signInWithPassword({ email, password })).error).toBe(false);
    expect(!!(await executor.auth.signInWithPassword({ email: agentEmail, password })).error).toBe(false);
    expect(!!(await builder.auth.signInWithPassword({ email: builderEmail, password })).error).toBe(false);
    const made = await human.rpc('create_workspace_v2', { p_name: 'Task views actual', p_slug: `task6b1-${suffix}`, p_idempotency_key: suffix });
    expect(!!made.error).toBe(false);
    ws = made.data.data.id;
    expect(!!(await service.from('workspace_memberships').insert({ workspace_id: ws, user_id: users[1], role: 'member' })).error).toBe(false);
    expect(!!(await service.from('agents').insert({ workspace_id: ws, id: 'views-agent', name: 'Views executor', auth_user_id: users[1] })).error).toBe(false);
    expect(!!(await service.from('workspace_memberships').insert({ workspace_id: ws, user_id: users[2], role: 'member' })).error).toBe(false);
    const command = async (operation: string, input: Record<string, unknown>, version?: number, client = human) => {
      const result = await client.rpc('execute_operation', {
        p_workspace_id: ws,
        p_operation: operation,
        p_command: input,
        p_expected_version: version ?? null,
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(!!result.error).toBe(false);
      return result.data.data;
    };
    const readTask = async (id: string) => {
      const result = await human.rpc('read_operation', { p_workspace_id: ws, p_operation: 'get_task', p_query: { id } });
      expect(!!result.error).toBe(false);
      return result.data.data;
    };
    const project = await command('create_project', { name: 'Task views project' }),
      second = await command('create_project', { name: 'Destination project' });
    const commands = Array.from({ length: 102 }, (_, i) => ({
      operation: 'create_task',
      input: { id: `views-task-${i}`, projectId: project.id, title: `Cloud task ${String(i).padStart(3, '0')}` },
    }));
    // A separate normal JWT actor owns setup cost; the observed human keeps its real 240-unit budget.
    await command('batch', { commands: commands.slice(0, 100) }, undefined, builder);
    await command('batch', { commands: commands.slice(100) }, undefined, builder);
    await page.goto(`/app/w/${ws}/tasks`);
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByLabel('Idioma', { exact: true }).selectOption('en');
    await expect(page.getByRole('button', { name: 'Cloud task 101' })).toBeVisible();
    await page.getByRole('link', { name: 'Table', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search tasks', exact: true }).fill('Cloud task 10');
    await page.getByRole('checkbox', { name: 'Select all visible tasks', exact: true }).check();
    await page.getByRole('combobox', { name: 'Bulk priority', exact: true }).selectOption('high');
    await expect(page.getByRole('combobox', { name: /Priority:.*$/, exact: false }).first()).toHaveValue('high');
    let a = await readTask('views-task-100'),
      b = await readTask('views-task-101');
    expect(a.priority).toBe('high');
    expect(b.priority).toBe('high');
    await command('update_task', { id: a.id, priority: 'low' }, a.version);
    await page.getByRole('checkbox', { name: 'Select all visible tasks', exact: true }).check();
    await page.getByRole('combobox', { name: 'Bulk priority', exact: true }).selectOption('urgent');
    await expect(page.getByRole('alert')).toContainText('Your draft was kept');
    expect((await readTask(b.id)).priority).toBe('high');
    await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Priority: ' + a.key, exact: true })).toHaveValue('low');
    await expect(page.getByRole('combobox', { name: 'Bulk priority', exact: true })).toBeEnabled();
    await page.getByRole('combobox', { name: 'Bulk priority', exact: true }).selectOption('urgent');
    await expect(page.getByRole('combobox', { name: 'Bulk priority', exact: true })).toHaveCount(0);
    a = await readTask(a.id);
    b = await readTask(b.id);
    expect(a.priority).toBe('urgent');
    expect(b.priority).toBe('urgent');
    const lease = await command('claim_task', { id: b.id }, b.version, executor);
    await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Priority: ' + b.key, exact: true })).toBeDisabled();
    await expect(page.getByText('Views executor', { exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Select all visible tasks', exact: true }).check();
    await page.getByRole('button', { name: 'Archive selected', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('explicitly resume human control');
    expect((await readTask(a.id)).archived).toBe(false);
    expect(await page.locator('body').textContent()).not.toContain(lease.claimToken);
    await page.getByRole('button', { name: 'Cloud task 101' }).click();
    await page.getByRole('textbox', { name: 'Description', exact: true }).fill('<p>Saved cloud draft</p><img src=x onerror=alert(1)>');
    await page.getByRole('button', { name: 'Resume human control', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Save changes before this action');
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Resume human control', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm resume', exact: true }).click();
    await expect(page.getByText('No executor agent', { exact: true })).toBeVisible();
    await page.getByLabel('Due date', { exact: true }).fill('2026-11-20');
    await page.getByRole('combobox', { name: 'Recurrence', exact: true }).selectOption('Weekly');
    await page.getByRole('button', { name: 'Complete task', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Save changes before this action');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Complete task', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('done');
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('done');
    await expect(page.getByLabel('Due date', { exact: true })).toHaveValue('2026-11-20');
    await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('<p>Saved cloud draft</p><img src=x onerror=alert(1)>');
    await expect(page.locator('.rich-content [onerror]')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Destination project', exact: true }).selectOption(second.id);
    await page.getByRole('button', { name: 'Move task', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Destination project', exact: true })).toHaveValue(second.id);
    await page.getByRole('button', { name: 'Duplicate task', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('todo');
    await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('<p>Saved cloud draft</p><img src=x onerror=alert(1)>');
    const cloneURL = page.url(),
      cloneId = new URL(cloneURL).searchParams.get('task')!;
    await page.getByRole('button', { name: 'Archive task', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Task details', exact: true })).toHaveCount(0);
    expect((await readTask(cloneId)).archived).toBe(true);
    await page.goto(cloneURL);
    await page.getByRole('button', { name: 'Restore task', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Task details', exact: true })).toHaveCount(0);
    expect((await readTask(cloneId)).archived).toBe(false);
    await page.reload();
    await page.screenshot({ path: '/tmp/task6b1-cloud-table.png', fullPage: true });
  } finally {
    if (ws) {
      const result = await service.from('workspaces').delete().eq('id', ws);
      if (result.error) cleanupErrors.push('workspace');
    }
    for (const id of users) {
      if ((await service.auth.admin.deleteUser(id)).error) cleanupErrors.push('user');
    }
    await human.auth.signOut();
    await executor.auth.signOut();
    await builder.auth.signOut();
  }
  if (cleanupErrors.length) throw Error('Fixture cleanup failed: ' + cleanupErrors.join(', '));
});

test('actual cloud task context menu completes, reopens and respects active reservations', async ({ page }) => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, 'Requires dedicated local Supabase');
  test.setTimeout(45000);
  const { createClient } = await import('@supabase/supabase-js');
  const base = process.env.TEST_SUPABASE_URL!,
    key = process.env.TEST_SUPABASE_ANON_KEY!;
  const service = createClient(base, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }),
    human = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    executor = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = crypto.randomUUID(),
    email = `task6b1-${suffix}@example.test`,
    agentEmail = `task6b1-executor-${suffix}@example.test`,
    password = `Task6b1-${crypto.randomUUID()}!`,
    users: string[] = [];
  let ws = '';
  const cleanupErrors: string[] = [];
  try {
    for (const address of [email, agentEmail]) {
      const result = await service.auth.admin.createUser({ email: address, password, email_confirm: true });
      expect(!!result.error).toBe(false);
      users.push(result.data.user!.id);
    }
    expect(!!(await human.auth.signInWithPassword({ email, password })).error).toBe(false);
    expect(!!(await executor.auth.signInWithPassword({ email: agentEmail, password })).error).toBe(false);
    const made = await human.rpc('create_workspace_v2', { p_name: 'Task views actual', p_slug: `task6b1-${suffix}`, p_idempotency_key: suffix });
    expect(!!made.error).toBe(false);
    ws = made.data.data.id;
    expect(!!(await service.from('workspace_memberships').insert({ workspace_id: ws, user_id: users[1], role: 'member' })).error).toBe(false);
    expect(!!(await service.from('agents').insert({ workspace_id: ws, id: 'views-agent', name: 'Views executor', auth_user_id: users[1] })).error).toBe(false);
    const command = async (operation: string, input: Record<string, unknown>, version?: number, client = human) => {
      const result = await client.rpc('execute_operation', {
        p_workspace_id: ws,
        p_operation: operation,
        p_command: input,
        p_expected_version: version ?? null,
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(!!result.error).toBe(false);
      return result.data.data;
    };
    const readTask = async (id: string) => {
      const result = await human.rpc('read_operation', { p_workspace_id: ws, p_operation: 'get_task', p_query: { id } });
      expect(!!result.error).toBe(false);
      return result.data.data;
    };
    const project = await command('create_project', { name: 'Menu project' });
    let task = await command('create_task', { projectId: project.id, title: 'Cloud menu task' });
    await page.goto(`/app/w/${ws}/tasks`);
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByLabel('Idioma', { exact: true }).selectOption('en');
    await page.getByRole('button', { name: task.key + ' Cloud menu task', exact: true }).click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Open task', exact: true })).toBeFocused();
    await page.getByRole('menuitem', { name: 'Complete task', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Status: ' + task.key, exact: true })).toHaveValue('done');
    await expect(page.getByRole('menu', { name: 'Task actions', exact: true })).toHaveCount(0);
    task = await readTask(task.id);
    expect(task.status).toBe('done');
    await page.getByRole('button', { name: task.key + ' Cloud menu task', exact: true }).focus();
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Reopen task', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Status: ' + task.key, exact: true })).toHaveValue('todo');
    await expect(page.getByRole('menu', { name: 'Task actions', exact: true })).toHaveCount(0);
    task = await readTask(task.id);
    expect(task.status).toBe('todo');
    await command('claim_task', { id: task.id }, task.version, executor);
    await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Status: ' + task.key, exact: true })).toBeDisabled();
    await page.getByRole('button', { name: task.key + ' Cloud menu task', exact: true }).click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Complete task', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('menuitem', { name: 'Archive task', exact: true })).toHaveAttribute('aria-disabled', 'true');
    const claimed = await readTask(task.id);
    await page.getByRole('menuitem', { name: 'Complete task', exact: true }).focus();
    await page.keyboard.press('Enter');
    expect((await readTask(task.id)).version).toBe(claimed.version);
    await page.screenshot({ path: '/tmp/task6b1-context-cloud-claimed.png', fullPage: true });
    await page.getByRole('menuitem', { name: 'Open task', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resume human control', exact: true })).toBeEnabled();
  } finally {
    if (ws) {
      const claims = await service.from('task_claims').delete().eq('workspace_id', ws);
      if (claims.error) cleanupErrors.push('claims');
      const result = await service.from('workspaces').delete().eq('id', ws);
      if (result.error) cleanupErrors.push('workspace');
    }
    for (const id of users) {
      if ((await service.auth.admin.deleteUser(id)).error) cleanupErrors.push('user');
    }
    await human.auth.signOut();
    await executor.auth.signOut();
  }
  if (cleanupErrors.length) throw Error('Fixture cleanup failed: ' + cleanupErrors.join(', '));
});

test('actual cloud details persist canonical relations, personal stars, author reactions and protected claims', async ({ page }) => {
  const rpcCounts: Record<string, number> = {};
  page.on('response', response => {
    if (!response.url().includes('/rest/v1/rpc/')) return;
    const key = response.url().split('/').pop() + ':' + response.status();
    rpcCounts[key] = (rpcCounts[key] ?? 0) + 1;
  });
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, 'Requires dedicated local Supabase');
  test.setTimeout(45000);
  const { createClient } = await import('@supabase/supabase-js');
  const base = process.env.TEST_SUPABASE_URL!,
    key = process.env.TEST_SUPABASE_ANON_KEY!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(base, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, options),
    human = createClient(base, key, options),
    executor = createClient(base, key, options);
  const suffix = crypto.randomUUID(),
    email = `details-${suffix}@example.test`,
    agentEmail = `detail-agent-${suffix}@example.test`,
    password = `Details-${crypto.randomUUID()}!`,
    users: string[] = [];
  let ws = '';
  const cleanup: string[] = [];
  try {
    for (const address of [email, agentEmail]) {
      const made = await service.auth.admin.createUser({ email: address, password, email_confirm: true });
      expect(!!made.error).toBe(false);
      users.push(made.data.user!.id);
    }
    expect(!!(await human.auth.signInWithPassword({ email, password })).error).toBe(false);
    expect(!!(await executor.auth.signInWithPassword({ email: agentEmail, password })).error).toBe(false);
    const made = await human.rpc('create_workspace_v2', { p_name: 'Details actual', p_slug: `details-${suffix}`, p_idempotency_key: suffix });
    expect(!!made.error).toBe(false);
    ws = made.data.data.id;
    expect(!!(await service.from('workspace_memberships').insert({ workspace_id: ws, user_id: users[1], role: 'member' })).error).toBe(false);
    expect(!!(await service.from('agents').insert({ workspace_id: ws, id: 'details-agent', name: 'Details executor', auth_user_id: users[1] })).error).toBe(
      false,
    );
    const command = async (operation: string, input: Record<string, unknown>, version?: number, client = human) => {
      const result = await client.rpc('execute_operation', {
        p_workspace_id: ws,
        p_operation: operation,
        p_command: input,
        p_expected_version: version ?? null,
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(result.error?.message ?? '').toBe('');
      return result.data.data;
    };
    const read = async (operation: string, query = {}) => {
      const result = await human.rpc('read_operation', { p_workspace_id: ws, p_operation: operation, p_query: query });
      expect(result.error?.message ?? '').toBe('');
      return result.data;
    };
    const project = await command('create_project', { name: 'Details project' });
    const task = await command('create_task', { id: 'details-task', projectId: project.id, title: 'Cloud detail task' });
    await page.goto(`/app/w/${ws}/tasks`);
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByLabel('Idioma', { exact: true }).selectOption('en');
    await page.getByRole('button', { name: task.key + ' Cloud detail task', exact: true }).click();
    await page.getByLabel('New label', { exact: true }).fill('Cloud label');
    await page.getByRole('button', { name: 'Create and apply label', exact: true }).click();
    await expect(page.getByRole('dialog').getByLabel('Label: Cloud label', { exact: true })).toBeChecked();
    expect((await read('list_task_labels', { taskId: task.id })).items).toHaveLength(1);
    await page.getByLabel('New subtask', { exact: true }).fill('Cloud child');
    await page.getByRole('button', { name: 'Add subtask', exact: true }).click();
    await page.getByRole('button', { name: 'Subtask details: Cloud child', exact: true }).click();
    await page.getByLabel('Subtask notes', { exact: true }).fill('Canonical notes');
    await page.getByRole('button', { name: 'Save subtask', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Convert to task', exact: true })).toBeEnabled();
    expect((await read('list_subtasks', { taskId: task.id })).items[0].legacyMetadata.note).toBe('Canonical notes');
    await page.getByLabel('Metadata name', { exact: true }).fill('Cloud metadata.pdf');
    await page.getByRole('button', { name: 'Add metadata', exact: true }).click();
    await expect(page.getByText('Cloud metadata.pdf', { exact: true })).toBeVisible();
    expect((await read('list_attachments', { taskId: task.id })).items).toHaveLength(1);
    await page.getByLabel('Comment', { exact: true }).fill('<b>Cloud discussion</b><img src=x onerror="window.unsafeDetail=1">');
    await page.getByRole('button', { name: 'Post comment', exact: true }).click();
    const comment = page.locator('article.comment').filter({ hasText: 'Cloud discussion' });
    await expect(comment.locator('b')).toHaveText('Cloud discussion');
    await expect(comment.locator('[onerror]')).toHaveCount(0);
    await comment.getByRole('button', { name: 'React: 👍', exact: true }).click();
    await expect(comment.getByRole('button', { name: 'React: 👍', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect((await read('list_reactions')).items[0].userId).toBe(users[0]);
    await page.getByRole('button', { name: 'Add to favorites', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Remove from favorites', exact: true })).toBeVisible();
    expect((await read('get_preferences')).data.preferences.favoriteTaskIds).toContain(task.id);
    await page.reload();
    await expect(page.getByRole('dialog').getByLabel('Label: Cloud label', { exact: true })).toBeChecked();
    await page.locator('article.comment').filter({ hasText: 'Cloud discussion' }).getByRole('button', { name: 'Delete comment', exact: true }).click();
    await expect(page.locator('article.comment')).toHaveCount(0);
    expect((await read('list_reactions')).items).toHaveLength(0);
    await page.getByRole('button', { name: 'Subtask details: Cloud child', exact: true }).click();
    await page.getByRole('button', { name: 'Convert to task', exact: true }).click();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Cloud child');
    await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Canonical notes');
    expect((await read('list_subtasks', { taskId: task.id })).items).toHaveLength(0);
    const promoted = (await read('list_tasks')).items.find((row: { title: string }) => row.title === 'Cloud child');
    const latest = (await read('get_task', { id: promoted.id })).data;
    await command('claim_task', { id: latest.id }, latest.version, executor);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Add subtask', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Add metadata', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Resume human control', exact: true })).toBeEnabled();
    await page.screenshot({ path: '/tmp/task6b2-cloud-details-claim.png', fullPage: true });
    await test.info().attach('browser-rpc-counts', { body: JSON.stringify(rpcCounts), contentType: 'application/json' });
    console.log('Task 6b2 browser RPC counts:', JSON.stringify(rpcCounts));
  } finally {
    if (ws) {
      if ((await service.from('task_claims').delete().eq('workspace_id', ws)).error) cleanup.push('claims');
      if ((await service.from('workspaces').delete().eq('id', ws)).error) cleanup.push('workspace');
    }
    for (const id of users) if ((await service.auth.admin.deleteUser(id)).error) cleanup.push('user');
    await human.auth.signOut();
    await executor.auth.signOut();
  }
  expect(cleanup).toEqual([]);
});

test('successful relation command refreshes canonical links even when event reading fails', async ({ page }) => {
  await page.clock.install();
  const reads: string[] = [];
  page.on('request', request => {
    if (request.url().endsWith('/read_operation')) reads.push(request.postDataJSON().p_operation);
  });
  const control = await fixture(page);
  await page.goto('/app/w/' + workspace + '/tasks');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByLabel('Idioma', { exact: true }).selectOption('en');
  await page.getByRole('button', { name: /Revisar navegação/ }).click();
  const label = page.getByRole('dialog').getByLabel('Label: Recovered label', { exact: true });
  await expect(label).not.toBeChecked();
  reads.length = 0;
  const poll = page.waitForResponse(
    response => response.url().endsWith('/read_operation') && response.request().postDataJSON().p_operation === 'list_domain_events',
  );
  await page.clock.fastForward(11000);
  await poll;
  expect(reads).toEqual(['list_domain_events']);
  control.eventOffline(true);
  await label.click();
  await expect(label).toBeChecked();
});

test('actual cloud schedules and files preserve duration, CAS, claims, metadata and cursor reload', async ({ page }) => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, 'Requires dedicated local Supabase');
  test.setTimeout(90000);
  const { createClient } = await import('@supabase/supabase-js');
  const base = process.env.TEST_SUPABASE_URL!,
    key = process.env.TEST_SUPABASE_ANON_KEY!,
    options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(base, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, options),
    human = createClient(base, key, options),
    setupActor = createClient(base, key, options),
    executor = createClient(base, key, options);
  const suffix = crypto.randomUUID(),
    password = `Schedule-${crypto.randomUUID()}!`,
    addresses = [`schedule-${suffix}@example.test`, `setup-${suffix}@example.test`, `executor-${suffix}@example.test`],
    users: string[] = [];
  const cleanup: string[] = [],
    counts: Record<string, number> = {};
  let ws = '';
  page.on('response', response => {
    if (response.url().includes('/rest/v1/rpc/')) {
      const key = response.url().split('/').pop() + ':' + response.status();
      counts[key] = (counts[key] || 0) + 1;
    }
  });
  try {
    for (const email of addresses) {
      const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
      expect(!!made.error).toBe(false);
      users.push(made.data.user!.id);
    }
    for (const [index, client] of [human, setupActor, executor].entries())
      expect(!!(await client.auth.signInWithPassword({ email: addresses[index], password })).error).toBe(false);
    const made = await human.rpc('create_workspace_v2', { p_name: 'Schedules actual', p_slug: `schedule-${suffix}`, p_idempotency_key: suffix });
    expect(!!made.error).toBe(false);
    ws = made.data.data.id;
    expect(!!(await service.from('workspace_memberships').insert(users.slice(1).map(user_id => ({ workspace_id: ws, user_id, role: 'member' })))).error).toBe(
      false,
    );
    expect(!!(await service.from('agents').insert({ workspace_id: ws, id: 'schedule-agent', name: 'Schedule executor', auth_user_id: users[2] })).error).toBe(
      false,
    );
    const command = async (operation: string, input: Record<string, unknown>, version?: number, client = human) => {
      const result = await client.rpc('execute_operation', {
        p_workspace_id: ws,
        p_operation: operation,
        p_command: input,
        p_expected_version: version ?? null,
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(result.error?.message || '').toBe('');
      return result.data.data;
    };
    const read = async (operation: string, query = {}) => {
      const result = await human.rpc('read_operation', { p_workspace_id: ws, p_operation: operation, p_query: query });
      expect(result.error?.message || '').toBe('');
      return result.data;
    };
    const day = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return d.toLocaleDateString('sv-SE');
    };
    const project = await command('create_project', { name: 'Schedules project', attributes: { milestones: [{ name: 'Literal <milestone>', date: day(3) }] } });
    const task = await command('create_task', { id: 'schedule-task', projectId: project.id, title: 'Cloud schedule', startDate: day(-2), dueDate: day(1) });
    const other = await command('create_task', { id: 'schedule-consumer', projectId: project.id, title: 'File consumer' });
    await command('create_calendar_event', { id: 'schedule-event', projectId: project.id, title: 'Cloud <event>', eventDate: day(0), eventTime: '14:00' });
    // Large fixture uses a separate authenticated setup actor; observed UI and reads remain human JWT.
    for (const [start, count] of [
      [0, 100],
      [100, 3],
    ])
      await command(
        'batch',
        {
          commands: Array.from({ length: count }, (_, i) => ({
            operation: 'create_file',
            input: {
              id: `schedule-file-${start + i}`,
              projectId: project.id,
              name: `Cloud file ${String(start + i).padStart(3, '0')}.pdf`,
              fileType: 'pdf',
              sizeLabel: '2 KB',
            },
          })),
        },
        undefined,
        setupActor,
      );
    // Trusted fixture only: historical unknown metadata is not writable through public commands.
    expect(
      !!(
        await service
          .from('files')
          .update({ task_id: task.id, legacy_metadata: { custom: { literal: '<unknown>', nested: [1, 'kept'] } } })
          .eq('workspace_id', ws)
          .eq('id', 'schedule-file-102')
      ).error,
    ).toBe(false);
    await command('set_task_attachment', { id: task.id, fileId: 'schedule-file-102' }, task.version);
    await command('set_task_attachment', { id: other.id, fileId: 'schedule-file-102' }, other.version);
    await page.goto(`/app/w/${ws}/calendar`);
    await page.getByLabel('E-mail').fill(addresses[0]);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Calendário', exact: true })).toBeVisible();
    await page.getByLabel('Idioma', { exact: true }).selectOption('en');
    await page.getByRole('button', { name: /14:00(?::00)? Cloud <event>/ }).click();
    await expect(page.getByRole('dialog')).toContainText('Schedules project');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Cloud schedule', exact: true }).dragTo(page.locator(`[data-calendar-day="${day(3)}"]`));
    await expect(page.locator(`[data-calendar-day="${day(3)}"]`).getByRole('button', { name: 'Cloud schedule', exact: true })).toBeVisible();
    let current = (await read('get_task', { id: task.id })).data;
    expect(current.startDate).toBe(day(0));
    expect(current.dueDate).toBe(day(3));
    await page.getByRole('link', { name: 'Timeline', exact: true }).click();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    const bar = page.locator(`[data-schedule-bar="${task.id}"]`);
    await bar.scrollIntoViewIfNeeded();
    await bar.focus();
    await page.keyboard.press('ArrowRight');
    await expect(bar).toHaveAttribute('data-due-date', day(4));
    await page.reload();
    await expect(bar).toHaveAttribute('data-due-date', day(4));
    current = (await read('get_task', { id: task.id })).data;
    expect(current.startDate).toBe(day(1));
    await command('claim_task', { id: task.id }, current.version, executor);
    await page.reload();
    await bar.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('alert')).toContainText(/reservation|reserved|control/i);
    expect((await read('get_task', { id: task.id })).data.dueDate).toBe(day(4));
    await page.getByRole('link', { name: 'Files', exact: true }).click();
    await expect(page.locator('[data-file-id]')).toHaveCount(103);
    await expect(page.getByLabel('Select files for metadata simulation', { exact: true })).toHaveCount(0);
    await page.getByLabel('Search files', { exact: true }).fill('Cloud file 102');
    await page.getByRole('button', { name: 'Cloud file 102.pdf', exact: true }).click();
    await page.getByLabel('File name', { exact: true }).fill('Literal <renamed>.pdf');
    await page.getByRole('button', { name: 'Rename file', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toHaveText('Literal <renamed>.pdf');
    const duplicateAttempts: Record<string, unknown>[] = [];
    await page.route('**/rest/v1/rpc/execute_operation', async route => {
      const body = route.request().postDataJSON();
      if (body.p_operation !== 'duplicate_file') return route.fallback();
      duplicateAttempts.push(body);
      if (duplicateAttempts.length === 1) {
        const committed = await route.fetch();
        expect(committed.ok()).toBe(true);
        await route.abort('failed');
      } else await route.fallback();
    });
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(/connection/i);
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toHaveText('Literal <renamed> copy.pdf');
    expect(duplicateAttempts).toHaveLength(2);
    expect(duplicateAttempts[1].p_idempotency_key).toBe(duplicateAttempts[0].p_idempotency_key);
    expect(duplicateAttempts[1].p_command).toEqual(duplicateAttempts[0].p_command);
    const copyId = new URL(page.url()).searchParams.get('file')!;
    const filePage = await read('list_files', { limit: 100 });
    const fileTail = filePage.nextCursor ? await read('list_files', { limit: 100, cursor: filePage.nextCursor }) : { items: [] };
    const copied = [...filePage.items, ...fileTail.items].find((file: { id: string }) => file.id === copyId);
    expect(copied.legacyMetadata.custom).toEqual({ literal: '<unknown>', nested: [1, 'kept'] });
    expect(copied.authorUserId).toBe(users[0]);
    expect(copied.taskId).toBe(task.id);
    expect((await read('list_attachments')).items.filter((x: { fileId: string }) => x.fileId === copyId)).toHaveLength(0);
    await page.reload();
    await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toHaveText('Literal <renamed> copy.pdf');
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    await page.getByLabel('Search files', { exact: true }).fill('Literal');
    await page.getByRole('button', { name: 'Literal <renamed>.pdf', exact: true }).click();
    await page.getByRole('button', { name: 'Delete file', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
    await expect(page.getByRole('alertdialog').getByRole('alert')).toContainText(/reservation|reserved|control/i);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    // Explicit human intervention is the only path that clears the executor reservation.
    await page.getByRole('link', { name: 'Timeline', exact: true }).click();
    await page.locator('.timeline-row-name').getByRole('button', { name: 'Cloud schedule', exact: true }).click();
    await page.getByRole('button', { name: 'Resume human control', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm resume', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resume human control', exact: true })).toBeDisabled();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('link', { name: 'Files', exact: true }).click();
    await page.getByRole('button', { name: 'Literal <renamed>.pdf', exact: true }).click();
    await page.getByRole('button', { name: 'Delete file', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
    await expect(page.locator('[data-file-id="schedule-file-102"]')).toHaveCount(0);
    expect((await read('list_attachments')).items.filter((x: { fileId: string }) => x.fileId === 'schedule-file-102')).toHaveLength(0);
    expect((await read('get_task', { id: other.id })).data.title).toBe('File consumer');
    await page.getByRole('button', { name: 'Literal <renamed> copy.pdf', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('dialog').locator('img')).toHaveCount(0);
    await page.screenshot({ path: '/tmp/task6b3-cloud-files-mobile.png' });
    console.log('Task6b3 actual cloud RPC counts:', JSON.stringify(counts));
  } finally {
    if (ws) {
      if ((await service.from('task_claims').delete().eq('workspace_id', ws)).error) cleanup.push('claims');
      if ((await service.from('workspaces').delete().eq('id', ws)).error) cleanup.push('workspace');
    }
    for (const id of users) if ((await service.auth.admin.deleteUser(id)).error) cleanup.push('user');
    await human.auth.signOut();
    await setupActor.auth.signOut();
    await executor.auth.signOut();
  }
  expect(cleanup).toEqual([]);
});
