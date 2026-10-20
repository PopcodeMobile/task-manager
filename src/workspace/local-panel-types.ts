import type { Command, CommandResult, UserPreferences } from '../domain/contracts';
import type { createLocalRepository } from './local.js';
import type { DomainEvent } from './normalized';
import type { PersonalState, WorkspaceRepository } from './repository';

export type LocalRepositoryOptions = {
  persistence: ReturnType<typeof createLocalRepository>;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  workspaceId: string | null;
  identity?: string;
};
export type LocalPanelTransport = Omit<WorkspaceRepository, 'query' | 'list' | 'rpc' | 'command' | 'personal' | 'savePersonal'> & {
  query(operation: string, query?: Record<string, string | number>): Promise<unknown>;
  list(operation: string, query?: Record<string, string | number>): Promise<unknown[]>;
  rpc(name: string, args?: Record<string, unknown>): Promise<unknown>;
  command(operation: string, command: Omit<Command<Record<string, unknown>>, 'workspaceId'>): Promise<CommandResult<unknown>>;
  personal(): Promise<PersonalState>;
  savePersonal(patch: Partial<PersonalState>): Promise<void>;
};
/** Existing device envelopes only; operation-specific legacy row data stays opaque. */
export type LocalPersonalRecord = {
  prefs?: Record<string, unknown>;
  views?: Record<string, Record<string, unknown>>;
  collapsed?: boolean;
  activeWorkspace?: string;
  preferences?: Record<string, UserPreferences['preferences']>;
  [key: string]: unknown;
};
export type LocalPanelBookkeeping = {
  versions: Record<string, number>;
  events: DomainEvent[];
  requests: Record<string, { signature: string; result: CommandResult<unknown> }>;
  storageRevision: number;
};
export type LocalWorkspaceRecord = { id: string; name: string; url?: string; c: string };
