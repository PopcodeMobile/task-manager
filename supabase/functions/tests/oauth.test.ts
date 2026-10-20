import { assert, assertEquals, assertRejects } from '@std/assert';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { handleMcpRequest } from '../mcp/index.ts';
import { decodeJwt, importJWK, type JWK, SignJWT } from 'jose';
import { handleRequest } from '../api/index.ts';
const url = Deno.env.get('TEST_SUPABASE_URL'),
  anon = Deno.env.get('TEST_SUPABASE_ANON_KEY'),
  admin = Deno.env.get('TEST_SUPABASE_SERVICE_ROLE_KEY');
Deno.test({
  name: 'real local OAuth PKCE isolates two users, grants, MCP transport, refresh and immediate revocation',
  ignore: !url || !anon || !admin,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const base = url!, key = anon!;
    Deno.env.set('SUPABASE_URL', base);
    Deno.env.set('SUPABASE_ANON_KEY', key);
    Deno.env.set('AUTH_ISSUER', `${base}/auth/v1`);
    const api = async (path: string, token: string, body?: unknown, method = body ? 'POST' : 'GET') => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { apikey: key, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      return { status: response.status, data };
    };
    const rpc = (token: string, name: string, args: unknown) => api(`/rest/v1/rpc/${name}`, token, args);
    const service = createClient(base, admin!, { auth: { persistSession: false, autoRefreshToken: false } });
    const users: { id: string; token: string; workspace: string; client: SupabaseClient }[] = [];
    let clientId = '';
    const native = Deno.serve(
      { hostname: '127.0.0.1', port: 0, onListen: () => {} },
      (req) => new URL(req.url).pathname.startsWith('/api') ? handleRequest(req) : handleMcpRequest(req),
    );
    const endpoint = Deno.env.get('TEST_MCP_URL') ?? `http://127.0.0.1:${native.addr.port}/functions/v1/mcp`;
    Deno.env.set('MCP_RESOURCE_URL', endpoint);
    const mcp = async (token: string) => {
      const client = new Client({ name: 'test-claude', version: '1.0.0' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(endpoint), {
          requestInit: { headers: { authorization: `Bearer ${token}` } },
        }),
      );
      return client;
    };
    try {
      for (let i = 0; i < 2; i++) {
        const email = `oauth-${crypto.randomUUID()}@example.test`, password = `Task3-${crypto.randomUUID()}!`;
        const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
        assert(!created.error);
        const client = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
        const signed = await client.auth.signInWithPassword({ email, password });
        assert(!signed.error && signed.data.session);
        const token = signed.data.session.access_token;
        const result = await rpc(token, 'create_workspace_v2', {
          p_name: `OAuth ${i}`,
          p_slug: `oauth-${crypto.randomUUID()}`,
          p_idempotency_key: crypto.randomUUID(),
        });
        assertEquals(result.status, 200);
        const workspace = result.data.data.id;
        const project = await rpc(token, 'execute_operation', {
          p_workspace_id: workspace,
          p_operation: 'create_project',
          p_command: { id: 'p1', name: 'OAuth project', key: 'OAUTH' },
          p_idempotency_key: crypto.randomUUID(),
        });
        assertEquals(project.status, 200);
        users.push({ id: created.data.user!.id, token, workspace, client });
      }
      const registration = await api('/auth/v1/oauth/clients/register', key, {
        client_name: 'Claude integration test',
        redirect_uris: ['http://127.0.0.1:5180/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });
      assertEquals(registration.status, 201);
      clientId = registration.data.client_id;
      const start = async (user: typeof users[number]) => {
        const verifier = crypto.randomUUID() + crypto.randomUUID();
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        const challenge = btoa(String.fromCharCode(...new Uint8Array(hash))).replaceAll('+', '-').replaceAll('/', '_')
          .replaceAll('=', '');
        const state = crypto.randomUUID();
        const auth = new URL(`${base}/auth/v1/oauth/authorize`);
        for (
          const [k, v] of Object.entries({
            client_id: clientId,
            response_type: 'code',
            redirect_uri: 'http://127.0.0.1:5180/callback',
            scope: 'openid',
            state,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            prompt: 'consent',
          })
        ) auth.searchParams.set(k, v);
        const response = await fetch(auth, { redirect: 'manual' });
        assertEquals(response.status, 302);
        await response.body?.cancel();
        const authorizationId = new URL(response.headers.get('location')!).searchParams.get('authorization_id')!;
        assert(authorizationId);
        const details = await user.client.auth.oauth.getAuthorizationDetails(authorizationId);
        assert(!details.error && details.data && 'authorization_id' in details.data);
        assertEquals(details.data.client.id, clientId);
        assertEquals(details.data.user.id, user.id);
        return { authorizationId, verifier, state };
      };
      const authorize = async (user: typeof users[number], capability: 'read' | 'write') => {
        const flow = await start(user);
        const prepared = await rpc(user.token, 'prepare_integration_consent', {
          p_authorization_id: flow.authorizationId,
          p_grants: [{ workspaceId: user.workspace, capability }],
        });
        assertEquals(prepared.status, 200);
        // Other principal cannot activate this request or substitute its own identity.
        assertEquals(
          (await rpc(users.find((x) => x !== user)!.token, 'activate_integration_consent', {
            p_authorization_id: flow.authorizationId,
          })).status,
          403,
        );
        assertEquals(
          (await rpc(user.token, 'activate_integration_consent', { p_authorization_id: flow.authorizationId })).status,
          403,
        );
        const approved = await user.client.auth.oauth.approveAuthorization(flow.authorizationId, {
          skipBrowserRedirect: true,
        });
        assert(!approved.error && approved.data);
        const callback = new URL(approved.data.redirect_url);
        assertEquals(callback.searchParams.get('state'), flow.state);
        assertEquals(
          (await rpc(user.token, 'activate_integration_consent', { p_authorization_id: flow.authorizationId })).status,
          200,
        );
        const response = await fetch(`${base}/auth/v1/oauth/token`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', apikey: key },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            redirect_uri: 'http://127.0.0.1:5180/callback',
            code: callback.searchParams.get('code')!,
            code_verifier: flow.verifier,
          }),
        });
        const tokens = await response.json();
        assertEquals(response.status, 200);
        assert(tokens.access_token && tokens.refresh_token);
        return { ...tokens, connectionId: prepared.data.connectionId };
      };
      const first = await authorize(users[0], 'write'), second = await authorize(users[1], 'read');
      // Negative fixtures are deliberately re-signed with a disposable local key, never called OAuth exchanges.
      const signingKeys = Deno.env.get('TEST_OAUTH_SIGNING_KEYS');
      if (signingKeys) {
        const jwk = (JSON.parse(signingKeys) as JWK[])[0];
        const signingKey = await importJWK({ ...jwk, key_ops: ['sign'] }, 'ES256');
        for (
          const changed of [{ exp: Math.floor(Date.now() / 1000) - 10 }, {
            iss: 'https://wrong-issuer.example.test/auth/v1',
          }, { aud: 'wrong-audience' }]
        ) {
          const invalid = await new SignJWT({ ...decodeJwt<Record<string, unknown>>(first.access_token), ...changed })
            .setProtectedHeader({ alg: 'ES256', kid: jwk.kid }).sign(signingKey);
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${invalid}`,
              'content-type': 'application/json',
              accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
          });
          assertEquals(response.status, 401);
          await response.body?.cancel();
        }
      }
      const humanTask = await rpc(users[1].token, 'execute_operation', {
        p_workspace_id: users[1].workspace,
        p_operation: 'create_task',
        p_command: { projectId: 'p1', title: 'Readonly cannot reserve' },
        p_idempotency_key: crypto.randomUUID(),
      });
      assertEquals(humanTask.status, 200);
      assertEquals(
        (await rpc(second.access_token, 'execute_operation', {
          p_workspace_id: users[1].workspace,
          p_operation: 'claim_task',
          p_command: { id: humanTask.data.data.id },
          p_expected_version: 1,
          p_idempotency_key: crypto.randomUUID(),
        })).status,
        403,
      );
      const readonly = await mcp(second.access_token);
      try {
        const denied = await readonly.callTool({
          name: 'claim_task',
          arguments: {
            workspace_id: users[1].workspace,
            idempotency_key: crypto.randomUUID(),
            expected_version: 1,
            input: { id: humanTask.data.data.id },
          },
        });
        assertEquals(denied.isError, true);
      } finally {
        await readonly.close();
      }
      // Legacy snapshots/base/archive surfaces stay fenced even with an active normalized grant.
      const snapshots = await api(
        `/rest/v1/workspace_snapshots?workspace_id=eq.${users[0].workspace}`,
        first.access_token,
      );
      assert(snapshots.status === 200 && snapshots.data.length === 0);
      const baseRows = await api(`/rest/v1/workspaces?id=eq.${users[0].workspace}`, first.access_token);
      assert(baseRows.status === 200 && baseRows.data.length === 0);

      for (const [i, tokens] of [first, second].entries()) {
        const client = await mcp(tokens.access_token);
        try {
          const tools = await client.listTools();
          assertEquals(tools.tools.length, 12);
          const own = await client.callTool({ name: 'list_workspaces', arguments: {} });
          assert(!own.isError);
          const items = (own.structuredContent as { items: { id: string }[] }).items;
          assertEquals(items.map((x) => x.id), [users[i].workspace]);
          const other = await client.callTool({
            name: 'list_tasks',
            arguments: { workspace_id: users[1 - i].workspace },
          });
          assertEquals(other.isError, true);
          const list = await client.callTool({
            name: 'list_projects',
            arguments: { workspace_id: users[i].workspace },
          });
          assert(!list.isError);
        } finally {
          await client.close();
        }
      }
      assertEquals(
        (await rpc(second.access_token, 'execute_operation', {
          p_workspace_id: users[1].workspace,
          p_operation: 'create_task',
          p_command: { projectId: 'p1', title: 'Denied' },
          p_idempotency_key: crypto.randomUUID(),
        })).status,
        403,
      );
      const agents = await rpc(users[1].token, 'read_operation', {
        p_workspace_id: users[1].workspace,
        p_operation: 'list_agents',
      });
      assertEquals(agents.data.items.length, 0);
      const writer = await mcp(first.access_token);
      let task: { id: string; version: number };
      try {
        const create = await writer.callTool({
          name: 'create_task',
          arguments: {
            workspace_id: users[0].workspace,
            idempotency_key: crypto.randomUUID(),
            input: { projectId: 'p1', title: 'Real OAuth MCP task' },
          },
        });
        assert(!create.isError);
        task = (create.structuredContent as { data: { id: string; version: number } }).data;
        const read = await writer.callTool({
          name: 'get_task',
          arguments: { workspace_id: users[0].workspace, id: task.id },
        });
        assert(!read.isError);
        const claim = await writer.callTool({
          name: 'claim_task',
          arguments: {
            workspace_id: users[0].workspace,
            idempotency_key: crypto.randomUUID(),
            expected_version: task.version,
            input: { id: task.id },
          },
        });
        assert(!claim.isError);
        const claimed =
          (claim.structuredContent as { data: { task: { executorAgentId: string }; claimToken: string } }).data;
        assert(claimed.task.executorAgentId && claimed.claimToken);
        const command = async (name: string, input: Record<string, unknown>, expected_version?: number) => {
          const result = await writer.callTool({
            name,
            arguments: {
              workspace_id: users[0].workspace,
              idempotency_key: crypto.randomUUID(),
              ...(expected_version ? { expected_version } : {}),
              input,
            },
          });
          assert(!result.isError, `MCP ${name} must succeed`);
          return result;
        };
        await command('renew_task_claim', { id: task.id, claimToken: claimed.claimToken }, 2);
        await command(
          'update_task',
          { id: task.id, claimToken: claimed.claimToken, title: 'Updated through real MCP' },
          3,
        );
        await command('add_task_comment', { taskId: task.id, body: 'OAuth transport verified' });
        const activity = await writer.callTool({
          name: 'list_task_activity',
          arguments: { workspace_id: users[0].workspace, taskId: task.id },
        });
        assert(!activity.isError);
        const ownTasks = await writer.callTool({
          name: 'list_tasks',
          arguments: { workspace_id: users[0].workspace, limit: 1 },
        });
        assert(!ownTasks.isError);
        await command('release_task_claim', { id: task.id, claimToken: claimed.claimToken }, 4);
        const reclaimed = await command('claim_task', { id: task.id }, 5);
        const completionToken = (reclaimed.structuredContent as { data: { claimToken: string } }).data.claimToken;
        const completed = await command('complete_task', { id: task.id, claimToken: completionToken }, 6);
        assertEquals((completed.structuredContent as { data: { status: string } }).data.status, 'done');

        assertEquals(
          (await rpc(users[0].token, 'revoke_integration_connection', { p_connection_id: first.connectionId })).status,
          204,
        );
        assertEquals(
          (await rpc(first.access_token, 'read_operation', {
            p_workspace_id: users[0].workspace,
            p_operation: 'list_tasks',
          })).status,
          403,
        );
        const denied = await fetch(
          `http://127.0.0.1:${native.addr.port}/api/v1/workspaces/${users[0].workspace}/tasks`,
          { headers: { authorization: `Bearer ${first.access_token}` } },
        );
        assertEquals(denied.status, 403);
        await denied.body?.cancel();
        await assertRejects(() => writer.listTools());
      } finally {
        await writer.close();
      }
      // Membership removal defeats a still-valid readonly OAuth token at every domain boundary.
      const removed = await service.from('workspace_memberships').delete().eq('workspace_id', users[1].workspace).eq(
        'user_id',
        users[1].id,
      );
      assert(!removed.error, removed.error?.code + ':' + removed.error?.message);
      assertEquals(
        (await rpc(second.access_token, 'read_operation', {
          p_workspace_id: users[1].workspace,
          p_operation: 'list_tasks',
        })).status,
        403,
      );
      const denied = await fetch(`http://127.0.0.1:${native.addr.port}/api/v1/workspaces/${users[1].workspace}/tasks`, {
        headers: { authorization: `Bearer ${second.access_token}` },
      });
      assertEquals(denied.status, 403);
      await denied.body?.cancel();
      await assertRejects(() => mcp(second.access_token));
      const refresh = await fetch(`${base}/auth/v1/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', apikey: key },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: clientId,
          refresh_token: first.refresh_token,
        }),
      });
      const refreshed = await refresh.json();
      assertEquals(refresh.status, 200);
      assert(refreshed.access_token);
      assertEquals(
        (await rpc(refreshed.access_token, 'read_operation', {
          p_workspace_id: users[0].workspace,
          p_operation: 'list_tasks',
        })).status,
        403,
      );
      await assertRejects(() => mcp(users[0].token));
      // Reconsent write -> read cannot reuse the old executor or write permission.
      const revokeBeforeReconsent = await users[0].client.auth.oauth.revokeGrant({ clientId });
      assert(!revokeBeforeReconsent.error);
      const downgraded = await authorize(users[0], 'read');
      assertEquals(
        (await rpc(downgraded.access_token, 'execute_operation', {
          p_workspace_id: users[0].workspace,
          p_operation: 'claim_task',
          p_command: { id: task!.id },
          p_expected_version: 2,
          p_idempotency_key: crypto.randomUUID(),
        })).status,
        403,
      );
      const revokedAuth = await users[0].client.auth.oauth.revokeGrant({ clientId });
      assert(!revokedAuth.error);
      assertEquals(
        (await rpc(downgraded.access_token, 'read_operation', {
          p_workspace_id: users[0].workspace,
          p_operation: 'list_tasks',
        })).status,
        403,
      );
      await assertRejects(() => mcp(downgraded.access_token));
    } finally {
      for (const user of users) {
        await service.from('task_claims').delete().eq('workspace_id', user.workspace);
        const deleted = await service.from('workspaces').delete().eq('id', user.workspace);
        assert(!deleted.error, deleted.error?.code + ':' + deleted.error?.message);
        await service.auth.admin.deleteUser(user.id);
        await user.client.auth.signOut();
      }
      if (clientId) await service.auth.admin.oauth.deleteClient(clientId);
      await native.shutdown();
      Deno.env.delete('MCP_RESOURCE_URL');
    }
  },
});
