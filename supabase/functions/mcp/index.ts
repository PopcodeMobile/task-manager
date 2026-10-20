import { createMcpHandler } from '@modelcontextprotocol/server';
import { withOAuthProtectedResource, withSupabase } from '@supabase/server';
import { authenticate, backendConfig } from '../_shared/auth.ts';
import { errorResponse, PublicError } from '../_shared/errors.ts';
import { executeQuery } from '../_shared/operations.ts';
import { taskServer } from './tools.ts';

/** Public discovery wraps, but never bypasses, verified Supabase user authentication. */
export async function handleMcpRequest(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const edge = !!Deno.env.get('SUPABASE_FUNCTION_SLUG') || !!Deno.env.get('SB_EXECUTION_ID');
  const issuer = Deno.env.get('AUTH_ISSUER') ??
    (edge
      ? undefined
      : `${
        Deno.env.get('SUPABASE_PUBLIC_URL') ?? Deno.env.get('SUPABASE_URL') ?? new URL(request.url).origin
      }/auth/v1`);
  const resource = Deno.env.get('MCP_RESOURCE_URL') ??
    (edge ? undefined : `${new URL(request.url).origin}/functions/v1/mcp`);
  const discovery = withOAuthProtectedResource({
    resourceServer: resource,
    authorizationServer: issuer,
    errors: { detailed: false },
  }, async (req: Request) => {
    try {
      if (!req.headers.has('authorization')) throw new PublicError('unauthorized');
      const config = backendConfig();
      const authenticated = withSupabase({
        auth: 'user',
        issuer: config.issuer,
        audience: Deno.env.get('AUTH_AUDIENCE') ?? 'authenticated',
        cors: 'disabled',
        errors: { detailed: false },
        env: {
          url: config.url,
          publishableKeys: { default: config.apiKey },
          secretKeys: {},
          ...(Deno.env.get('SUPABASE_JWKS') ? {} : { jwks: new URL(`${config.issuer}/.well-known/jwks.json`) }),
        },
      }, async () => {
        const actor = await authenticate(req);
        if (!actor.clientId) throw new PublicError('forbidden');
        // Even tools/list and initialize require a live connection, not merely a signed token.
        const workspaces = await executeQuery(actor, 'list_workspaces', null) as { items: unknown[] };
        if (!workspaces.items.length) throw new PublicError('forbidden');
        const handler = createMcpHandler(() => taskServer(actor), { maxRequestBodySize: 270000 });
        try {
          return await handler.fetch(req);
        } finally {
          await handler.close();
        }
      });
      const response = await authenticated(req);
      if (response.status === 401 || response.status >= 500) {
        await response.body?.cancel();
        throw new PublicError(response.status === 401 ? 'unauthorized' : 'temporarily_unavailable');
      }
      return response;
    } catch (error) {
      return errorResponse(error, requestId);
    }
  });
  const response = await discovery(request);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Request-Id', requestId);
  return response;
}
if (import.meta.main) Deno.serve(handleMcpRequest);
