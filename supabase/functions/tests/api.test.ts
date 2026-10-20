import { assertEquals } from '@std/assert';
Deno.test('API rejects missing tokens with safe request-correlated errors', async () => {
  const { handleRequest } = await import('../api/index.ts');
  const response = await handleRequest(new Request('http://local/api/v1/workspaces'));
  assertEquals(response.status, 401);
  const body = await response.json();
  assertEquals(body.error.code, 'unauthorized');
  assertEquals(typeof body.error.requestId, 'string');
  assertEquals(body.error.stack, undefined);
});
Deno.test('API rejects unrecognized operations and spoofed identity before dispatch', async () => {
  const { validateCommand } = await import('../_shared/validation.ts');
  for (const [operation, input] of [
    ['run_sql', { sql: 'select 1' }],
    ['update_task', { id: 't', actorUserId: 'spoof' }],
    ['update_task', { id: 't', status: 'done' }],
  ]) {
    let code = '';
    try {
      validateCommand(operation as string, {
        workspaceId: '00000000-0000-0000-0000-000000000001',
        idempotencyKey: 'x',
        expectedVersion: 1,
        input,
      });
    } catch (e) {
      code = (e as { code: string }).code;
    }
    assertEquals(code, 'validation_error');
  }
});

Deno.test('input schemas reject unsafe shapes, missing CAS and unbounded lists', async () => {
  const { validateCommand, validateQuery } = await import('../_shared/validation.ts');
  const workspaceId = crypto.randomUUID();
  const failures: unknown[] = [
    null,
    [],
    { workspaceId, idempotencyKey: '', input: { projectId: 'p', title: 'T' } },
    { workspaceId: 'not-uuid', idempotencyKey: 'x', input: {} },
    { workspaceId, idempotencyKey: 'x', expectedVersion: 0, input: { id: 't', title: 'T' } },
    { workspaceId, idempotencyKey: 'x', input: { id: 't', title: 'T' } },
  ];
  for (const value of failures) {
    let code = '';
    try {
      validateCommand('update_task', value);
    } catch (e) {
      code = (e as { code: string }).code;
    }
    assertEquals(code, 'validation_error');
  }
  for (const input of [
    { id: 't', sortOrder: 'many' },
    { id: 't', priority: 'root' },
    { id: 't', assigneeUserId: 'spoof' },
    { id: 't', attributes: { role: 'owner' } },
    { id: 't', attributes: { estimate: { complex: 'wrong' } } },
  ]) {
    let code = '';
    try {
      validateCommand('update_task', { workspaceId, idempotencyKey: 'x', expectedVersion: 1, input });
    } catch (e) {
      code = (e as { code: string }).code;
    }
    assertEquals(code, 'validation_error');
  }
  for (const query of [{ limit: 101 }, { limit: 0 }, { limit: 1.5 }, { cursor: [] }, { sql: 'select 1' }]) {
    let code = '';
    try {
      validateQuery('list_tasks', query);
    } catch (e) {
      code = (e as { code: string }).code;
    }
    assertEquals(code, 'validation_error');
  }
  const valid = validateCommand('update_project', {
    workspaceId,
    idempotencyKey: 'x',
    expectedVersion: 1,
    input: { id: 'p', attributes: { icon: 'rocket', milestones: [{ name: 'Launch', date: '2026-12-01' }] } },
  });
  assertEquals(valid.input.id, 'p');
  assertEquals(validateQuery('list_tasks', { limit: 100, cursor: 'last' }), { limit: 100, cursor: 'last' });
});
Deno.test('preflight grants CORS only to explicitly configured origins', async () => {
  const { handleRequest } = await import('../api/index.ts');
  const previous = Deno.env.get('API_ALLOWED_ORIGINS');
  try {
    Deno.env.set('API_ALLOWED_ORIGINS', 'https://panel.example');
    const allowed = await handleRequest(
      new Request('https://api.example/api/v1/workspaces', {
        method: 'OPTIONS',
        headers: { origin: 'https://panel.example' },
      }),
    );
    assertEquals(allowed.status, 204);
    assertEquals(allowed.headers.get('Access-Control-Allow-Origin'), 'https://panel.example');
    const denied = await handleRequest(
      new Request('https://api.example/api/v1/workspaces', {
        method: 'OPTIONS',
        headers: { origin: 'https://attacker.example' },
      }),
    );
    assertEquals(denied.headers.get('Access-Control-Allow-Origin'), null);
  } finally {
    if (previous === undefined) Deno.env.delete('API_ALLOWED_ORIGINS');
    else Deno.env.set('API_ALLOWED_ORIGINS', previous);
  }
});

Deno.test('005 panel command schemas accept clearable details and bounded atomic batches', async () => {
  const { validateCommand } = await import('../_shared/validation.ts');
  const envelope = { workspaceId: crypto.randomUUID(), idempotencyKey: 'panel', expectedVersion: 1 };
  for (const [operation, input] of [
    ['update_task', { id: 't', description: '' }],
    ['update_project', { id: 'p', description: '' }],
    ['update_subtask', { id: 's', taskId: 't', attributes: { assignee: 'legacy-user', due: '', note: '' } }],
    ['delete_comment', { id: 'c' }],
    ['update_workspace', { name: 'Workspace', slug: 'workspace', color: '#abcdef' }],
    ['batch', { commands: [{ operation: 'update_task', input: { id: 't', description: '' }, expectedVersion: 1 }] }],
  ] as const)
    assertEquals(validateCommand(operation, { ...envelope, input }).input, input);
  for (const [operation, input] of [
    ['update_task', { id: 't', title: '' }],
    ['update_workspace', { name: ' ', slug: 'Bad Slug', color: 'red' }],
    ['update_subtask', { id: 's', taskId: 't', attributes: { authorUserId: crypto.randomUUID() } }],
    ['update_subtask', { id: 's', taskId: 't', attributes: { due: '2026-02-31' } }],
    ['batch', { commands: [] }],
    ['batch', { commands: Array(101).fill({ operation: 'create_label', input: { name: 'x' } }) }],
    ['batch', { commands: [{ operation: 'claim_task', input: { id: 't' }, expectedVersion: 1 }] }],
    ['batch', { commands: [{ operation: 'update_task', input: { id: 't' } }] }],
    ['batch', { commands: [{ operation: 'create_label', input: { name: 'x' }, workspaceId: crypto.randomUUID() }] }],
  ] as const) {
    let code = '';
    try {
      validateCommand(operation, { ...envelope, input });
    } catch (error) {
      code = (error as { code: string }).code;
    }
    assertEquals(code, 'validation_error');
  }
});
