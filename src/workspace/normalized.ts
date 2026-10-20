import type { SupabaseClient } from '@supabase/supabase-js';
import type { Command, CommandResult, Page, Workspace, UserPreferences } from '../domain/contracts';
export type Agent = { id: string; name: string; authUserId: string | null; clientId: string | null };
export type Member = { user_id: string; name: string; email: string; role: string };
export type DomainEvent = {
  id: string;
  operation: string;
  entityId: string | null;
  actorUserId: string;
  actorAgentId: string | null;
  createdAt: string;
  payload: { taskId?: string; projectId?: string };
};
export class RepositoryError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
const codes = new Set([
  'version_conflict',
  'already_claimed',
  'claim_expired',
  'forbidden',
  'unauthorized',
  'not_found',
  'rate_limited',
  'validation_error',
  'idempotency_conflict',
]);
/** One instance per authenticated session and workspace. No shared identity cache or private executor credentials. */
export class NormalizedRepository {
  controller = new AbortController();
  activate() {
    if (this.controller.signal.aborted) this.controller = new AbortController();
  }
  private cache = new Map<string, unknown>();
  private client: SupabaseClient;
  readonly userId: string;
  readonly workspaceId: string | null;
  constructor(client: SupabaseClient, userId: string, workspaceId: string | null) {
    this.client = client;
    this.userId = userId;
    this.workspaceId = workspaceId;
  }
  dispose() {
    this.controller.abort();
    this.cache.clear();
  }
  async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const controller = this.controller;
    if (controller.signal.aborted) throw new DOMException('Disposed', 'AbortError');
    const { data, error } = await this.client.rpc(name, args).abortSignal(controller.signal);
    if (controller.signal.aborted) throw new DOMException('Disposed', 'AbortError');
    if (error) throw new RepositoryError(codes.has(error.message) ? error.message : error.code === '42501' ? 'forbidden' : 'network');
    return data as T;
  }
  async query<T>(operation: string, query: Record<string, string | number> = {}, fresh = false): Promise<T> {
    const key = JSON.stringify([this.userId, this.workspaceId, operation, query]);
    if (!fresh && this.cache.has(key)) return this.cache.get(key) as T;
    const data = await this.rpc<T>('read_operation', { p_workspace_id: this.workspaceId, p_operation: operation, p_query: query });
    this.cache.set(key, data);
    if (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value!);
    return data;
  }
  /** Follow every cursor. Migrated lists must never silently stop at 100 rows. */
  async list<T>(operation: string, query: Record<string, string | number> = {}, fresh = false): Promise<T[]> {
    const items: T[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const page: Page<T> = await this.query<Page<T>>(operation, { ...query, limit: 100, ...(cursor ? { cursor } : {}) }, fresh);
      items.push(...page.items);
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw new RepositoryError('pagination');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return items;
  }
  async command<T>(operation: string, command: Omit<Command<Record<string, unknown>>, 'workspaceId'>): Promise<CommandResult<T>> {
    if (!this.workspaceId) throw new RepositoryError('validation_error');
    // This repository is human-only. claim_task/renew/release never enter general UI state.
    if (['claim_task', 'renew_task_claim', 'release_task_claim'].includes(operation)) throw new RepositoryError('forbidden');
    const result = await this.rpc<CommandResult<T>>('execute_operation', {
      p_workspace_id: this.workspaceId,
      p_operation: operation,
      p_command: command.input,
      p_idempotency_key: command.idempotencyKey,
      p_expected_version: command.expectedVersion ?? null,
    });
    this.cache.clear();
    return result;
  }
  async workspaces(fresh = false): Promise<Workspace[]> {
    return (await this.list<Workspace>('list_workspaces', {}, fresh)).filter(w => w.storageVersion === 2);
  }
  async preferences(): Promise<UserPreferences['preferences']> {
    const result = await this.query<{ data: UserPreferences | null }>('get_preferences');
    // Unknown legacy authorship is archived shared state, never a source of current personal settings.
    const preferences = result.data?.userId === this.userId ? result.data.preferences : null;
    return {
      favoriteProjectIds: preferences?.favoriteProjectIds ?? [],
      favoriteTaskIds: preferences?.favoriteTaskIds ?? [],
      notificationReadStates: preferences?.notificationReadStates ?? {},
    };
  }
}
export function eventCursor(event: DomainEvent): string {
  return `[${JSON.stringify(event.createdAt)}, ${JSON.stringify(event.id)}]`;
}
