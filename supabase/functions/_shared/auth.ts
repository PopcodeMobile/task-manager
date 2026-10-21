import type { Actor } from '../../../src/domain/contracts.ts';
import { PublicError } from './errors.ts';
import { resolveOrganizationToken } from './organization-tokens.ts';
type Credential = { token: string; url: string; apiKey: string };
const credentials = new WeakMap<Actor, Credential>();
export function actorCredential(actor: Actor): Credential {
  const credential = credentials.get(actor);
  if (!credential) throw new PublicError('unauthorized');
  return credential;
}
export function backendConfig(): { url: string; apiKey: string; issuer: string } {
  const url = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
  const apiKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !apiKey) throw new PublicError('temporarily_unavailable');
  return {
    url,
    apiKey,
    issuer: Deno.env.get('AUTH_ISSUER') ?? `${Deno.env.get('SUPABASE_PUBLIC_URL')?.replace(/\/$/, '') ?? url}/auth/v1`,
  };
}
function decode(part: string): Record<string, unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
  } catch {
    throw new PublicError('unauthorized');
  }
}
/** Supabase Auth verifies the signature and active user; decoded fields are trusted only after that check. */
export async function authenticate(request: Request): Promise<Actor> {
  const header = request.headers.get('authorization');
  if (!header?.match(/^Bearer [A-Za-z0-9._-]+$/i)) throw new PublicError('unauthorized');
  const token = header.slice(7);
  if (token.startsWith('krs_')) {
    const config = backendConfig();
    const actor = await resolveOrganizationToken(config, token);
    credentials.set(actor, { token, url: config.url, apiKey: config.apiKey });
    return actor;
  }
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[2] || !['HS256', 'RS256', 'ES256'].includes(String(decode(parts[0]).alg))) {
    throw new PublicError('unauthorized');
  }
  const config = backendConfig();
  let response: Response;
  try {
    response = await fetch(`${config.url}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: config.apiKey },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new PublicError('temporarily_unavailable');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new PublicError(response.status >= 500 ? 'temporarily_unavailable' : 'unauthorized');
  }
  const user = await response.json();
  const claims = decode(parts[1]);
  const now = Date.now() / 1000;
  const audience = Deno.env.get('AUTH_AUDIENCE') ?? 'authenticated';
  if (
    typeof claims.sub !== 'string' ||
    claims.sub !== user.id ||
    claims.iss !== config.issuer ||
    !(claims.aud === audience || (Array.isArray(claims.aud) && claims.aud.includes(audience))) ||
    typeof claims.exp !== 'number' ||
    claims.exp <= now ||
    (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now)) ||
    (claims.client_id !== undefined && (typeof claims.client_id !== 'string' || !claims.client_id))
  )
    throw new PublicError('unauthorized');
  const actor: Actor = Object.freeze({
    userId: claims.sub,
    clientId: typeof claims.client_id === 'string' ? claims.client_id : null,
    connectionId: null,
  });
  credentials.set(actor, { token, url: config.url, apiKey: config.apiKey });
  return actor;
}
