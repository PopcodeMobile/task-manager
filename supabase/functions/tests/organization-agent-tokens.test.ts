import { assert, assertEquals, assertRejects } from '@std/assert';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { authenticate } from '../_shared/auth.ts';
import { executeCommand, executeQuery } from '../_shared/operations.ts';
import { handleRequest } from '../api/index.ts';
import { handleMcpRequest } from '../mcp/index.ts';

// Disposable format fixtures only; never a real issued credential.
const token = `krs_${'1'.repeat(32)}_${'A'.repeat(43)}`;
const workspaceId = '00000000-0000-4000-8000-000000000001';
const identity = {
  kind: 'organization_token',
  principalId: '00000000-0000-4000-8000-000000000002',
  connectionId: '00000000-0000-4000-8000-000000000003',
  agentId: '00000000-0000-4000-8000-000000000004',
  workspaceId,
  capability: 'write',
  userId: null,
  clientId: null,
};
type Call = { name: string; args: Record<string, unknown>; headers: Headers };
async function fixture(run: (calls: Call[], state: { active: boolean; capability: string; resolver: unknown }) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const env = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'AUTH_ISSUER'].map(key => [key, Deno.env.get(key)] as const);
  Deno.env.set('SUPABASE_URL', 'https://backend.example.test');
  Deno.env.set('SUPABASE_ANON_KEY', 'public-test-key');
  Deno.env.set('AUTH_ISSUER', 'https://backend.example.test/auth/v1');
  const calls: Call[] = [];
  const state = { active: true, capability: 'write', resolver: undefined as unknown };
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    assert(request.url.startsWith('https://backend.example.test/rest/v1/rpc/'));
    const name = new URL(request.url).pathname.split('/').at(-1)!;
    const args = await request.json();
    calls.push({ name, args, headers: request.headers });
    if (!state.active) return Response.json({ code: 'PT401', message: 'unauthorized', detail: token }, { status: 401 });
    if (name === 'authenticate_organization_agent_token') return Response.json(state.resolver ?? { ...identity, capability: state.capability });
    if (name === 'read_organization_agent_operation') {
      return Response.json({ items: args.p_operation === 'list_workspaces' ? [{ id: workspaceId }] : [], nextCursor: null });
    }
    if (name === 'execute_organization_agent_operation') return Response.json({ data: { id: 'task-1' }, eventId: 'event-1' });
    throw new Error('Unexpected database entrypoint');
  };
  try {
    await run(calls, state);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of env)
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
  }
}
const request = (value = token) => new Request('https://edge.example.test', { headers: { authorization: `Bearer ${value}` } });

Deno.test('opaque token authenticates as a frozen nonhuman Actor and sends secret only as private RPC argument', () =>
  fixture(async calls => {
    const actor = await authenticate(request());
    assertEquals<unknown>(actor, identity);
    assert(Object.isFrozen(actor));
    assert(!JSON.stringify(actor).includes(token));
    await assertRejects(() => executeQuery({ ...actor }, 'list_workspaces', null), Error, 'unauthorized');
    assertEquals(calls.length, 1);
    assertEquals(calls[0].name, 'authenticate_organization_agent_token');
    assertEquals(calls[0].args, { p_token: token });
    assertEquals(calls[0].headers.get('apikey'), 'public-test-key');
    assertEquals(calls[0].headers.get('authorization'), null);
  }),
);

Deno.test('malformed opaque tokens never contact backend; invalidated credentials and unsafe resolver output fail safely', () =>
  fixture(async (calls, state) => {
    for (const malformed of ['krs_bad', `${token}x`, token.replace('krs_', 'krs_F')]) {
      await assertRejects(() => authenticate(request(malformed)), Error, 'unauthorized');
    }
    assertEquals(calls.length, 0);
    state.active = false;
    await assertRejects(() => authenticate(request()), Error, 'unauthorized');
    state.active = true;
    for (const resolver of [{ ...identity, userId: 'human' }, { ...identity, capability: 'admin' }, { ...identity, workspaceId: null }, ['bad']]) {
      state.resolver = resolver;
      await assertRejects(() => authenticate(request()), Error, 'temporarily_unavailable');
    }
  }),
);

