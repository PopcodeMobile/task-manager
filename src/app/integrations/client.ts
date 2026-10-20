import { createClient, type SupabaseClient, type OAuthAuthorizationDetails, type OAuthRedirect } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { flowType: 'pkce', detectSessionInUrl: false } }) : null;
export type WorkspaceChoice = { id: string; name: string; role: string; storageVersion: number };
export type GrantChoice = { workspaceId: string; capability: 'read' | 'write' };
export type Connection = {
  id: string;
  clientId: string;
  clientName: string;
  status: 'pending' | 'active' | 'revoked';
  grants: { workspaceId: string; workspaceName: string; capability: 'read' | 'write' }[];
};
function configured() {
  if (!supabase) throw new Error('cloud_unconfigured');
  return supabase;
}
export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await configured().rpc(name, args);
  if (error) throw new Error('request_failed');
  return data as T;
}
export async function workspaces(): Promise<WorkspaceChoice[]> {
  const data = await rpc<{ items: WorkspaceChoice[] }>('read_operation', { p_workspace_id: null, p_operation: 'list_workspaces', p_query: { limit: 100 } });
  return data.items.filter(w => w.storageVersion === 2);
}
export async function authorizationDetails(authorizationId: string): Promise<OAuthAuthorizationDetails | OAuthRedirect> {
  const { data, error } = await configured().auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) throw new Error('authorization_invalid');
  return data;
}
/** Grants stay inactive until Auth approves. Only this prepared pending attempt is cancelled on failure.
 * Committed access requires explicit revoke; another tab's preparation is never cancelled. */
export async function decideConsent(authorizationId: string, grants: GrantChoice[], approve: boolean): Promise<string> {
  const client = configured();
  let activated = false;
  let attemptId: string | null = null;
  try {
    if (approve) {
      const prepared = await rpc<{ attemptId: unknown }>('prepare_integration_consent', { p_authorization_id: authorizationId, p_grants: grants });
      if (typeof prepared.attemptId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(prepared.attemptId))
        throw new Error('consent_failed');
      attemptId = prepared.attemptId;
    }
    const { data, error } = approve
      ? await client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await client.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (error || !data) throw new Error('consent_failed');
    safeOAuthRedirect(data.redirect_url);
    if (approve) {
      await rpc('activate_integration_consent', { p_authorization_id: authorizationId, p_attempt_id: attemptId });
      activated = true;
    }
    return data.redirect_url;
  } catch {
    if (!activated && attemptId) await rpc('cancel_integration_consent', { p_authorization_id: authorizationId, p_attempt_id: attemptId }).catch(() => {});
    throw new Error('consent_failed');
  }
}
/** Redirects come exclusively from Auth. Permit HTTPS and loopback HTTP OAuth callbacks. */
export function safeOAuthRedirect(value: string): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.hash ||
    !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    throw new Error('unsafe_redirect');
  return url.href;
}
