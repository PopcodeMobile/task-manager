import type { OrganizationTokenActor } from '../../../src/domain/contracts.ts';
import { PublicError, publicError } from './errors.ts';

export const organizationTokenFormat = /^krs_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reads = new Set(['list_workspaces', 'list_projects', 'list_tasks', 'get_task', 'list_task_activity']);
const writes = new Set([
  'create_task',
  'claim_task',
  'renew_task_claim',
  'release_task_claim',
  'update_task',
  'add_task_comment',
  'complete_task',
  'create_project',
  'update_project',
  'archive_project',
]);
type Backend = { url: string; apiKey: string };

/** Opaque secrets are RPC arguments, never PostgREST JWTs or public actor fields. */
export async function organizationTokenRpc(config: Backend, name: string, parameters: Record<string, unknown>): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: config.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(parameters),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new PublicError('temporarily_unavailable');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PublicError(publicError(body ?? { code: response.status === 401 ? 'PT401' : undefined }).code);
  }
  return body;
}

export async function resolveOrganizationToken(config: Backend, token: string): Promise<OrganizationTokenActor> {
  if (!organizationTokenFormat.test(token)) throw new PublicError('unauthorized');
  const value = await organizationTokenRpc(config, 'authenticate_organization_agent_token', { p_token: token });
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PublicError('temporarily_unavailable');
  const actor = value as Record<string, unknown>;
  if (
    actor.kind !== 'organization_token' ||
    actor.userId !== null ||
    actor.clientId !== null ||
    !['read', 'write'].includes(String(actor.capability)) ||
    !['principalId', 'connectionId', 'agentId', 'workspaceId'].every(key => typeof actor[key] === 'string' && uuid.test(actor[key]))
  )
    throw new PublicError('temporarily_unavailable');
  // Explicit projection prevents unexpected resolver fields (including credentials) escaping into the actor.
  return Object.freeze({
    kind: 'organization_token',
    principalId: actor.principalId as string,
    connectionId: actor.connectionId as string,
    agentId: actor.agentId as string,
    workspaceId: actor.workspaceId as string,
    capability: actor.capability as 'read' | 'write',
    userId: null,
    clientId: null,
  });
}

/** Defense in depth; the database revalidates the secret and the same scope in each transaction. */
export function authorizeOrganizationOperation(actor: OrganizationTokenActor, operation: string, workspaceId: string | null, write: boolean): void {
  if (!(write ? writes : reads).has(operation) || (write && actor.capability !== 'write')) throw new PublicError('forbidden');
  if (workspaceId !== actor.workspaceId && !(operation === 'list_workspaces' && workspaceId === null)) throw new PublicError('forbidden');
}