Deno.test('every token query and command uses narrow entrypoint and revalidates invalidation before a replay', () =>
  fixture(async (calls, state) => {
    const actor = await authenticate(request());
    await executeQuery(actor, 'list_workspaces', null);
    await executeQuery(actor, 'list_tasks', workspaceId);
    const command = { workspaceId, idempotencyKey: 'retry', input: { projectId: 'p1', title: 'Token task' } };
    const result = await executeCommand(actor, 'create_task', command);
    assertEquals(result.data, { id: 'task-1' });
    assertEquals(
      calls.slice(1).map(call => call.name),
      ['read_organization_agent_operation', 'read_organization_agent_operation', 'execute_organization_agent_operation'],
    );
    for (const call of calls) {
      assertEquals(call.args.p_token, token);
      assertEquals(call.headers.get('authorization'), null);
      assertEquals(call.headers.get('apikey'), 'public-test-key');
    }
    state.active = false;
    await assertRejects(() => executeCommand(actor, 'create_task', command), Error, 'unauthorized');
    assertEquals(calls.at(-1)!.name, 'execute_organization_agent_operation');
  }),
);

Deno.test('token boundary rejects administration, cross organization and readonly writes before dispatch', () =>
  fixture(async (calls, state) => {
    const actor = await authenticate(request());
    for (const operation of ['get_workspace', 'list_members', 'list_agents', 'get_preferences', 'run_sql']) {
      await assertRejects(() => executeQuery(actor, operation, workspaceId), Error, 'forbidden');
    }
    await assertRejects(() => executeQuery(actor, 'list_tasks', crypto.randomUUID()), Error, 'forbidden');
    for (const operation of ['create_workspace', 'create_project', 'batch', 'revoke_organization_agent_token']) {
      await assertRejects(() => executeCommand(actor, operation, { workspaceId, idempotencyKey: 'denied', input: {} }), Error, 'forbidden');
    }
    assertEquals(calls.length, 1);
    state.capability = 'read';
    const reader = await authenticate(request());
    await assertRejects(
      () => executeCommand(reader, 'create_task', { workspaceId, idempotencyKey: 'denied', input: { projectId: 'p1', title: 'No' } }),
      Error,
      'forbidden',
    );
    assertEquals(calls.length, 2);
    for (const operation of ['claim_task', 'renew_task_claim', 'release_task_claim', 'update_task', 'add_task_comment', 'complete_task']) {
      await assertRejects(() => executeCommand(reader, operation, { workspaceId, idempotencyKey: 'denied', input: {} }), Error, 'forbidden');
    }
    assertEquals(calls.length, 2);
  }),
);

