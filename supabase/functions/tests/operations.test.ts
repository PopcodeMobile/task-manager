import { assertEquals, assertRejects } from '@std/assert';
Deno.test('authentication never accepts unsigned decoded identity', async () => {
  const { authenticate } = await import('../_shared/auth.ts');
  const token =
    btoa(JSON.stringify({ alg: 'none' })) +
    '.' +
    btoa(JSON.stringify({ sub: crypto.randomUUID(), aud: 'authenticated', exp: 9999999999, iss: 'http://local/auth/v1' })) +
    '.';
  await assertRejects(() => authenticate(new Request('http://local', { headers: { Authorization: `Bearer ${token}` } })), Error, 'unauthorized');
});
Deno.test('commands cannot be executed using a constructed Actor', async () => {
  const { executeCommand } = await import('../_shared/operations.ts');
  await assertRejects(
    () =>
      executeCommand({ userId: crypto.randomUUID(), clientId: null, connectionId: null }, 'create_task', {
        workspaceId: crypto.randomUUID(),
        idempotencyKey: 'x',
        input: { projectId: 'p', title: 'No' },
      }),
    Error,
    'unauthorized',
  );
});
Deno.test('SQL/internal errors are mapped to stable safe errors', async () => {
  const { publicError } = await import('../_shared/errors.ts');
  const error = publicError({ code: '23503', message: 'secret SQL paths' });
  assertEquals(error.code, 'validation_error');
  assertEquals(error.message, 'Invalid request.');
  const unknown = publicError(new Error('/internal/secret'));
  assertEquals(unknown.code, 'temporarily_unavailable');
});

Deno.test('authentication rejects malformed Bearer credentials before contacting Auth', async () => {
  const { authenticate } = await import('../_shared/auth.ts');
  for (const authorization of ['', 'Basic unknown', 'Bearer garbage', 'Bearer a.b.c', 'Bearer eyJhbGciOiJub25lIn0.e30.signature']) {
    await assertRejects(() => authenticate(new Request('http://local', { headers: { authorization } })), Error, 'unauthorized');
  }
});
Deno.test('public error responses never leak underlying details', async () => {
  const { errorResponse, PublicError } = await import('../_shared/errors.ts');
  const response = errorResponse({ message: 'ERROR secret SQL /internal/path', detail: 'credential' }, 'request-1');
  assertEquals(response.status, 503);
  assertEquals(await response.json(), {
    error: { code: 'temporarily_unavailable', message: 'Service temporarily unavailable.', requestId: 'request-1' },
  });
  const limit = errorResponse(new PublicError('rate_limited'), 'request-2');
  assertEquals(limit.status, 429);
  assertEquals(limit.headers.get('Retry-After'), '60');
  await limit.body?.cancel();
});
