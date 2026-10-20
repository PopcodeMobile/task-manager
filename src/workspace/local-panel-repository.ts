import { createLocalPanelAdapter } from './local-panel.js';
import type { createLocalRepository } from './local.js';
import type { Command, CommandResult, Workspace } from '../domain/contracts';
import type { PersonalState, WorkspaceRepository } from './repository';

type LocalRepositoryOptions = {
  persistence: ReturnType<typeof createLocalRepository>;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  workspaceId: string | null;
  identity?: string;
};

/** Checked shell boundary over the existing device transaction adapter.
 * Generic payload assertions mirror the cloud repository's operation contract;
 * they do not cast away the repository's methods, lifecycle or result envelope.
 */
export function createLocalWorkspaceRepository(options: LocalRepositoryOptions): WorkspaceRepository {
  const adapter = createLocalPanelAdapter(options);
  return {
    mode: adapter.mode,
    userId: adapter.userId,
    workspaceId: options.workspaceId,
    get controller() {
      return adapter.controller;
    },
    activate: () => adapter.activate(),
    dispose: () => adapter.dispose(),
    personal: (): Promise<PersonalState> => adapter.personal(),
    savePersonal: (patch: Partial<PersonalState>) => adapter.savePersonal(patch),
    preferences: () => adapter.preferences(),
    workspaces: (): Promise<Workspace[]> => adapter.workspaces(),
    async query<T>(operation: string, query: Record<string, string | number> = {}): Promise<T> {
      const data: unknown = await adapter.query(operation, query);
      return data as T;
    },
    async list<T>(operation: string, query: Record<string, string | number> = {}): Promise<T[]> {
      const data: unknown[] = await adapter.list(operation, query);
      return data as T[];
    },
    async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
      const data: unknown = await adapter.rpc(name, args);
      return data as T;
    },
    async command<T>(operation: string, command: Omit<Command<Record<string, unknown>>, 'workspaceId'>): Promise<CommandResult<T>> {
      const result: CommandResult<unknown> = await adapter.command(operation, command);
      return { ...result, data: result.data as T };
    },
  };
}
