import { assert, assertEquals } from '@std/assert';
Deno.test('MCP discovery is public while tool transport requires delegated OAuth', async () => {
  const { handleMcpRequest } = await import('../mcp/index.ts');
  const response = await handleMcpRequest(
    new Request('http://localhost/functions/v1/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }),
  );
  assertEquals(response.status, 401);
  assert(response.headers.get('www-authenticate')?.includes('resource_metadata'));
  const metadata = await handleMcpRequest(new Request('http://localhost/functions/v1/mcp/oauth-protected-resource'));
  assertEquals(metadata.status, 200);
  const data = await metadata.json();
  assertEquals(data.bearer_methods_supported, ['header']);
  assert(data.authorization_servers[0].endsWith('/auth/v1'));
});

Deno.test('Edge discovery advertises the public forwarded origin, never Docker-internal URLs', async () => {
  const { handleMcpRequest } = await import('../mcp/index.ts');
  const old = Deno.env.get('SUPABASE_URL');
  Deno.env.set('SUPABASE_URL', 'http://kong:8000');
  Deno.env.set('SUPABASE_FUNCTION_SLUG', 'mcp');
  try {
    const response = await handleMcpRequest(
      new Request('http://127.0.0.1:8081/functions/v1/mcp/oauth-protected-resource', {
        headers: { 'x-forwarded-host': '127.0.0.1:61921', 'x-forwarded-proto': 'http' },
      }),
    );
    const data = await response.json();
    assertEquals(data.resource, 'http://127.0.0.1:61921/functions/v1/mcp');
    assertEquals(data.authorization_servers, ['http://127.0.0.1:61921/auth/v1']);
  } finally {
    Deno.env.delete('SUPABASE_FUNCTION_SLUG');
    if (old) Deno.env.set('SUPABASE_URL', old);
    else Deno.env.delete('SUPABASE_URL');
  }
});
