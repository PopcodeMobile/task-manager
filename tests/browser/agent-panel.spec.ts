import { test, expect, type Page } from '@playwright/test';
import {
  setLanguage,
  toggleTheme,
  createWorkspace,
  switchWorkspaceNamed,
  expectWorkspaceSelected,
  openWorkspaceRoute,
  chooseVisibleOption,
  editDescriptionSource,
  chooseTaskDate,
  expectTaskDate,
  openAccount,
  renameFileMetadata,
  teamMemberChoice,
} from './visible-controls.js';
async function selectVisibleTasks(page: Page) {
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('dialog', { name: 'Filters', exact: true }).getByRole('checkbox', { name: 'Select all visible tasks', exact: true }).check();
  await page.keyboard.press('Escape');
}
async function openDrawerActions(page: Page, expectedState?: string) {
  const actions = page.getByRole('dialog').locator('details.drawer-extra-actions');
  if (expectedState) await expect(actions.getByText(expectedState, { exact: true })).toBeAttached();
  if (!(await actions.locator(':scope[open]').count())) await actions.locator(':scope > summary').click();
}
async function expectAgentUpdate(page: Page, taskTitle: string, actorName?: string, timeout = 5000) {
  const row = page
    .locator('.activity-feed article.fitem')
    .filter({ has: page.getByRole('link', { name: taskTitle, exact: true }) })
    .filter({ has: page.getByText('alterou a tarefa', { exact: true }) });
  await expect(row.locator('.activity-avatar .lucide-bot')).toBeVisible({ timeout });
  if (actorName) await expect(row.locator('b')).toHaveText(actorName);
  else await expect(row.locator('b')).not.toBeEmpty();
}
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
  let dropNext = false;
  const receipts = new Map<string, Record<string, unknown>>();
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
      const receiptKey = `${op}:${body.p_idempotency_key}`;
      if (receipts.has(receiptKey)) return route.fulfill({ json: receipts.get(receiptKey) });
      if (conflict) {
        conflict = false;
        tasks = tasks.map(t => ({ ...t, version: Number(t.version) + 1 }));
        return route.fulfill({ status: 409, json: { code: 'PT409', message: 'version_conflict' } });
      }
      const input = body.p_command;
      let data: Record<string, unknown> = {};
      if (op === 'batch' && input.commands?.[0]?.operation === 'create_task') {
        const created = { ...baseTask, ...input.commands[0].input, status: 'done', version: 2 };
        tasks.push(created);
        data = { results: [{ data: { ...created, status: 'todo', version: 1 } }, { data: created }] };
      }
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
      const receipt = { data, eventId: `event-${events.length}` };
      receipts.set(receiptKey, receipt);
      if (dropNext) {
        dropNext = false;
        return route.abort('failed');
      }
      return route.fulfill({ json: receipt });
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
    if (op === 'get_event_cursor') {
      const last = events.at(-1);
      data = { data: { cursor: JSON.stringify(last ? [last.createdAt, last.id] : ['', '']) } };
    }
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
    if (op === 'list_labels')
      data = { items: [{ id: 'detail-label', workspaceId: body.p_workspace_id, name: 'Recovered label', version: 1, legacyMetadata: {} }], nextCursor: null };
    if (op === 'list_task_labels') data = { items: taskLabels, nextCursor: null };
    if (op === 'list_comments') data = { items: comments, nextCursor: null };
    if (op === 'list_agents') data = { items: [{ id: 'agent-1', name: 'Assistente de produto', authUserId: userId, clientId: 'client-1' }], nextCursor: null };
    if (op === 'list_domain_events' || op === 'list_task_activity') {
      const cursor = body.p_query?.cursor ? JSON.parse(body.p_query.cursor) : ['', ''];
      data = { items: events.filter(e => String(e.createdAt) > cursor[0] || (e.createdAt === cursor[0] && String(e.id) > cursor[1])), nextCursor: null };
    }
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
    blocked: (executionActive = true) => {
      tasks[0] = {
        ...tasks[0],
        execution: { state: 'blocked', reason: 'Preciso de uma decisão humana', active: executionActive },
        reservation: { agentId: 'agent-1', active: true, expiresAt: '2099-01-01T00:00:00Z' },
      };
    },
    dropResponse: () => {
      dropNext = true;
    },
    tasks: () => tasks,
    removeTask: (operation = 'delete_task') => {
      tasks = [];
      events.push({ id: 'removed', operation, entityId: 'task-1', actorUserId: userId, createdAt: new Date().toISOString(), payload: { taskId: 'task-1' } });
    },
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
  await page.getByRole('link', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tarefas', exact: true })).toBeVisible();
}
test('login, workspace, create, edit, board, drawer, comment and agent supervision', async ({ page }) => {
  const f = await fixture(page);
  await login(page);
  await expect(page.getByText('Revisar navegação', { exact: true })).toBeVisible();
  const list = page.getByRole('table', { name: 'Tarefas', exact: true });
  await expect(list.getByRole('columnheader')).toHaveText(['Tarefa', 'Status', 'Responsável', 'Prioridade', 'Prazo', 'Projeto']);
  await expect(list.locator('[data-task-row="task-1"] [data-task-column]')).toHaveCount(6);
  await page.getByRole('button', { name: 'Nova tarefa', exact: true }).click();
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Publicar pesquisa');
  await page.getByRole('button', { name: 'Criar tarefa', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Publicar pesquisa revisada');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await page.getByLabel('Comentário', { exact: true }).fill('Revisão pronta');
  await page.getByRole('button', { name: 'Comentar', exact: true }).click();
  await expect(page.getByText('Revisão pronta', { exact: true })).toBeVisible();
  await openDrawerActions(page);
  await page.getByLabel('Agente executor').selectOption('agent-1');
  await page.getByRole('button', { name: 'Atribuir agente' }).click();
  await expect(page.getByText('Atribuído, sem reserva ativa')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await page.locator('#work-content').getByRole('link', { name: 'Quadro', exact: true }).click();
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
  await expect(page.getByText('Execução reservada', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Concluir tarefa', exact: true })).toBeDisabled();
  await openDrawerActions(page);
  await page.getByRole('button', { name: 'Retomar controle humano' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.screenshot({ path: '/tmp/task5-alert-resume.png', fullPage: true });
  await page.getByRole('button', { name: 'Confirmar retomada' }).click();
  await openDrawerActions(page, 'Sem agente executor');
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
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Meu rascunho');
  f.conflict();
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('alert')).toContainText('mudou');
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Meu rascunho');
  await page.getByRole('button', { name: 'Recarregar versão e descartar rascunho' }).click();
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  f.offline(true);
  await openWorkspaceRoute(page, 'Atualizar dados');
  await expect(page.getByRole('alert')).toContainText('conexão');
  f.offline(false);
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Revisar navegação', { exact: true })).toBeVisible();
});
test('workspace switch and logout cannot hydrate delayed identity results', async ({ page }) => {
  const f = await fixture(page);
  await login(page);
  f.late();
  await switchWorkspaceNamed(page, 'Outro espaço');
  await f.waitLate();
  await switchWorkspaceNamed(page, 'Gr8r Studio');
  await f.releaseLate();
  await page.getByRole('link', { name: 'Tarefas', exact: true }).click();
  await expect(page.getByText('Revisar navegação', { exact: true })).toBeVisible();
  await expect(page.getByText('Tarefa do outro espaço', { exact: true })).toHaveCount(0);
  f.late();
  await switchWorkspaceNamed(page, 'Outro espaço');
  await f.waitLate();
  await openAccount(page);
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
  await expectAgentUpdate(page, 'Atualizada pelo MCP', 'Assistente de produto');
  await setLanguage(page, 'en');
  await toggleTheme(page);
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await page.screenshot({ path: '/tmp/task5-desktop-dark-en.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/task5-mobile-dark-en.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await toggleTheme(page);
  await setLanguage(page, 'pt-BR');
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
      await expect(page.getByText('Execução reservada', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Concluir tarefa', exact: true })).toBeDisabled();
      await openDrawerActions(page);
      await page.getByRole('button', { name: 'Retomar controle humano' }).click();
      await page.getByRole('button', { name: 'Confirmar retomada' }).click();
      await openDrawerActions(page, 'Sem agente executor');
      await expect(page.getByText('Sem agente executor')).toBeVisible();
      await page.getByLabel('Comentário', { exact: true }).fill('Decisão humana registrada');
      await page.getByRole('button', { name: 'Comentar', exact: true }).click();
      await expect(page.getByText('Decisão humana registrada', { exact: true })).toBeVisible();
      await openDrawerActions(page);
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
      await createWorkspace(page);
      await page.getByLabel('Nome da organização').fill('Segundo espaço real');
      await page.getByRole('button', { name: 'Criar organização', exact: true }).click();
      await page.getByRole('link', { name: 'Tarefas', exact: true }).click();
      await expect(page.getByText('Nenhuma tarefa por aqui')).toBeVisible();
      const secondWorkspace = new URL(page.url()).pathname.split('/')[3];
      workspaceIds.push(secondWorkspace);
      expect(secondWorkspace !== ws).toBeTruthy();
      await page.reload();
      await expect(page.getByText('Nenhuma tarefa por aqui')).toBeVisible();
      await expect(page).toHaveURL(new RegExp('/w/' + secondWorkspace + '/'));
      await expectWorkspaceSelected(page, 'Segundo espaço real');
      await switchWorkspaceNamed(page, 'Supervisão real');
      await page.getByRole('link', { name: 'Tarefas', exact: true }).click();
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
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Rascunho preservado');
  f.writeOffline(true);
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('conexão');
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Rascunho preservado');
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
  await page.goto(`/app/w/${workspace}/tasks?view=table`);
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
  await expect(page).toHaveURL(new RegExp(`/app/w/${workspace}/tasks\\?view=table$`));
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
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Rascunho no histórico');
  f.writeOffline(true);
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Rascunho no histórico');
  await expect(page.getByRole('alert')).toContainText('conexão');
});

test('an event committed during initial hydration cannot be skipped by the polling cursor', async ({ page }) => {
  await page.clock.install();
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
  await expect(page.getByText('Revisar navegação', { exact: true })).toBeVisible();
  await page.clock.runFor(10001);
  await expect(page.getByText('Atualizada pelo MCP', { exact: true })).toBeVisible({ timeout: 1500 });
});

test('same-session token rotation preserves dirty draft, original CAS and failed-command retry identity', async ({ page }) => {
  const f = await fixture(page);
  await login(page);
  await page.getByText('Revisar navegação', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Rascunho após rotação');
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
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Rascunho após rotação');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(attempts).toHaveLength(2);
  expect(attempts[1].p_idempotency_key === attempts[0].p_idempotency_key).toBeTruthy();
  expect(attempts[1].p_expected_version).toBe(1);
  expect(f.commands.at(-1)?.p_operation).toBe('update_task');
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Não transferir para nova sessão');
  await rotate('55555555-5555-4555-8555-555555555555');
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Rascunho após rotação');
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Não transferir para outra pessoa');
  await rotate('66666666-6666-4666-8666-666666666666', {
    ...user,
    id: '77777777-7777-4777-8777-777777777777',
    email: 'other@example.test',
    user_metadata: { name: 'Outra pessoa' },
  });
  await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Rascunho após rotação');
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
    await expectAgentUpdate(page, 'Alterada pelo MCP real', undefined, 1500);
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
      expect(!!result.error, result.error ? `${result.error.code}: ${result.error.message}` : undefined).toBe(false);
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
    await setLanguage(page, 'en');
    await expect(page.getByRole('button', { name: 'Cloud task 101' })).toBeVisible();
    await page.locator('#work-content').getByRole('link', { name: 'Table', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search tasks', exact: true }).fill('Cloud task 10');
    await selectVisibleTasks(page);
    await page.getByRole('combobox', { name: 'Bulk priority', exact: true }).selectOption('high');
    await expect(page.getByRole('button', { name: /Change priority:.*$/, exact: false }).first()).toContainText('High');
    let a = await readTask('views-task-100'),
      b = await readTask('views-task-101');
    expect(a.priority).toBe('high');
    expect(b.priority).toBe('high');
    await command('update_task', { id: a.id, priority: 'low' }, a.version);
    await selectVisibleTasks(page);
    await page.getByRole('combobox', { name: 'Bulk priority', exact: true }).selectOption('urgent');
    await expect(page.getByRole('alert')).toContainText('Your draft was kept');
    expect((await readTask(b.id)).priority).toBe('high');
    await openWorkspaceRoute(page, 'Refresh data');
    await expect(page.getByRole('button', { name: 'Change priority: ' + a.key, exact: true })).toContainText('Low');
    await expect(page.getByRole('combobox', { name: 'Bulk priority', exact: true })).toBeEnabled();
    await page.getByRole('combobox', { name: 'Bulk priority', exact: true }).selectOption('urgent');
    await expect(page.getByRole('combobox', { name: 'Bulk priority', exact: true })).toHaveCount(0);
    a = await readTask(a.id);
    b = await readTask(b.id);
    expect(a.priority).toBe('urgent');
    expect(b.priority).toBe('urgent');
    const lease = await command('claim_task', { id: b.id }, b.version, executor);
    await openWorkspaceRoute(page, 'Refresh data');
    await expect(page.getByRole('button', { name: 'Change priority: ' + b.key, exact: true })).toBeDisabled();
    await expect(
      page.getByRole('table', { name: 'Tasks table', exact: true }).locator(`[data-task-row="${b.id}"]`).getByText('Views executor', { exact: true }),
    ).toBeVisible();
    await selectVisibleTasks(page);
    await page.getByRole('button', { name: 'Archive selected', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('explicitly resume human control');
    expect((await readTask(a.id)).archived).toBe(false);
    expect(await page.locator('body').textContent()).not.toContain(lease.claimToken);
    await page.getByRole('button', { name: 'Cloud task 101' }).click();
    await (await editDescriptionSource(page)).fill('<p>Saved cloud draft</p><img src=x onerror=alert(1)>');
    await openDrawerActions(page);
    await page.getByRole('button', { name: 'Resume human control', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Save changes before this action');
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    await openDrawerActions(page);
    await page.getByRole('button', { name: 'Resume human control', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm resume', exact: true }).click();
    await openDrawerActions(page, 'No executor agent');
    await expect(page.getByText('No executor agent', { exact: true })).toBeVisible();
    await chooseTaskDate(page, 'Due date', '2026-11-20');
    await chooseVisibleOption(page, 'Recurrence', 'Weekly');
    await openDrawerActions(page);
    await page.getByRole('button', { name: 'Complete task', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Save changes before this action');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    await openDrawerActions(page);
    await page.getByRole('button', { name: 'Complete task', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Status', exact: true })).toContainText('Done');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Status', exact: true })).toContainText('Done');
    await expectTaskDate(page, 'Due date', '2026-11-20');
    await expect(await editDescriptionSource(page)).toHaveValue('<p>Saved cloud draft</p><img src=x onerror=alert(1)>');
    await page.getByRole('button', { name: 'Preview description', exact: true }).click();
    await expect(page.locator('.task-description-preview')).toBeVisible();
    await expect(page.locator('.rich-content [onerror]')).toHaveCount(0);
    await openDrawerActions(page);
    await page.getByRole('combobox', { name: 'Destination project', exact: true }).selectOption(second.id);
    await page.getByRole('button', { name: 'Move task', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Destination project', exact: true })).toHaveValue(second.id);
    const sourceTaskId = new URL(page.url()).searchParams.get('task');
    await openDrawerActions(page);
    await page.getByRole('button', { name: 'Duplicate task', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('task')).not.toBe(sourceTaskId);
    await expect(page.getByRole('button', { name: 'Status', exact: true })).toContainText('Done');
    await expect(await editDescriptionSource(page)).toHaveValue('<p>Saved cloud draft</p><img src=x onerror=alert(1)>');
    const cloneURL = page.url(),
      cloneId = new URL(cloneURL).searchParams.get('task')!;
    await openDrawerActions(page);
    await page.getByRole('button', { name: 'Archive task', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Task details', exact: true })).toHaveCount(0);
    expect((await readTask(cloneId)).archived).toBe(true);
    await page.goto(cloneURL);
    await openDrawerActions(page);
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
    await setLanguage(page, 'en');
    await page.getByRole('button', { name: 'Cloud menu task', exact: true }).filter({ hasText: task.key }).click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Open task', exact: true })).toBeFocused();
    await page.getByRole('menuitem', { name: 'Complete task', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Change status: ' + task.key, exact: true })).toContainText('Done');
    await expect(page.getByRole('menu', { name: 'Task actions', exact: true })).toHaveCount(0);
    task = await readTask(task.id);
    expect(task.status).toBe('done');
    await page.getByRole('button', { name: 'Cloud menu task', exact: true }).filter({ hasText: task.key }).focus();
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Reopen task', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Change status: ' + task.key, exact: true })).toContainText('To do');
    await expect(page.getByRole('menu', { name: 'Task actions', exact: true })).toHaveCount(0);
    task = await readTask(task.id);
    expect(task.status).toBe('todo');
    await command('claim_task', { id: task.id }, task.version, executor);
    await openWorkspaceRoute(page, 'Refresh data');
    await expect(page.getByRole('button', { name: 'Change status: ' + task.key, exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Cloud menu task', exact: true }).filter({ hasText: task.key }).click({ button: 'right' });
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
    await setLanguage(page, 'en');
    await page.getByRole('button', { name: 'Cloud detail task', exact: true }).filter({ hasText: task.key }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Change labels: ' + task.key, exact: true })
      .click();
    await page.getByLabel('New label', { exact: true }).fill('Cloud label');
    await page.getByRole('button', { name: 'Create and apply label', exact: true }).click();
    await expect(page.getByRole('menu', { name: 'Labels', exact: true }).getByRole('menuitemcheckbox', { name: 'Cloud label', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.keyboard.press('Escape');
    expect((await read('list_task_labels', { taskId: task.id })).items).toHaveLength(1);
    await page.getByLabel('New subtask', { exact: true }).fill('Cloud child');
    await page.getByRole('button', { name: 'Add subtask', exact: true }).click();
    await page.getByRole('button', { name: 'Subtask details: Cloud child', exact: true }).click();
    await page.getByLabel('Subtask notes', { exact: true }).fill('Canonical notes');
    await page.getByRole('button', { name: 'Save subtask', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Convert to task', exact: true })).toBeEnabled();
    expect((await read('list_subtasks', { taskId: task.id })).items[0].legacyMetadata.note).toBe('Canonical notes');
    await page.getByRole('dialog').locator('.attachment-metadata-actions > summary').click();
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
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Change labels: ' + task.key, exact: true })
      .click();
    await expect(page.getByRole('menu', { name: 'Labels', exact: true }).getByRole('menuitemcheckbox', { name: 'Cloud label', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.keyboard.press('Escape');
    await page.locator('article.comment').filter({ hasText: 'Cloud discussion' }).getByRole('button', { name: 'Delete comment', exact: true }).click();
    await expect(page.locator('article.comment')).toHaveCount(0);
    expect((await read('list_reactions')).items).toHaveLength(0);
    await page.getByRole('button', { name: 'Subtask details: Cloud child', exact: true }).click();
    await page.getByRole('button', { name: 'Convert to task', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Cloud child');
    await expect(await editDescriptionSource(page)).toHaveValue('Canonical notes');
    expect((await read('list_subtasks', { taskId: task.id })).items).toHaveLength(0);
    const promoted = (await read('list_tasks')).items.find((row: { title: string }) => row.title === 'Cloud child');
    const latest = (await read('get_task', { id: promoted.id })).data;
    await command('claim_task', { id: latest.id }, latest.version, executor);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Add subtask', exact: true })).toBeDisabled();
    await page.getByRole('dialog').locator('.attachment-metadata-actions > summary').click();
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
  await setLanguage(page, 'en');
  await page.getByRole('button', { name: /Revisar navegação/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Change labels: ' + baseTask.key, exact: true })
    .click();
  const label = page.getByRole('menu', { name: 'Labels', exact: true }).getByRole('menuitemcheckbox', { name: 'Recovered label', exact: true });
  await expect(label).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  reads.length = 0;
  const poll = page.waitForResponse(
    response => response.url().endsWith('/read_operation') && response.request().postDataJSON().p_operation === 'list_domain_events',
  );
  await page.clock.fastForward(11000);
  await poll;
  expect(reads).toEqual(['list_domain_events']);
  control.eventOffline(true);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Change labels: ' + baseTask.key, exact: true })
    .click();
  await label.click();
  await expect(label).toHaveAttribute('aria-checked', 'true');
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
    await setLanguage(page, 'en');
    await page.getByRole('button', { name: /14:00(?::00)? Cloud <event>/ }).click();
    await expect(page.getByRole('dialog', { name: 'Event details', exact: true })).toContainText('Schedules project');
    await page.keyboard.press('Escape');
    await page
      .locator(`[data-calendar-day="${day(1)}"]`)
      .getByRole('button', { name: 'Cloud schedule' })
      .dragTo(page.locator(`[data-calendar-day="${day(3)}"]`));
    await expect(page.locator(`[data-calendar-day="${day(3)}"]`).getByRole('button', { name: 'Cloud schedule' })).toBeVisible();
    let current = (await read('get_task', { id: task.id })).data;
    expect(current.startDate).toBe(day(0));
    expect(current.dueDate).toBe(day(3));
    await page
      .getByRole('link', { name: 'Timeline', exact: true })
      .and(page.locator(`a[href="/app/w/${ws}/timeline"]`))
      .click();
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
    await openWorkspaceRoute(page, 'Files');
    await expect(page.locator('[data-file-id]')).toHaveCount(103);
    await expect(page.getByLabel('Select files for metadata simulation', { exact: true })).toHaveCount(0);
    await page.getByLabel('Search files', { exact: true }).fill('Cloud file 102');
    await page.getByRole('button', { name: 'Cloud file 102.pdf', exact: true }).click();
    await renameFileMetadata(page, 'Cloud file 102.pdf', 'Literal <renamed>.pdf');
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
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'File options: Literal <renamed>.pdf', exact: true }).click();
    await page.getByRole('menu', { name: 'File options', exact: true }).getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
    await expect(page.locator('.files-view > .error-row').getByRole('alert')).toContainText(/connection/i);
    await page.getByRole('button', { name: 'File options: Literal <renamed>.pdf', exact: true }).click();
    await page.getByRole('menu', { name: 'File options', exact: true }).getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
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
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'File options: Literal <renamed>.pdf', exact: true }).click();
    await page.getByRole('menu', { name: 'File options', exact: true }).getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
    await expect(page.getByRole('alertdialog').getByRole('alert')).toContainText(/reservation|reserved|control/i);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    // Explicit human intervention is the only path that clears the executor reservation.
    await page
      .getByRole('link', { name: 'Timeline', exact: true })
      .and(page.locator(`a[href="/app/w/${ws}/timeline"]`))
      .click();
    await page.locator('.timeline-row-name').getByRole('button', { name: 'Cloud schedule', exact: true }).click();
    await openDrawerActions(page);
    await page.getByRole('button', { name: 'Resume human control', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm resume', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resume human control', exact: true })).toBeDisabled();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await openWorkspaceRoute(page, 'Files');
    await page.getByRole('button', { name: 'Literal <renamed>.pdf', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'File options: Literal <renamed>.pdf', exact: true }).click();
    await page.getByRole('menu', { name: 'File options', exact: true }).getByRole('menuitem', { name: 'Delete', exact: true }).click();
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

test('actual cloud projects compose templates members saved views full graph copies and reload', async ({ page }) => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, 'Requires dedicated local Supabase');
  test.setTimeout(90000);
  const { createClient } = await import('@supabase/supabase-js');
  const base = process.env.TEST_SUPABASE_URL!,
    key = process.env.TEST_SUPABASE_ANON_KEY!,
    options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(base, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, options),
    human = createClient(base, key, options),
    setupActor = createClient(base, key, options);
  const suffix = crypto.randomUUID(),
    password = `Project-${crypto.randomUUID()}!`,
    addresses = [`projects-${suffix}@example.test`, `lead-${suffix}@example.test`],
    users: string[] = [],
    cleanup: string[] = [],
    counts: Record<string, number> = {};
  let ws = '';
  page.on('response', response => {
    if (response.url().includes('/rest/v1/rpc/')) {
      const k = response.url().split('/').pop() + ':' + response.status();
      counts[k] = (counts[k] ?? 0) + 1;
    }
  });
  try {
    for (const [index, email] of addresses.entries()) {
      const made = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: index ? 'Cloud lead' : 'Cloud owner' } });
      expect(made.error).toBeNull();
      users.push(made.data.user!.id);
    }
    expect((await human.auth.signInWithPassword({ email: addresses[0], password })).error).toBeNull();
    expect((await setupActor.auth.signInWithPassword({ email: addresses[1], password })).error).toBeNull();
    const made = await human.rpc('create_workspace_v2', { p_name: 'Project actual', p_slug: `project-${suffix}`, p_idempotency_key: suffix });
    expect(made.error).toBeNull();
    ws = made.data.data.id;
    expect((await service.from('workspace_memberships').insert({ workspace_id: ws, user_id: users[1], role: 'member' })).error).toBeNull();
    const command = async (operation: string, input: Record<string, unknown>, version?: number) => {
      const result = await setupActor.rpc('execute_operation', {
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
      const result = await setupActor.rpc('read_operation', { p_workspace_id: ws, p_operation: operation, p_query: query });
      expect(result.error?.message ?? '').toBe('');
      return result.data;
    };
    const source = await command('create_project', {
      id: 'project-source',
      name: 'Source <literal>',
      description: '<img src=x> project text',
      leadUserId: users[1],
      status: 'risk',
    });
    const other = await command('create_project', { id: 'project-other', name: 'Other scope' });
    const target = await command('create_task', { id: 'project-target', projectId: other.id, title: 'Other dependency' });
    let task = await command('create_task', {
      id: 'project-task',
      projectId: source.id,
      title: 'Source task',
      description: '<b>Cloud rich</b><img src=x onerror=alert(1)>',
      priority: 'high',
      startDate: new Date().toLocaleDateString('en-CA'),
      dueDate: new Date().toLocaleDateString('en-CA'),
      attributes: { estimate: '4h' },
    });
    await command('create_subtask', { taskId: task.id, title: 'Completed subtask', done: true, attributes: { note: '<literal> detail' } }, task.version);
    task = (await read('get_task', { id: task.id })).data;
    await command('set_task_dependency', { id: task.id, dependsOnTaskId: target.id }, task.version);
    const file = await command('create_file', { id: 'project-file', projectId: source.id, name: 'Source file', fileType: 'pdf' });
    task = (await read('get_task', { id: task.id })).data;
    await command('set_task_attachment', { id: task.id, fileId: file.id, sortOrder: 7 }, task.version);
    task = (await read('get_task', { id: task.id })).data;
    const canonicalLabel = await command('create_label', { id: 'schedule-label', name: 'Schedule label' });
    await command('set_task_label', { id: task.id, labelId: canonicalLabel.id }, task.version);
    task = (await read('get_task', { id: task.id })).data;
    await command('complete_task', { id: task.id }, task.version);
    expect(
      (
        await service
          .from('tasks')
          .update({ legacy_metadata: { unknown: { literal: '<kept>', nested: [1, 2] } }, recurrence: 'Weekly' })
          .eq('workspace_id', ws)
          .eq('id', task.id)
      ).error,
    ).toBeNull();
    expect(
      (
        await service
          .from('subtasks')
          .update({ legacy_metadata: { unknown: { kept: true }, note: '<literal> detail' } })
          .eq('workspace_id', ws)
          .eq('task_id', task.id)
      ).error,
    ).toBeNull();
    expect(
      (
        await service
          .from('task_attachments')
          .update({ legacy_metadata: { unknown: { relation: true } } })
          .eq('workspace_id', ws)
          .eq('task_id', task.id)
      ).error,
    ).toBeNull();
    for (const mode of ['calendar', 'timeline'])
      for (const op of ['is', 'not'])
        await command('create_view', {
          id: `imported-${mode}-${op}`,
          projectId: source.id,
          name: `${mode} ${op} label`,
          viewType: mode,
          filters: [{ f: 'labels', op, v: [canonicalLabel.id] }],
        });
    expect((await read('get_task', { id: task.id })).data.legacyMetadata.labels).toBeUndefined();
    expect((await read('list_task_labels', { taskId: task.id })).items.some((link: { labelId: string }) => link.labelId === canonicalLabel.id)).toBe(true);
    await page.goto(`/app/w/${ws}/projects`);
    await page.getByLabel('E-mail').fill(addresses[0]);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Projetos', exact: true })).toBeVisible();
    await setLanguage(page, 'en');
    await page.evaluate(
      ({ userId, ws, sourceId }) => {
        const key = `gr8r.preferences.${userId}`,
          personal = JSON.parse(localStorage.getItem(key) || '{}');
        personal.views ??= {};
        personal.views[ws] ??= {};
        personal.views[ws][sourceId] = { filters: [{ f: 'priority', op: 'is', v: ['low'] }] };
        localStorage.setItem(key, JSON.stringify(personal));
      },
      { userId: users[0], ws, sourceId: source.id },
    );
    await page.goto(`/app/w/${ws}/project?project=${source.id}&tab=v%3Aimported-calendar-is`);
    for (const mode of ['calendar', 'timeline'])
      for (const op of ['is', 'not']) {
        await page.getByRole('link', { name: `${mode} ${op} label`, exact: true }).click();
        const scheduled =
          mode === 'calendar' ? page.locator('.schedule-task').filter({ hasText: 'Source task' }) : page.locator(`[data-schedule-bar="${task.id}"]`);
        await expect(page.locator('.schedule-view')).toBeVisible();
        await expect(scheduled).toHaveCount(op === 'is' ? 1 : 0);
      }
    await page.reload();
    await expect(page.locator('.project-tabs [aria-current]')).toHaveText('timeline not label');
    await expect(page.locator('.schedule-view')).toBeVisible();
    await expect(page.locator(`[data-schedule-bar="${task.id}"]`)).toHaveCount(0);
    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    let loseCreate = true,
      loseCopy = true;
    const createKeys: string[] = [],
      copyKeys: string[] = [];
    await page.route('**/rest/v1/rpc/execute_operation', async route => {
      const body = route.request().postDataJSON();
      if (body.p_operation === 'batch' && body.p_command.commands.some((c: { operation: string }) => c.operation === 'create_project')) {
        const copying = body.p_command.commands.some((c: { operation: string }) => c.operation === 'duplicate_task_graph');
        (copying ? copyKeys : createKeys).push(body.p_idempotency_key);
        if (copying ? loseCopy : loseCreate) {
          if (copying) loseCopy = false;
          else loseCreate = false;
          const response = await route.fetch();
          expect(response.ok()).toBe(true);
          return route.abort('failed');
        }
      }
      return route.continue();
    });
    await page.locator('#work-content').getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Cloud created');
    await page
      .getByRole('radiogroup', { name: 'Template', exact: true })
      .getByRole('radio', { name: /^Personal (?:Goals|Project)/ })
      .click();
    await page.getByRole('combobox', { name: 'Lead', exact: true }).selectOption(users[1]);
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cloud created', exact: true })).toBeVisible();
    expect(createKeys).toHaveLength(2);
    expect(createKeys[0]).toBe(createKeys[1]);
    const created = new URL(page.url()).searchParams.get('project')!;
    expect((await read('list_project_members', { projectId: created })).items.map((m: { userId: string }) => m.userId).sort()).toEqual([...users].sort());
    expect((await read('list_tasks', { projectId: created })).items).toHaveLength(4);
    await page.locator('.project-members-trigger').click();
    await expect(page.getByRole('dialog')).toContainText('This list does not change permissions; invitations and project privacy are unavailable.');
    await expect(page.getByLabel('Demo email')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.locator('#work-content').getByRole('link', { name: 'List', exact: true }).click();
    await page.getByRole('button', { name: 'Save view', exact: true }).click();
    await page.getByLabel('View name', { exact: true }).fill('Cloud view');
    await page.getByRole('combobox', { name: 'View type', exact: true }).selectOption('table');
    await page.getByRole('dialog').getByRole('button', { name: 'Save view', exact: true }).click();
    await expect(page.locator('.project-tabs [aria-current]')).toHaveText('Cloud view');
    await page.reload();
    await expect(page.locator('.project-tabs [aria-current]')).toHaveText('Cloud view');
    await page.goto(`/app/w/${ws}/project?project=${source.id}&tab=list&task=${task.id}`);
    await expect(page.getByRole('dialog').locator('.rich-content b').filter({ hasText: 'Cloud rich' })).toBeVisible();
    await page.getByRole('button', { name: 'Add to favorites', exact: true }).click();
    await openDrawerActions(page);
    await page.getByRole('button', { name: 'Duplicate task', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Source task (copy)');
    const individual = new URL(page.url()).searchParams.get('task')!;
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    await page.locator('.project-heading .project-options summary').click();
    await page.getByRole('button', { name: 'Duplicate project', exact: true }).click();
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    const latestSourceTask = (await read('get_task', { id: task.id })).data;
    await command('update_task', { id: task.id, description: 'Source changed after ambiguous response' }, latestSourceTask.version);
    await page.getByRole('button', { name: 'Check current version', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review current source tasks and keep draft', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Source <literal> copy', exact: true })).toBeVisible();
    expect(copyKeys).toHaveLength(2);
    expect(copyKeys[0]).toBe(copyKeys[1]);
    const copied = new URL(page.url()).searchParams.get('project')!;
    await page.reload();
    const cloned = (await read('list_tasks', { projectId: copied })).items;
    expect(cloned).toHaveLength(2);
    const full = cloned.find((t: { title: string }) => t.title === 'Source task');
    expect(full.status).toBe('todo');
    expect(full.completedAt).toBeNull();
    expect(full.recurrence).toBe('Weekly');
    expect(full.legacyMetadata.unknown).toEqual({ literal: '<kept>', nested: [1, 2] });
    const individualCopy = (await read('get_task', { id: individual })).data;
    expect(individualCopy.status).toBe('done');
    expect(individualCopy.completedAt).toBe((await read('get_task', { id: task.id })).data.completedAt);
    const children = (await read('list_subtasks', { taskId: full.id })).items;
    expect(children[0].done).toBe(true);
    expect(children[0].legacyMetadata.unknown).toEqual({ kept: true });
    expect((await read('list_dependencies', { taskId: full.id })).items[0].dependsOnTaskId).toBe(target.id);
    expect((await service.from('task_attachments').select('legacy_metadata,sort_order').eq('workspace_id', ws).eq('task_id', full.id)).data).toEqual([
      { legacy_metadata: { unknown: { relation: true } }, sort_order: 7 },
    ]);
    expect((await read('list_views', { projectId: copied })).items).toEqual([]);
    expect((await read('list_comments', { taskId: full.id })).items).toEqual([]);
    await page.locator('#work-content').getByRole('link', { name: 'List', exact: true }).click();
    await page.getByRole('button', { name: /Source task$/ }).click();
    await expect(page.getByRole('button', { name: 'Remove from favorites', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    await page.getByRole('navigation', { name: 'Project tabs', exact: true }).getByRole('link', { name: 'Overview', exact: true }).click();
    await page.screenshot({ path: '/tmp/task6b4-cloud-overview-en.png', fullPage: true });
    expect(Object.keys(counts).filter(k => k.endsWith(':429'))).toEqual([]);
    test.info().annotations.push({ type: 'actual-cloud-project-counts', description: JSON.stringify(counts) });
  } finally {
    if (ws) {
      if ((await service.from('task_claims').delete().eq('workspace_id', ws)).error) cleanup.push('claims');
      if ((await service.from('workspaces').delete().eq('id', ws)).error) cleanup.push('workspace');
    }
    for (const id of users) if ((await service.auth.admin.deleteUser(id)).error) cleanup.push('user');
    await human.auth.signOut();
    await setupActor.auth.signOut();
  }
  expect(cleanup).toEqual([]);
});

test('actual cloud remaining teams workspace notifications and unavailable settings use real contracts', async ({ page }) => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, 'Requires dedicated local Supabase');
  test.setTimeout(90000);
  const { createClient } = await import('@supabase/supabase-js');
  const base = process.env.TEST_SUPABASE_URL!,
    key = process.env.TEST_SUPABASE_ANON_KEY!,
    options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(base, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, options),
    human = createClient(base, key, options),
    setupActor = createClient(base, key, options),
    suffix = crypto.randomUUID(),
    password = `Remaining-${crypto.randomUUID()}!`,
    addresses = [`remaining-${suffix}@example.test`, `remaining-setup-${suffix}@example.test`],
    users: string[] = [],
    cleanup: string[] = [],
    counts: Record<string, number> = {};
  let ws = '';
  page.on('response', response => {
    if (response.url().includes('/rest/v1/rpc/')) {
      const k = response.url().split('/').pop() + ':' + response.status();
      counts[k] = (counts[k] ?? 0) + 1;
    }
  });
  try {
    for (const [index, email] of addresses.entries()) {
      const made = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: index ? 'Remaining teammate' : 'Remaining owner' },
      });
      expect(made.error).toBeNull();
      users.push(made.data.user!.id);
    }
    expect((await human.auth.signInWithPassword({ email: addresses[0], password })).error).toBeNull();
    expect((await setupActor.auth.signInWithPassword({ email: addresses[1], password })).error).toBeNull();
    const made = await human.rpc('create_workspace_v2', { p_name: 'Remaining actual', p_slug: `remaining-${suffix}`, p_idempotency_key: suffix });
    expect(made.error).toBeNull();
    ws = made.data.data.id;
    expect((await service.from('workspace_memberships').insert({ workspace_id: ws, user_id: users[1], role: 'member' })).error).toBeNull();
    const command = async (operation: string, input: Record<string, unknown>, version?: number) => {
      const result = await setupActor.rpc('execute_operation', {
        p_workspace_id: ws,
        p_operation: operation,
        p_command: input,
        p_expected_version: version ?? null,
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(result.error?.message ?? '').toBe('');
      return result.data.data;
    };
    const read = async (operation: string) => {
      const result = await setupActor.rpc('read_operation', { p_workspace_id: ws, p_operation: operation, p_query: {} });
      expect(result.error).toBeNull();
      return result.data;
    };
    const project = await command('create_project', { id: 'remaining-project', name: 'Remaining project' });
    const task = await command('create_task', { id: 'remaining-task', projectId: project.id, title: 'Remaining Home <literal>', assigneeUserId: users[0] });
    const first = await command('create_team', { id: 'remaining-old-team', name: 'Old team' });
    await command('set_team_member', { id: first.id, userId: users[1] }, first.version);
    expect(
      (
        await service.from('notifications').insert({
          workspace_id: ws,
          id: 'remaining-notification',
          task_id: task.id,
          notification_type: 'comment',
          legacy_metadata: { text: 'Remaining notification', snippet: 'Literal cloud', at: new Date().toISOString() },
        })
      ).error,
    ).toBeNull();
    await page.goto(`/app/w/${ws}/teams`);
    await page.getByLabel('E-mail').fill(addresses[0]);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await setLanguage(page, 'en');
    await expect(page.getByRole('button', { name: 'Create team', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create team', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Cloud <team>');
    await teamMemberChoice(page, 'Remaining teammate').check();
    await page.getByRole('button', { name: 'Save team', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.team-person button').filter({ has: page.getByText('Remaining teammate', { exact: true }) })).toBeVisible();
    const teams = (await read('list_teams')).items,
      newTeam = teams.find((team: { name: string }) => team.name === 'Cloud <team>');
    expect(newTeam).toBeTruthy();
    expect((await read('list_team_members')).items.filter((r: { userId: string }) => r.userId === users[1]).map((r: { teamId: string }) => r.teamId)).toEqual([
      newTeam.id,
    ]);
    await page.goto(`/app/w/${ws}/notifications`);
    await expect(page.getByRole('button', { name: /Remaining notification/ })).toBeVisible();
    await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
    await page.getByRole('button', { name: 'Unread', exact: true }).click();
    await expect(page.getByText('No notifications.', { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Unread', exact: true }).click();
    await expect(page.getByText('No notifications.', { exact: true })).toBeVisible();
    await page.goto(`/app/w/${ws}/settings?sec=workspace`);
    await page.getByLabel('Workspace name', { exact: true }).fill('Remaining renamed');
    await page.getByRole('button', { name: 'Save workspace', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Workspace name', { exact: true })).toHaveValue('Remaining renamed');
    for (const sec of ['profile', 'permissions', 'notif-email', 'sessions', '2fa', 'plan', 'payment', 'invoices']) {
      await page
        .getByRole('navigation', { name: 'Settings sections' })
        .getByRole('button', {
          name: (
            {
              profile: 'Profile',
              permissions: 'Permissions',
              'notif-email': 'Email',
              sessions: 'Sessions',
              '2fa': 'Two-factor authentication',
              plan: 'Plan',
              payment: 'Payment',
              invoices: 'Invoices',
            } as Record<string, string>
          )[sec],
          exact: true,
        })
        .click();
      if (sec === 'profile') await expect(page.locator('.settings-content')).toContainText('read-only');
      else await expect(page.locator('.settings-content .lead')).toHaveText('Unavailable for cloud workspaces in this panel. No changes will be made.');
    }
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Password', exact: true }).click();
    await page.getByLabel('Current password', { exact: true }).fill('wrong-password');
    const newPassword = page.locator('form.settings-password').getByLabel(/^New password/);
    await expect(newPassword).toBeVisible();
    await newPassword.fill('Valid-password-123!');
    await page.getByLabel('Confirm new password', { exact: true }).fill('Valid-password-123!');
    await page.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveCount(0);
    const originalSession = await page.evaluate(
      () => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.endsWith('-auth-token'))!)!).access_token.split('.')[1],
    );
    await page.getByLabel('Current password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
    const afterSession = await page.evaluate(
      () => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.endsWith('-auth-token'))!)!).access_token.split('.')[1],
    );
    expect(JSON.parse(Buffer.from(afterSession, 'base64url').toString()).session_id).toBe(
      JSON.parse(Buffer.from(originalSession, 'base64url').toString()).session_id,
    );
    const check = createClient(base, key, options);
    expect((await check.auth.signInWithPassword({ email: addresses[0], password: 'Valid-password-123!' })).error).toBeNull();
    await check.auth.signOut({ scope: 'local' });
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Overview', exact: true }).click();
    await expect.poll(() => page.locator('#work-content').evaluate(node => node.scrollTop)).toBe(0);
    await page.screenshot({ path: '/tmp/task6c-cloud-overview-en.png', fullPage: true });
    expect(Object.keys(counts).filter(k => k.endsWith(':429'))).toEqual([]);
    test.info().annotations.push({ type: 'remaining-actual-cloud-counts', description: JSON.stringify(counts) });
  } finally {
    if (ws && (await service.from('workspaces').delete().eq('id', ws)).error) cleanup.push('workspace');
    for (const id of users) if ((await service.auth.admin.deleteUser(id)).error) cleanup.push('user');
    await human.auth.signOut();
    await setupActor.auth.signOut();
  }
  expect(cleanup).toEqual([]);
});

test('actual cloud fix team absent membership conflicts replan and ambiguous retry preserve identity', async ({ page }) => {
  test.skip(!process.env.TEST_SUPABASE_URL || !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, 'Requires dedicated local Supabase');
  test.setTimeout(90000);
  const { createClient } = await import('@supabase/supabase-js');
  const base = process.env.TEST_SUPABASE_URL!,
    key = process.env.TEST_SUPABASE_ANON_KEY!,
    options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(base, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, options),
    human = createClient(base, key, options),
    setupActor = createClient(base, key, options),
    suffix = crypto.randomUUID(),
    password = `Remaining-${crypto.randomUUID()}!`,
    addresses = [`remaining-${suffix}@example.test`, `remaining-setup-${suffix}@example.test`],
    users: string[] = [],
    cleanup: string[] = [],
    counts: Record<string, number> = {};
  let ws = '';
  page.on('response', response => {
    if (response.url().includes('/rest/v1/rpc/')) {
      const k = response.url().split('/').pop() + ':' + response.status();
      counts[k] = (counts[k] ?? 0) + 1;
    }
  });
  try {
    for (const [index, email] of addresses.entries()) {
      const made = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: index ? 'Remaining teammate' : 'Remaining owner' },
      });
      expect(made.error).toBeNull();
      users.push(made.data.user!.id);
    }
    expect((await human.auth.signInWithPassword({ email: addresses[0], password })).error).toBeNull();
    expect((await setupActor.auth.signInWithPassword({ email: addresses[1], password })).error).toBeNull();
    const made = await human.rpc('create_workspace_v2', { p_name: 'Remaining actual', p_slug: `remaining-${suffix}`, p_idempotency_key: suffix });
    expect(made.error).toBeNull();
    ws = made.data.data.id;
    expect((await service.from('workspace_memberships').insert({ workspace_id: ws, user_id: users[1], role: 'member' })).error).toBeNull();
    const command = async (operation: string, input: Record<string, unknown>, version?: number) => {
      const result = await setupActor.rpc('execute_operation', {
        p_workspace_id: ws,
        p_operation: operation,
        p_command: input,
        p_expected_version: version ?? null,
        p_idempotency_key: crypto.randomUUID(),
      });
      expect(result.error?.message ?? '').toBe('');
      return result.data.data;
    };
    const read = async (operation: string) => {
      const result = await setupActor.rpc('read_operation', { p_workspace_id: ws, p_operation: operation, p_query: {} });
      expect(result.error).toBeNull();
      return result.data;
    };
    const project = await command('create_project', { id: 'remaining-project', name: 'Remaining project' });
    const task = await command('create_task', { id: 'remaining-task', projectId: project.id, title: 'Remaining Home <literal>', assigneeUserId: users[0] });
    const first = await command('create_team', { id: 'remaining-old-team', name: 'Old team' });
    await command('set_team_member', { id: first.id, userId: users[1] }, first.version);
    expect(
      (
        await service.from('notifications').insert({
          workspace_id: ws,
          id: 'remaining-notification',
          task_id: task.id,
          notification_type: 'comment',
          legacy_metadata: { text: 'Remaining notification', snippet: 'Literal cloud', at: new Date().toISOString() },
        })
      ).error,
    ).toBeNull();
    await page.goto(`/app/w/${ws}/teams`);
    await page.getByLabel('E-mail').fill(addresses[0]);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await setLanguage(page, 'en');
    await expect(page.getByRole('button', { name: 'Create team', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create team', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Cloud <team>');
    await teamMemberChoice(page, 'Remaining teammate').check();
    await page.getByRole('button', { name: 'Save team', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.team-person button').filter({ has: page.getByText('Remaining teammate', { exact: true }) })).toBeVisible();
    const teams = (await read('list_teams')).items,
      newTeam = teams.find((team: { name: string }) => team.name === 'Cloud <team>');
    expect(newTeam).toBeTruthy();
    expect((await read('list_team_members')).items.filter((r: { userId: string }) => r.userId === users[1]).map((r: { teamId: string }) => r.teamId)).toEqual([
      newTeam.id,
    ]);
    await page.getByRole('button', { name: 'Edit team', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill('Reviewed team draft');
    await teamMemberChoice(page, 'Remaining owner').check();
    const old = (await read('list_teams')).items.find((item: { id: string }) => item.id === first.id);
    await command('set_team_member', { id: first.id, userId: users[0] }, old.version);
    await dialog.getByRole('button', { name: 'Save team', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Review current memberships and keep draft', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save team', exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Reviewed team draft');
    expect((await read('list_teams')).items.find((item: { id: string }) => item.id === newTeam.id).version).toBe(newTeam.version);
    expect((await read('list_team_members')).items.filter((r: { userId: string }) => r.userId === users[0]).map((r: { teamId: string }) => r.teamId)).toEqual([
      first.id,
    ]);
    await page.screenshot({ path: '/tmp/task6c-fix1-team-conflict.png', fullPage: true });
    await dialog.getByRole('button', { name: 'Review current memberships and keep draft', exact: true }).click();
    await expect(dialog).toContainText('Old team');
    await dialog.getByRole('button', { name: 'Save team', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await read('list_team_members')).items.filter((r: { userId: string }) => r.userId === users[0]).map((r: { teamId: string }) => r.teamId)).toEqual([
      newTeam.id,
    ]);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Reviewed team draft', exact: true, level: 1 })).toBeVisible();
    await page.goto(`/app/w/${ws}/teams`);
    await page.getByRole('button', { name: 'Create team', exact: true }).click();
    await dialog.getByLabel('Name', { exact: true }).fill('Ambiguous team once');
    const attempts: { p_command: unknown; p_idempotency_key: string }[] = [];
    await page.route('**/rest/v1/rpc/execute_operation', async route => {
      const body = route.request().postDataJSON();
      if (body.p_operation !== 'batch') return route.continue();
      attempts.push({ p_command: body.p_command, p_idempotency_key: body.p_idempotency_key });
      if (attempts.length === 1) {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        await route.abort('failed');
      } else await route.continue();
    });
    await dialog.getByRole('button', { name: 'Save team', exact: true }).click();
    await expect(dialog.getByLabel('Name', { exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Save team', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    const beforeUnload = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const prompt = await beforeUnload;
    expect(prompt.type()).toBe('beforeunload');
    await prompt.dismiss();
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Ambiguous team once');
    await page.screenshot({ path: '/tmp/task6c-fix1-team-ambiguous.png', fullPage: true });
    await dialog.getByRole('button', { name: 'Save team', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect((await read('list_teams')).items.filter((item: { name: string }) => item.name === 'Ambiguous team once')).toHaveLength(1);
    expect(Object.keys(counts).filter(k => k.endsWith(':429'))).toEqual([]);
    test.info().annotations.push({ type: 'fix-team-actual-cloud-counts', description: JSON.stringify(counts) });
  } finally {
    if (ws && (await service.from('workspaces').delete().eq('id', ws)).error) cleanup.push('workspace');
    for (const id of users) if ((await service.auth.admin.deleteUser(id)).error) cleanup.push('user');
    await human.auth.signOut();
    await setupActor.auth.signOut();
  }
  expect(cleanup).toEqual([]);
});

for (const operation of ['delete_task', 'delete_project'])
  test(`final fix dirty drawer survives remote ${operation}`, async ({ page }) => {
    const f = await fixture(page);
    await login(page);
    await page.getByText('Revisar navegação', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Texto preservado após exclusão');
    f.removeTask(operation);
    await expect(page.getByText('Esta tarefa foi excluída. Seu rascunho foi mantido para cópia.')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue('Texto preservado após exclusão');
    await expect(page.getByRole('button', { name: 'Salvar alterações', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Descartar rascunhos e fechar' }).click();
    await expect(page.getByRole('heading', { name: 'Detalhes da tarefa', exact: true })).toHaveCount(0);
  });
test('final fix discussion guard composes with core draft and uncertain send retry', async ({ page }) => {
  const f = await fixture(page);
  await login(page);
  await page.getByText('Revisar navegação', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Comentário', exact: true }).fill('Resposta preservada');
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await expect(page.getByRole('textbox', { name: 'Comentário', exact: true })).toHaveValue('Resposta preservada');
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Comandos e busca', exact: true });
  await palette.getByRole('textbox', { name: 'Buscar comandos', exact: true }).fill('Mudar para Outro espaço');
  await palette.getByRole('button', { name: 'Mudar para Outro espaço', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(workspace));
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Comentário', exact: true })).toHaveValue('Resposta preservada');
  f.writeOffline(true);
  await page.getByRole('button', { name: 'Comentar', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'conexão' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Comentário', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await expect(page.getByRole('textbox', { name: 'Comentário', exact: true })).toHaveValue('Resposta preservada');
  f.writeOffline(false);
  await page.getByRole('button', { name: 'Comentar', exact: true }).click();
  await expect(page.locator('article.comment .rich-content').filter({ hasText: 'Resposta preservada' })).toBeVisible();
  expect(f.commands.filter(c => c.p_operation === 'add_task_comment')).toHaveLength(1);
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await expect(page.getByRole('heading', { name: 'Detalhes da tarefa', exact: true })).toHaveCount(0);
});

test('final fix completed inline creation retries identical committed operation after lost response', async ({ page }) => {
  const f = await fixture(page);
  await login(page);
  const footer = page.getByRole('button', { name: 'Adicionar tarefa no grupo: done', exact: true });
  await footer.click();
  const composer = page.getByRole('textbox', { name: 'Nova tarefa no grupo: done', exact: true });
  await composer.fill('Criada concluída uma vez');
  f.dropResponse();
  await page.getByRole('button', { name: 'Adicionar ao grupo: done', exact: true }).click();
  await expect(composer).toBeDisabled();
  await expect(page.getByText('Confirme o envio anterior tentando novamente.')).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar ao grupo: done', exact: true }).click();
  await expect(footer).toBeEnabled();
  await expect(composer).toHaveCount(0);
  const writes = f.commands.filter(c => c.p_operation === 'batch');
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  const created = f.tasks().filter(t => t.title === 'Criada concluída uma vez');
  expect(created).toHaveLength(1);
  expect(created[0].status).toBe('done');
});

test('final fix blocked execution reason is visible independently from workflow status', async ({ page }) => {
  const f = await fixture(page);
  f.blocked();
  await login(page);
  await page.getByText('Revisar navegação', { exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Execução bloqueada: Preciso de uma decisão humana');
  await page.screenshot({ path: '/tmp/final-execution-blocked.png', fullPage: true });
  await expect(page.getByRole('button', { name: 'Status', exact: true })).toContainText('A fazer');
});

test('residual contextual history survives reload, continues later pages, and palette preserves comment query', async ({ page }) => {
  await fixture(page);
  const history = Array.from({ length: 105 }, (_, i) => ({
    id: `history-${String(i).padStart(3, '0')}`,
    workspaceId: workspace,
    legacyMetadata: {},
    projectId: i === 0 || i === 104 ? 'project-1' : 'other-project',
    taskId: i === 0 || i === 104 ? 'task-1' : 'other-task',
    actorUserId: i === 0 || i === 104 ? userId : 'other-user',
    verb: i === 104 ? 'Atividade na página seguinte' : i === 0 ? 'Atividade histórica inicial' : 'Outro contexto',
    createdAt: '2026-10-04T00:00:00Z',
  }));
  const comments = Array.from({ length: 105 }, (_, i) => ({
    id: `comment-${String(i).padStart(3, '0')}`,
    workspaceId: workspace,
    taskId: 'task-1',
    authorUserId: userId,
    body: i === 104 ? 'Instrução singular posterior' : `Comentário histórico ${i}`,
    createdAt: '2026-10-02T00:00:00Z',
    version: 1,
    legacyMetadata: {},
  }));
  const events = [
    {
      id: 'historic',
      operation: 'create_task',
      entityId: 'task-1',
      actorUserId: userId,
      actorAgentId: null,
      createdAt: '2026-10-03T00:00:00Z',
      payload: { projectId: 'project-1', taskId: 'task-1' },
    },
  ];
  const calls: string[] = [];
  await page.route('**/rest/v1/rpc/read_operation', async route => {
    const { p_operation: operation, p_query: q = {} } = route.request().postDataJSON();
    if (!['list_activity', 'list_comments', 'list_domain_events', 'get_event_cursor'].includes(operation)) return route.fallback();
    calls.push(operation);
    if (operation === 'get_event_cursor') {
      const last = events.at(-1)!;
      return route.fulfill({ json: { data: { cursor: JSON.stringify([last.createdAt, last.id]) } } });
    }
    const cursor = q.cursor ? JSON.parse(q.cursor) : null;
    const rows =
      operation === 'list_domain_events'
        ? events.filter(event => !cursor || JSON.stringify([event.createdAt, event.id]) > JSON.stringify(cursor))
        : (operation === 'list_activity' ? history : comments).filter(row => !q.taskId || row.taskId === q.taskId).filter(row => !cursor || row.id > cursor);
    const items = rows.slice(0, q.limit ?? 100);
    return route.fulfill({ json: { items, nextCursor: rows.length > items.length ? JSON.stringify(items.at(-1)!.id) : null } });
  });
  await login(page);
  expect(calls.filter(op => op === 'list_comments')).toEqual([]);
  // Login briefly mounts Home, whose compact history intentionally reads one bounded page.
  expect(calls.filter(op => op === 'list_activity').length).toBeLessThanOrEqual(1);
  await page.goto(`/app/w/${workspace}/project?project=project-1&tab=overview`);
  const feed = page.locator('.context-history');
  await expect(feed.getByText('Atividade histórica inicial', { exact: false })).toBeVisible();
  await expect(feed.getByText('comentou em', { exact: false }).first()).toBeVisible();
  await expect(feed.getByRole('status')).toContainText('Histórico parcial');
  await page.getByRole('link', { name: 'Atividade', exact: true }).last().click();
  await expect(feed.getByText('criou a tarefa', { exact: false })).toBeVisible();
  await feed.getByRole('button', { name: 'Carregar mais histórico', exact: true }).click();
  await expect(feed.getByText('Atividade na página seguinte', { exact: false })).toBeVisible();
  events.push({ ...events[0], id: 'after-hydration', operation: 'update_task', createdAt: '2026-10-21T00:00:00Z' });
  await expect(feed.getByText('alterou a tarefa', { exact: false })).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(feed.getByText('criou a tarefa', { exact: false })).toBeVisible();
  await page.goto(`/app/w/${workspace}/member?id=${userId}`);
  await expect(feed.getByText('Atividade histórica inicial', { exact: false })).toBeVisible();
  await feed.getByRole('button', { name: 'Carregar mais histórico', exact: true }).click();
  await expect(feed.getByText('Atividade na página seguinte', { exact: false })).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('gr8r:palette', { detail: { mode: 'search' } })));
  const palette = page.getByRole('dialog');
  await palette.locator('.button-row').getByRole('button', { name: 'Busca', exact: true }).click();
  await palette.getByRole('textbox', { name: 'Buscar comandos', exact: true }).fill('Instrução singular posterior');
  await palette.getByRole('combobox', { name: 'Categoria da busca' }).selectOption('comment');
  await palette.getByRole('button', { name: 'Continuar busca no histórico' }).click();
  await expect(page.getByRole('textbox', { name: 'Buscar no espaço' })).toHaveValue('Instrução singular posterior');
  await expect(page).toHaveURL(/category=comments/);
  await expect(page.getByText('Nenhum resultado.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Carregar mais comentários' }).click();
  await expect(page.locator('.panel-row').filter({ hasText: 'Instrução singular posterior' })).toBeVisible();
  await page.screenshot({ path: '/tmp/residual-palette-context.png', fullPage: true });
  await page.evaluate(() => document.dispatchEvent(new Event('gr8r:palette')));
  await page.getByRole('dialog').locator('.button-row').getByRole('button', { name: 'Busca', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Buscar comandos' }).fill('Comentário histórico 0');
  await page.getByRole('dialog').getByRole('combobox', { name: 'Categoria da busca' }).selectOption('comment');
  await page.getByRole('dialog').getByRole('button', { name: 'Continuar busca no histórico' }).click();
  await expect(page.getByRole('textbox', { name: 'Buscar no espaço' })).toHaveValue('Comentário histórico 0');
  await expect(page.locator('.panel-row').filter({ hasText: 'Comentário histórico 0' })).toBeVisible();
});

test('residual revoked execution keeps future reservation action gates and explicit intervention', async ({ page }) => {
  const f = await fixture(page);
  f.blocked(false);
  await login(page);
  await page.getByText('Revisar navegação', { exact: true }).click();
  await expect(page.getByRole('status')).toContainText('sem execução ativa');
  await expect(page.getByText('Reserva até', { exact: false })).toBeVisible();
  await expect(page.getByText('Reserva expirada em', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Concluir tarefa', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Retomar controle humano', exact: true })).toBeEnabled();
});
