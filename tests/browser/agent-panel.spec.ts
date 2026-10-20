import { test, expect, type Page } from '@playwright/test';
const userId = '11111111-1111-4111-8111-111111111111',
  workspace = '22222222-2222-4222-8222-222222222222',
  other = '33333333-3333-4333-8333-333333333333';
const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: userId, role: 'authenticated', exp: 4102444800 }, 'signature']
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
    writeOffline = false;
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
