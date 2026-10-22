import { assert, assertEquals } from '@std/assert';
import { handleRequest } from '../api/index.ts';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000010';
const invitationId = '00000000-0000-4000-8000-000000000020';
const encode = (value: unknown) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const jwt = (change: Record<string, unknown> = {}) =>
  `${encode({ alg: 'HS256' })}.${encode({
    sub: userId,
    iss: 'https://backend.example.test/auth/v1',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 300,
    ...change,
  })}.verified-signature`;
const created = {
  id: invitationId,
  workspaceId,
  email: 'ana@example.test',
  role: 'member',
  status: 'pending',
  expiresAt: '2026-10-29T12:00:00.000Z',
  sendCount: 1,
  workspaceName: 'Delta <b>',
  inviterName: 'Hugo\r\nBcc: x',
};
type Mail = { headers: Headers; body: Record<string, unknown> };
async function fixture(run: (state: { rpc: Record<string, unknown>[]; mail: Mail[]; resend: number; rpcError: unknown }) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const keys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'AUTH_ISSUER', 'RESEND_API_KEY', 'APP_URL', 'INVITE_FROM'];
  const saved = keys.map(key => [key, Deno.env.get(key)] as const);
  Deno.env.set('SUPABASE_URL', 'https://backend.example.test');
  Deno.env.set('SUPABASE_ANON_KEY', 'public-test-key');
  Deno.env.set('AUTH_ISSUER', 'https://backend.example.test/auth/v1');
  Deno.env.set('RESEND_API_KEY', 're_test_fixture');
  Deno.env.set('APP_URL', 'https://tarefas.example.test');
  Deno.env.delete('INVITE_FROM');
  const state = { rpc: [] as Record<string, unknown>[], mail: [] as Mail[], resend: 200, rpcError: null as unknown };
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.url === 'https://backend.example.test/auth/v1/user') return Response.json({ id: userId });
    if (request.url === 'https://backend.example.test/rest/v1/rpc/create_workspace_invitation') {
      assertEquals(request.headers.get('authorization'), `Bearer ${jwt()}`);
      state.rpc.push(await request.json());
      if (state.rpcError) return Response.json(state.rpcError, { status: 400 });
      return Response.json(created);
    }
    if (request.url === 'https://api.resend.com/emails') {
      state.mail.push({ headers: request.headers, body: await request.json() });
      return Response.json(state.resend === 200 ? { id: 'mail' } : { message: 'bad key re_test_fixture' }, { status: state.resend });
    }
    throw new Error(`unexpected ${request.url}`);
  };
  try {
    await run(state);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of saved) value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
  }
}
const post = (body: unknown, token = jwt()) =>
  handleRequest(
    new Request(`https://backend.example.test/functions/v1/api/v1/workspaces/${workspaceId}/invitations`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

Deno.test('invitation route authorizes in the database with the user JWT and sends one escaped email', () =>
  fixture(async state => {
    const response = await post({ input: { email: 'ana@example.test', role: 'member' } });
    assertEquals(response.status, 201);
    const body = await response.json();
    assertEquals(body.emailSent, true);
    assertEquals(body.data.id, invitationId);
    assertEquals(state.rpc, [{ p_workspace_id: workspaceId, p_email: 'ana@example.test', p_role: 'member' }]);
    assertEquals(state.mail.length, 1);
    const mail = state.mail[0];
    assertEquals(mail.headers.get('authorization'), 'Bearer re_test_fixture');
    assertEquals(mail.headers.get('idempotency-key'), `invitation-${invitationId}-1`);
    assertEquals(mail.body.to, ['ana@example.test']);
    assertEquals(mail.body.from, 'Kairos <send@deltaacademy.com.br>');
    assert(!String(mail.body.subject).includes('\n'));
    assert(String(mail.body.html).includes('Delta &lt;b&gt;'));
    assert(!String(mail.body.html).includes('<b>'));
    assert(String(mail.body.html).includes('https://tarefas.example.test/login?invite=1'));
    assert(String(mail.body.text).includes('https://tarefas.example.test/login?invite=1'));
  }),
);

Deno.test('provider failure keeps the invitation and reports emailSent false without leaking the key', () =>
  fixture(async state => {
    state.resend = 401;
    const response = await post({ input: { email: 'ana@example.test', role: 'member' } });
    assertEquals(response.status, 201);
    const text = await response.text();
    assertEquals(JSON.parse(text).emailSent, false);
    assert(!text.includes('re_test_fixture'));
    Deno.env.delete('RESEND_API_KEY');
    const unconfigured = await (await post({ input: { email: 'ana@example.test', role: 'member' } })).json();
    assertEquals(unconfigured.emailSent, false);
    assertEquals(state.mail.length, 1);
  }),
);

Deno.test('invalid input, database refusals and OAuth clients never reach the mail provider', () =>
  fixture(async state => {
    for (const input of [{ email: 'ana@example.test' }, { email: 'ana@example.test', role: 'member', extra: 1 }, { email: 5, role: 'member' }]) {
      assertEquals((await post({ input })).status, 422);
    }
    state.rpcError = { code: 'PT403', message: 'forbidden' };
    const refused = await post({ input: { email: 'ana@example.test', role: 'admin' } });
    assertEquals(refused.status, 403);
    assertEquals((await refused.json()).error.code, 'forbidden');
    state.rpcError = null;
    assertEquals((await post({ input: { email: 'ana@example.test', role: 'member' } }, jwt({ client_id: 'claude' }))).status, 403);
    assertEquals(state.mail.length, 0);
    assertEquals(state.rpc.length, 1);
  }),
);
