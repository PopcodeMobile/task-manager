/** Public names are camelCase; persistence maps them to snake_case. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type LegacyMetadata = { [key: string]: Json };
export type EntityRef = { workspaceId: string; id: string };
export type Command<T> = { workspaceId: string; idempotencyKey: string; expectedVersion?: number; input: T };
/** Produced by validated authentication, never deserialized from command input. */
export type HumanActor = { kind?: 'user'; userId: string; clientId: string | null; connectionId: string | null };
export type OrganizationTokenActor = {
  kind: 'organization_token';
  principalId: string;
  connectionId: string;
  agentId: string;
  workspaceId: string;
  capability: 'read' | 'write';
  userId: null;
  clientId: null;
};
export type Actor = HumanActor | OrganizationTokenActor;
export type CommandResult<T> = { data: T; eventId: string; requestId: string };
export type Page<T> = { items: T[]; nextCursor: string | null };
export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';
export type TaskStatus = 'backlog' | 'todo' | 'progress' | 'review' | 'done';
export type TaskPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';
export type Recurrence = 'Daily' | 'Weekly' | 'Every 2 weeks' | 'Monthly';
export type VersionedEntity = EntityRef & { version: number; legacyMetadata: LegacyMetadata };
export type TaskReservation = { agentId: string; claimedAt: string; expiresAt: string; active: boolean };
export type Workspace = {
  id: string;
  name: string;
  slug: string;
  color: string;
  logoPath?: string | null;
  version: number;
  storageVersion: number;
  role: WorkspaceRole;
};
export type SubtaskAttributes = { assignee?: string | null; due?: string | null; note?: string | null };
export type BatchCommand = { operation: string; input: Record<string, Json>; expectedVersion?: number };
export type BatchInput = { commands: BatchCommand[] };
export type BatchResult = { results: { data: Json; eventId: string }[] };
export type Task = VersionedEntity & {
  /** Unexpired reservation locks ordinary writes even if the agent loses execution authority. */
  reservation?: TaskReservation | null;
  /** Effective current authority; false after revocation even while the reservation remains locked. */
  execution?: { state: 'running' | 'blocked'; reason: string | null; active: boolean } | null;
  projectId: string;
  key: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeUserId: string | null;
  executorAgentId: string | null;
  recurrence: Recurrence | null;
  dueDate: string | null;
  startDate: string | null;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
};
export type Project = VersionedEntity & {
  key: string | null;
  name: string;
  description: string;
  status: 'planning' | 'active' | 'risk' | 'hold' | 'complete';
  teamId: string | null;
  leadUserId: string | null;
  dueDate: string | null;
  startDate: string | null;
  sortOrder: number;
  archived: boolean;
};
export type Subtask = VersionedEntity & { taskId: string; title: string; done: boolean; sortOrder: number; legacyMetadata: LegacyMetadata };
export type TaskDependency = { workspaceId: string; taskId: string; dependsOnTaskId: string };
export type TaskLabel = { workspaceId: string; taskId: string; labelId: string };
export type TaskAttachment = { workspaceId: string; taskId: string; fileId: string; sortOrder?: number };
export type Label = VersionedEntity & { name: string; legacyMetadata: LegacyMetadata };
export type Comment = VersionedEntity & {
  taskId: string;
  authorUserId: string | null;
  authorAgentId?: string | null;
  body: string;
  createdAt: string;
  legacyMetadata: LegacyMetadata;
};
export type CommentReaction = { workspaceId: string; commentId: string; reaction: string; legacyUserId: string; userId: string | null };
export type TeamMembershipBaseline = { userId: string; teamIds: string[] };
export type Team = VersionedEntity & { name: string; description: string };
export type Notification = EntityRef & {
  projectId: string | null;
  taskId: string | null;
  authorUserId: string | null;
  notificationType: string;
  legacyMetadata: LegacyMetadata;
};
export type FileMetadata = VersionedEntity & {
  projectId: string | null;
  taskId: string | null;
  name: string;
  fileType: string;
  sizeLabel: string | null;
  createdAt: string;
  authorUserId: string | null;
  legacyMetadata: LegacyMetadata;
};
export type CalendarEvent = EntityRef & {
  projectId: string | null;
  title: string;
  eventDate: string | null;
  eventTime: string | null;
  legacyMetadata: LegacyMetadata;
};
export type SavedView = VersionedEntity & { projectId: string | null; name: string; viewType: string; filters: Json[]; legacyMetadata: LegacyMetadata };
export type ActivityEntry = EntityRef & {
  projectId: string | null;
  taskId: string | null;
  actorUserId: string | null;
  verb: string;
  createdAt: string;
  legacyMetadata: LegacyMetadata;
};
export type UserPreferences = {
  workspaceId: string;
  userId: string;
  preferences: { favoriteProjectIds: string[]; favoriteTaskIds: string[]; notificationReadStates: Record<string, boolean> };
};
export type LegacyInspection = {
  valid: boolean;
  counts: Record<string, number>;
  duplicateIds: string[];
  orphans: string[];
  unmappedFields: string[];
  unresolvedUsers: string[];
  errors: string[];
};
