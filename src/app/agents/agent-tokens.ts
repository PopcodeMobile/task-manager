import type { WorkspaceRepository } from '../../workspace/repository';
import { RepositoryError } from '../../workspace/normalized';
export type AgentTokenConnection = {
  id: string;
  workspaceId: string;
  agentId: string;
  name: string;
  capability: 'read' | 'write';
  prefix: string;
  createdByUserId: string | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: 'active' | 'expired' | 'revoked';
};
export type IssuedAgentToken = { token: string; connection: AgentTokenConnection };
export type TokenExpiry = '30' | '90' | '365' | 'none';
export function tokenExpiryDays(value: TokenExpiry): number | null {
  if (!['30', '90', '365', 'none'].includes(value)) throw new RepositoryError('validation_error');
  return value === 'none' ? null : Number(value);
}
function checkedConnection(value: AgentTokenConnection, workspaceId: string | null): AgentTokenConnection {
  if (
    !value ||
    value.workspaceId !== workspaceId ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !['active', 'expired', 'revoked'].includes(value.status)
  )
    throw new RepositoryError('network');
  return value;
}
export async function listAgentTokens(repo: WorkspaceRepository, cursor: string | null) {
  const result = await repo.rpc<{ items: AgentTokenConnection[]; nextCursor: string | null }>('list_organization_agent_tokens', {
    p_workspace_id: repo.workspaceId,
    p_limit: 50,
    p_cursor: cursor,
  });
  if (!Array.isArray(result?.items) || (result.nextCursor !== null && typeof result.nextCursor !== 'string')) throw new RepositoryError('network');
  return { items: result.items.map(value => checkedConnection(value, repo.workspaceId)), nextCursor: result.nextCursor };
}
export async function issueAgentToken(repo: WorkspaceRepository, name: string, capability: 'read' | 'write', expiry: TokenExpiry, connectionId?: string) {
  const result = await repo.rpc<IssuedAgentToken>(connectionId ? 'rotate_organization_agent_token' : 'create_organization_agent_token', {
    p_workspace_id: repo.workspaceId,
    p_expires_in_days: tokenExpiryDays(expiry),
    ...(connectionId ? { p_connection_id: connectionId } : { p_name: name.trim(), p_capability: capability }),
  });
  checkedConnection(result?.connection, repo.workspaceId);
  if (!/^krs_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/.test(result?.token ?? '') || (connectionId && result.connection.id !== connectionId))
    throw new RepositoryError('network');
  return result;
}
export async function revokeAgentToken(repo: WorkspaceRepository, connectionId: string) {
  const result = await repo.rpc<{ connection: AgentTokenConnection }>('revoke_organization_agent_token', {
    p_workspace_id: repo.workspaceId,
    p_connection_id: connectionId,
  });
  const connection = checkedConnection(result?.connection, repo.workspaceId);
  if (connection.id !== connectionId || connection.status !== 'revoked') throw new RepositoryError('network');
  return connection;
}