Deno.test('REST token reads/writes are allowed while equivalent administration routes fail safely', () =>
  fixture(async () => {
    const send = (path: string, body?: unknown) =>
      handleRequest(
        new Request(`https://edge.example.test/api/v1/workspaces${path}`, {
          method: body ? 'POST' : 'GET',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    const read = await send(`/${workspaceId}/tasks`);
    assertEquals(read.status, 200);
    await read.body?.cancel();
    const write = await send(`/${workspaceId}/tasks`, { idempotencyKey: 'rest', input: { projectId: 'p1', title: 'REST token task' } });
    assertEquals(write.status, 201);
    await write.body?.cancel();
    for (const response of [await send(`/${workspaceId}/members`), await send('', { idempotencyKey: 'no', input: { name: 'No' } })]) {
      assertEquals(response.status, 403);
      const text = await response.text();
      assert(!text.includes(token));
      assert(!text.includes('backend.example.test'));
    }
  }),
);

Deno.test('opaque resolver projects only reviewed metadata and hides network/malformed backend failures', () =>
  fixture(async (_calls, state) => {
    state.resolver = { ...identity, token, internalPath: '/private' };
    const actor = await authenticate(request());
    assertEquals<unknown>(actor, identity);
    globalThis.fetch = () => Promise.reject(new Error(`network ${token}`));
    await assertRejects(() => authenticate(request()), Error, 'temporarily_unavailable');
    globalThis.fetch = () => Promise.resolve(new Response('backend failure', { status: 503 }));
    await assertRejects(() => authenticate(request()), Error, 'temporarily_unavailable');
    globalThis.fetch = () => Promise.resolve(new Response('not JSON', { status: 200 }));
    await assertRejects(() => authenticate(request()), Error, 'temporarily_unavailable');
  }),
);

Deno.test('JWT user verification and original database bearer header survive token routing unchanged', () =>
  fixture(async () => {
    const userId = '00000000-0000-4000-8000-000000000010';
    const claims = {
      sub: userId,
      iss: 'https://backend.example.test/auth/v1',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 300,
      client_id: 'oauth-client',
    };
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    const jwt = (change: Record<string, unknown> = {}) => `${encode({ alg: 'HS256' })}.${encode({ ...claims, ...change })}.verified-signature`;
    let verifications = 0;
    globalThis.fetch = async (input, init) => {
      const req = new Request(input, init);
      assertEquals(req.headers.get('apikey'), 'public-test-key');
      if (req.url.endsWith('/auth/v1/user')) {
        verifications++;
        return Response.json({ id: userId });
      }
      assertEquals(req.url, 'https://backend.example.test/rest/v1/rpc/read_operation');
      assertEquals(req.headers.get('authorization'), `Bearer ${jwt()}`);
      const body = await req.json();
      assertEquals(Object.hasOwn(body, 'p_token'), false);
      return Response.json({ items: [], nextCursor: null });
    };
    const actor = await authenticate(request(jwt()));
    assertEquals(actor, { userId, clientId: 'oauth-client', connectionId: null });
    await executeQuery(actor, 'list_workspaces', null);
    for (const change of [
      { sub: crypto.randomUUID() },
      { iss: 'https://other.example.test' },
      { aud: 'other' },
      { exp: 1 },
      { nbf: 9999999999 },
      { client_id: '' },
    ]) {
      await assertRejects(() => authenticate(request(jwt(change))), Error, 'unauthorized');
    }
    assertEquals(verifications, 7);
    globalThis.fetch = () => Promise.resolve(new Response(null, { status: 401 }));
    await assertRejects(() => authenticate(request(jwt())), Error, 'unauthorized');
  }),
);

Deno.test('real MCP SDK can initialize/list/read/create with opaque token and fresh discovery rejects revocation', () =>
  fixture(async (calls, state) => {
    const client = new Client({ name: 'organization-token-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL('https://edge.example.test/functions/v1/mcp'), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
      fetch: (input, init) => handleMcpRequest(new Request(input, init)),
    });
    try {
      await client.connect(transport);
      assertEquals(
        (await client.listTools()).tools.map(tool => tool.name).sort(),
        [
          'list_workspaces',
          'list_projects',
          'list_tasks',
          'get_task',
          'list_task_activity',
          'create_task',
          'claim_task',
          'renew_task_claim',
          'release_task_claim',
          'update_task',
          'add_task_comment',
          'complete_task',
        ].sort(),
      );
      const own = await client.callTool({ name: 'list_workspaces', arguments: {} });
      assertEquals((own.structuredContent as { items: { id: string }[] }).items, [{ id: workspaceId }]);
      const write = await client.callTool({
        name: 'create_task',
        arguments: { workspace_id: workspaceId, idempotency_key: 'mcp', input: { projectId: 'p1', title: 'MCP token task' } },
      });
      assert(!write.isError);
      const cross = await client.callTool({ name: 'list_tasks', arguments: { workspace_id: crypto.randomUUID() } });
      assertEquals(cross.isError, true);
      assert(calls.filter(call => call.name === 'read_organization_agent_operation').length >= 4);
      state.active = false;
      await assertRejects(() => client.listTools());
    } finally {
      await client.close();
    }
  }),
);

Deno.test('MCP initialize and tools discovery revalidate after initial credential resolution', () =>
  fixture(async () => {
    for (const method of ['initialize', 'tools/list']) {
      globalThis.fetch = (input, init) => {
        const req = new Request(input, init);
        if (req.url.endsWith('/authenticate_organization_agent_token')) return Promise.resolve(Response.json(identity));
        assert(req.url.endsWith('/read_organization_agent_operation'));
        return Promise.resolve(Response.json({ code: 'PT401', message: 'unauthorized' }, { status: 401 }));
      };
      const response = await handleMcpRequest(
        new Request('https://edge.example.test/functions/v1/mcp', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method }),
        }),
      );
      assertEquals(response.status, 401);
      assertEquals(response.headers.get('Cache-Control'), 'no-store');
      assert(!JSON.stringify(await response.json()).includes(token));
    }
  }),
);
