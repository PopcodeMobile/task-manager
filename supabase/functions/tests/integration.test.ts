import { assert, assertEquals } from '@std/assert';
import { handleRequest } from '../api/index.ts';
const url = Deno.env.get('SUPABASE_URL'),
  key = Deno.env.get('SUPABASE_ANON_KEY'),
  adminKey = Deno.env.get('TEST_SUPABASE_SERVICE_KEY');
Deno.test({
  name: 'real local Auth and PostgREST exercise HTTP commands, CAS, replay, tampered JWT and membership revocation',
  ignore: !url || !key || !adminKey,
  fn: async () => {
    const secret = crypto.randomUUID() + 'Aa1!';
    const email = `task2-${crypto.randomUUID()}@example.test`;
    const signup = await fetch(`${url}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: key!, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: secret }),
    });
    const session = await signup.json();
    assertEquals(signup.status, 200);
    assert(typeof session.access_token === 'string');
    const token = session.access_token;
    let workspace: string | undefined;
    const call = async (method: string, path: string, body?: unknown, bearer = token) => {
      const response = await handleRequest(
        new Request('http://api.local/api/v1/workspaces' + path, {
          method,
          headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
      return { status: response.status, body: await response.json() };
    };
    const admin = async (path: string, method = 'DELETE', body?: unknown) => {
      const response = await fetch(`${url}${path}`, {
        method,
        headers: { authorization: `Bearer ${adminKey}`, apikey: adminKey!, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      await response.body?.cancel();
      return response.status;
    };
    try {
      assertEquals((await call('GET', '')).status, 200);
      const created = await call('POST', '', {
        idempotencyKey: crypto.randomUUID(),
        input: { name: 'Task2 integration', slug: 'task2-integration' },
      });
      assertEquals(created.status, 201);
      workspace = created.body.data.id;
      assert(typeof workspace === 'string');
      const project = await call('POST', `/${workspace}/projects`, {
        idempotencyKey: crypto.randomUUID(),
        input: { name: 'Project', key: 'INT', attributes: { icon: 'rocket' } },
      });
      assertEquals(project.status, 201);
      const taskInput = {
        idempotencyKey: crypto.randomUUID(),
        input: { projectId: project.body.data.id, title: 'Real API task' },
      };
      const task = await call('POST', `/${workspace}/tasks`, taskInput);
      assertEquals(task.status, 201);
      const replay = await call('POST', `/${workspace}/tasks`, taskInput);
      assertEquals(replay.body.eventId, task.body.eventId);
      const conflict = await call('PATCH', `/${workspace}/tasks/${task.body.data.id}`, {
        idempotencyKey: crypto.randomUUID(),
        expectedVersion: 99,
        input: { title: 'Conflict' },
      });
      assertEquals(conflict.status, 409);
      assertEquals(conflict.body.error.code, 'version_conflict');
      assert(typeof conflict.body.error.requestId === 'string');
      const bypass = await call('PATCH', `/${workspace}/tasks/${task.body.data.id}`, {
        idempotencyKey: crypto.randomUUID(),
        expectedVersion: 1,
        input: { status: 'done' },
      });
      assertEquals(bypass.status, 422);
      const spoof = await call('POST', `/${workspace}/commands/create_task`, {
        idempotencyKey: crypto.randomUUID(),
        input: { projectId: project.body.data.id, title: 'Spoof', actorUserId: session.user.id },
      });
      assertEquals(spoof.status, 422);
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      payload.sub = crypto.randomUUID();
      parts[1] = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      assertEquals((await call('GET', '', undefined, parts.join('.'))).status, 401);
      const page = await call('GET', `/${workspace}/tasks?limit=1`);
      assertEquals(page.status, 200);
      assertEquals(page.body.items.length, 1);
      const activity = await call('GET', `/${workspace}/domain-events?limit=1`);
      assertEquals(activity.status, 200);
      assertEquals(activity.body.items.length, 1);
      assert(typeof activity.body.nextCursor === 'string');
      assertEquals(activity.body.items[0].payload.claimToken, undefined);
      const workspaces = await call('GET', '');
      const item = workspaces.body.items.find((w: { id: string }) => w.id === workspace);
      assertEquals(item.legacyMetadata, undefined);
      assertEquals(item.legacy_metadata, undefined);
      assertEquals(await admin(`/rest/v1/workspace_memberships?workspace_id=eq.${workspace}&user_id=eq.${session.user.id}`), 204);
      assertEquals((await call('POST', `/${workspace}/tasks`, taskInput)).status, 403);
    } finally {
      if (workspace) assertEquals(await admin(`/rest/v1/workspaces?id=eq.${workspace}`), 204);
      assertEquals(await admin(`/auth/v1/admin/users/${session.user.id}`), 200);
    }
  },
});
