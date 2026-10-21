import type { Command, CommandResult, Workspace, UserPreferences } from '../domain/contracts';
export type PersonalState = {
  prefs: Record<string, unknown>;
  views: Record<string, unknown>;
  collapsed?: boolean;
  activeWorkspace?: string;
  preferences?: Partial<UserPreferences['preferences']>;
};
/** Structural boundary shared by cloud and device adapters. No Auth/session fabrication. */
export interface WorkspaceRepository {
  readonly mode: 'cloud' | 'local';
  readonly userId: string;
  readonly workspaceId: string | null;
  readonly controller: AbortController;
  activate(): void;
  dispose(): void;
  query<T>(operation: string, query?: Record<string, string | number>, fresh?: boolean): Promise<T>;
  list<T>(operation: string, query?: Record<string, string | number>, fresh?: boolean): Promise<T[]>;
  command<T>(operation: string, command: Omit<Command<Record<string, unknown>>, 'workspaceId'>): Promise<CommandResult<T>>;
  rpc<T>(name: string, args?: Record<string, unknown>): Promise<T>;
  workspaces(fresh?: boolean): Promise<Workspace[]>;
  preferences(fresh?: boolean): Promise<UserPreferences['preferences']>;
  personal?(): Promise<PersonalState>;
  savePersonal?(patch: Partial<PersonalState>): Promise<void>;
}
export type RepositoryFactory = (workspaceId: string | null) => WorkspaceRepository;
