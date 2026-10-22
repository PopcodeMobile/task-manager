import type { Actor, Command, CommandResult } from '../../../src/domain/contracts.ts';
import { actorCredential } from './auth.ts';
import { PublicError, publicError } from './errors.ts';
import { uuid, validateCommand, validateQuery } from './validation.ts';
import { authorizeOrganizationOperation, organizationTokenRpc } from './organization-tokens.ts';
export async function rpc(actor: Actor, name: string, parameters: Record<string, unknown>): Promise<unknown> {
  const credential = actorCredential(actor);
  if (actor.kind === 'organization_token') {
    return await organizationTokenRpc(credential, name, { ...parameters, p_token: credential.token });
  }
  let response: Response;
  try {
    response = await fetch(`${credential.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credential.token}`,
        apikey: credential.apiKey,
        'content-type': 'application/json',
      },
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
/** User JWT remains the database credential: service-role is never used for domain operations. */
export async function executeCommand(actor: Actor, operation: string, command: Command<unknown>): Promise<CommandResult<unknown>> {
  actorCredential(actor);
  if (actor.kind === 'organization_token') authorizeOrganizationOperation(actor, operation, command?.workspaceId, true);
  const valid = validateCommand(operation, command);
  const params =
    operation === 'create_workspace'
      ? { p_name: valid.input.name, p_slug: valid.input.slug, p_idempotency_key: valid.idempotencyKey }
      : {
          p_workspace_id: valid.workspaceId,
          p_operation: operation,
          p_command: valid.input,
          p_idempotency_key: valid.idempotencyKey,
          p_expected_version: valid.expectedVersion ?? null,
        };
  const name =
    actor.kind === 'organization_token'
      ? 'execute_organization_agent_operation'
      : operation === 'create_workspace'
        ? 'create_workspace_v2'
        : 'execute_operation';
  const result = await rpc(actor, name, params);
  if (!result || typeof result !== 'object' || !('data' in result) || !('eventId' in result) || typeof result.eventId !== 'string')
    throw new PublicError('temporarily_unavailable');
  return { ...result, data: result.data, eventId: result.eventId, requestId: crypto.randomUUID() };
}
export async function executeQuery(actor: Actor, operation: string, workspaceId: string | null, query: Record<string, unknown> = {}): Promise<unknown> {
  actorCredential(actor);
  if (actor.kind === 'organization_token') authorizeOrganizationOperation(actor, operation, workspaceId, false);
  if (operation !== 'list_workspaces' && !uuid(workspaceId)) throw new PublicError('validation_error');
  const valid = validateQuery(operation, query);
  const result = await rpc(actor, actor.kind === 'organization_token' ? 'read_organization_agent_operation' : 'read_operation', {
    p_workspace_id: workspaceId,
    p_operation: operation,
    p_query: valid,
  });
  if (!result || typeof result !== 'object' || (!('data' in result) && !('items' in result))) {
    throw new PublicError('temporarily_unavailable');
  }
  return result;
}
