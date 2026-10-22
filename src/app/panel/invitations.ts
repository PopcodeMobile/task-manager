import type { WorkspaceRepository } from '../../workspace/repository';
import { RepositoryError } from '../../workspace/normalized';
import { supabase } from '../integrations/client';
export type InvitationRole = 'admin' | 'member' | 'guest';
export type Invitation = {
  id: string;
  workspaceId: string;
  email: string;
  role: InvitationRole;
  expiresAt: string;
  status: 'pending' | 'expired';
};
export type ReceivedInvitation = { id: string; workspaceId: string; workspaceName: string; role: InvitationRole; inviterName: string; expiresAt: string };
const roles = ['admin', 'member', 'guest'];
const codes = new Set(['forbidden', 'unauthorized', 'not_found', 'rate_limited', 'validation_error']);
function checked<T extends { id: string; role: string }>(value: T, extra: (v: T) => boolean): T {
  if (!value || typeof value.id !== 'string' || !roles.includes(value.role) || !extra(value)) throw new RepositoryError('network');
  return value;
}
const pending = (repo: WorkspaceRepository) => (v: Invitation) =>
  v.workspaceId === repo.workspaceId && typeof v.email === 'string' && ['pending', 'expired'].includes(v.status);
export async function listInvitations(repo: WorkspaceRepository): Promise<Invitation[]> {
  const result = await repo.rpc<{ items: Invitation[] }>('list_workspace_invitations', { p_workspace_id: repo.workspaceId });
  if (!Array.isArray(result?.items)) throw new RepositoryError('network');
  return result.items.map(v => checked(v, pending(repo)));
}
export async function revokeInvitation(repo: WorkspaceRepository, id: string): Promise<void> {
  const result = await repo.rpc<{ id: string; status: string }>('revoke_workspace_invitation', { p_workspace_id: repo.workspaceId, p_id: id });
  if (result?.id !== id || result.status !== 'revoked') throw new RepositoryError('network');
}
/** Creation goes through the api function, which sends the email after the database authorizes the user. */
export async function sendInvitation(repo: WorkspaceRepository, email: string, role: InvitationRole): Promise<{ invitation: Invitation; emailSent: boolean }> {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (!base || !token || !repo.workspaceId) throw new RepositoryError('unauthorized');
  let response: Response;
  try {
    response = await fetch(`${base}/functions/v1/api/v1/workspaces/${repo.workspaceId}/invitations`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ input: { email: email.trim(), role } }),
      signal: repo.controller.signal,
    });
  } catch (error) {
    if (repo.controller.signal.aborted) throw error;
    throw new RepositoryError('network');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new RepositoryError(codes.has(body?.error?.code) ? body.error.code : 'network');
  if (typeof body?.emailSent !== 'boolean') throw new RepositoryError('network');
  return { invitation: checked(body.data, pending(repo)), emailSent: body.emailSent };
}
export async function listReceivedInvitations(repo: WorkspaceRepository): Promise<ReceivedInvitation[]> {
  if (repo.mode !== 'cloud') return [];
  const result = await repo.rpc<{ items: ReceivedInvitation[] }>('list_my_workspace_invitations');
  if (!Array.isArray(result?.items)) throw new RepositoryError('network');
  return result.items.map(v => checked(v, x => typeof x.workspaceId === 'string' && typeof x.workspaceName === 'string'));
}
export async function acceptInvitation(repo: WorkspaceRepository, id: string): Promise<string> {
  const result = await repo.rpc<{ workspaceId: string }>('accept_workspace_invitation', { p_id: id });
  if (typeof result?.workspaceId !== 'string') throw new RepositoryError('network');
  return result.workspaceId;
}
export const inviteLink = () => `${location.origin}/login?invite=1`;
