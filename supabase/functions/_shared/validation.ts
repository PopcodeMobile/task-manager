import type { Command } from '../../../src/domain/contracts.ts';
import { PublicError } from './errors.ts';
type Rule = { fields: string[]; required: string[]; version?: boolean };
const rule = (fields: string, required = '', version = false): Rule => ({
  fields: fields.split(' ').filter(Boolean),
  required: required.split(' ').filter(Boolean),
  version,
});
export const commandRules: Record<string, Rule> = {
  create_task: rule('id projectId title description status priority assigneeUserId recurrence dueDate startDate sortOrder attributes', 'projectId title'),
  update_task: rule('id title description status priority assigneeUserId recurrence dueDate startDate sortOrder claimToken attributes', 'id', true),
  move_task: rule('id projectId sortOrder claimToken', 'id projectId', true),
  duplicate_task: rule('id projectId title claimToken', 'id', true),
  delete_task: rule('id claimToken', 'id', true),
  archive_task: rule('id claimToken', 'id', true),
  restore_task: rule('id claimToken', 'id', true),
  claim_task: rule('id', 'id', true),
  renew_task_claim: rule('id claimToken', 'id claimToken', true),
  release_task_claim: rule('id claimToken', 'id claimToken', true),
  complete_task: rule('id claimToken', 'id', true),
  intervene_task: rule('id action executorAgentId', 'id action', true),
  add_task_comment: rule('id taskId body', 'taskId body'),
  create_project: rule('id key name description status teamId leadUserId dueDate startDate sortOrder attributes', 'name'),
  update_project: rule('id key name description status teamId leadUserId dueDate startDate sortOrder archived attributes', 'id', true),
  delete_project: rule('id', 'id', true),
  archive_project: rule('id', 'id', true),
  restore_project: rule('id', 'id', true),
  create_subtask: rule('id taskId title done sortOrder claimToken', 'taskId title', true),
  update_subtask: rule('id taskId title done sortOrder claimToken', 'id taskId', true),
  delete_subtask: rule('id taskId claimToken', 'id taskId', true),
  set_task_dependency: rule('id dependsOnTaskId claimToken', 'id dependsOnTaskId', true),
  remove_task_dependency: rule('id dependsOnTaskId claimToken', 'id dependsOnTaskId', true),
  set_task_label: rule('id labelId claimToken', 'id labelId', true),
  remove_task_label: rule('id labelId claimToken', 'id labelId', true),
  set_task_attachment: rule('id fileId sortOrder claimToken', 'id fileId', true),
  remove_task_attachment: rule('id fileId claimToken', 'id fileId', true),
  add_reaction: rule('commentId reaction', 'commentId reaction'),
  remove_reaction: rule('commentId reaction', 'commentId reaction'),
  create_team: rule('id name description attributes', 'name'),
  update_team: rule('id name description attributes', 'id', true),
  delete_team: rule('id', 'id', true),
  set_team_member: rule('id userId', 'id userId', true),
  remove_team_member: rule('id userId', 'id userId', true),
  set_project_member: rule('id userId', 'id userId', true),
  remove_project_member: rule('id userId', 'id userId', true),
  create_label: rule('id name', 'name'),
  update_label: rule('id name', 'id', true),
  delete_label: rule('id', 'id', true),
  create_view: rule('id projectId name viewType filters', 'name viewType'),
  update_view: rule('id projectId name viewType filters', 'id', true),
  delete_view: rule('id', 'id', true),
  create_calendar_event: rule('id projectId taskId title eventDate eventTime', 'title'),
  update_calendar_event: rule('id projectId taskId title eventDate eventTime', 'id', true),
  delete_calendar_event: rule('id', 'id', true),
  create_file: rule('id projectId taskId name fileType sizeLabel', 'name'),
  update_file: rule('id projectId taskId name fileType sizeLabel', 'id', true),
  delete_file: rule('id', 'id', true),
  set_preferences: rule('preferences', 'preferences'),
  create_workspace: rule('name slug', 'name slug'),
};
const queryNames = new Set([
  'list_workspaces',
  'get_workspace',
  'get_preferences',
  'get_task',
  'list_projects',
  'list_tasks',
  'list_task_activity',
  'list_subtasks',
  'list_comments',
  'list_teams',
  'list_labels',
  'list_files',
  'list_calendar_events',
  'list_views',
  'list_agents',
  'list_notifications',
  'list_activity',
  'list_domain_events',
  'list_dependencies',
  'list_task_labels',
  'list_reactions',
  'list_team_members',
  'list_project_members',
  'list_members',
  'list_attachments',
]);
export const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function invalid(): never {
  throw new PublicError('validation_error');
}
const nullable = new Set([
  'assigneeUserId',
  'recurrence',
  'dueDate',
  'startDate',
  'teamId',
  'leadUserId',
  'projectId',
  'taskId',
  'eventDate',
  'eventTime',
  'sizeLabel',
  'executorAgentId',
]);
function safeJson(value: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (Array.isArray(value)) return value.every(item => safeJson(item, depth + 1));
  if (object(value)) {
    return Object.entries(value).every(([key, item]) => !['__proto__', 'prototype', 'constructor'].includes(key) && safeJson(item, depth + 1));
  }
  return value === null || ['string', 'boolean', 'number'].includes(typeof value);
}
export function validateCommand(operation: string, value: unknown): Command<Record<string, unknown>> {
  const schema = Object.hasOwn(commandRules, operation) ? commandRules[operation] : null;
  if (!schema || !object(value) || Object.keys(value).some(key => !['workspaceId', 'idempotencyKey', 'expectedVersion', 'input'].includes(key))) invalid();
  if (
    !uuid(value.workspaceId) ||
    typeof value.idempotencyKey !== 'string' ||
    value.idempotencyKey.length < 1 ||
    value.idempotencyKey.length > 200 ||
    !object(value.input)
  )
    invalid();
  if (value.expectedVersion !== undefined && (!Number.isSafeInteger(value.expectedVersion) || (value.expectedVersion as number) < 1)) invalid();
  if (schema.version && value.expectedVersion === undefined) invalid();
  const input = value.input;
  if (
    JSON.stringify(input).length > 262144 ||
    Object.keys(input).some(key => !schema.fields.includes(key)) ||
    schema.required.some(key => input[key] === undefined || input[key] === null)
  )
    invalid();
  for (const [key, item] of Object.entries(input)) {
    if (item === null) {
      if (!nullable.has(key)) invalid();
      continue;
    }
    if (key === 'preferences' || key === 'filters' || key === 'attributes') {
      if (!safeJson(item) || (key !== 'filters' ? !object(item) : !Array.isArray(item))) invalid();
    } else if (['done', 'archived'].includes(key)) {
      if (typeof item !== 'boolean') invalid();
    } else if (key === 'sortOrder') {
      if (typeof item !== 'number' || !Number.isFinite(item)) invalid();
    } else if (
      typeof item !== 'string' ||
      !item.trim() ||
      item.length > (key === 'description' ? 100000 : key === 'body' ? 20000 : ['title', 'name'].includes(key) ? 500 : 128)
    )
      invalid();
    if (['userId', 'assigneeUserId', 'leadUserId', 'claimToken'].includes(key) && !uuid(item)) invalid();
  }
  if (input.attributes !== undefined) {
    const attrs = input.attributes as Record<string, unknown>;
    const fields = operation.endsWith('task')
      ? ['estimate']
      : operation.endsWith('project')
        ? ['icon', 'color', 'milestones']
        : operation.endsWith('team')
          ? ['icon', 'color']
          : [];
    for (const [key, item] of Object.entries(attrs)) {
      if (!fields.includes(key)) invalid();
      if (key === 'milestones') {
        if (
          !Array.isArray(item) ||
          item.length > 100 ||
          item.some(
            m =>
              !object(m) ||
              Object.keys(m).some(k => !['name', 'date'].includes(k)) ||
              typeof m.name !== 'string' ||
              m.name.length > 500 ||
              typeof m.date !== 'string',
          )
        )
          invalid();
      } else if (item !== null && (typeof item !== 'string' || item.length > 128)) invalid();
    }
  }
  const allowedStatus = operation.endsWith('task') ? ['backlog', 'todo', 'progress', 'review'] : ['planning', 'active', 'risk', 'hold', 'complete'];
  if (input.status !== undefined && !allowedStatus.includes(input.status as string)) invalid();
  if (input.priority !== undefined && !['none', 'low', 'medium', 'high', 'urgent'].includes(input.priority as string)) {
    invalid();
  }
  if (input.recurrence !== undefined && input.recurrence !== null && !['Daily', 'Weekly', 'Every 2 weeks', 'Monthly'].includes(input.recurrence as string))
    invalid();
  if (input.action !== undefined && !['release', 'reassign', 'complete', 'delete'].includes(input.action as string)) {
    invalid();
  }
  if (input.viewType !== undefined && !['board', 'list', 'table', 'calendar', 'timeline', 'files', 'overview'].includes(input.viewType as string)) invalid();
  if (input.fileType !== undefined && !['fig', 'pdf', 'zip', 'img', 'sheet', 'doc', 'code', 'other'].includes(input.fileType as string)) invalid();
  if (input.preferences !== undefined) {
    const prefs = input.preferences as Record<string, unknown>;
    for (const [key, item] of Object.entries(prefs)) {
      if (['favoriteTaskIds', 'favoriteProjectIds'].includes(key)) {
        if (!Array.isArray(item) || item.some(id => typeof id !== 'string' || !id || id.length > 128)) {
          invalid();
        }
      } else if (key === 'notificationReadStates') {
        if (!object(item) || Object.values(item).some(flag => typeof flag !== 'boolean')) {
          invalid();
        }
      } else invalid();
    }
  }
  return value as Command<Record<string, unknown>>;
}
export function validateQuery(operation: string, query: unknown): Record<string, unknown> {
  if (!queryNames.has(operation) || !object(query) || Object.keys(query).some(key => !['id', 'projectId', 'taskId', 'status', 'cursor', 'limit'].includes(key)))
    invalid();
  if (query.limit !== undefined && (!Number.isInteger(query.limit) || (query.limit as number) < 1 || (query.limit as number) > 100)) invalid();
  for (const [key, value] of Object.entries(query)) {
    if (key !== 'limit' && (typeof value !== 'string' || !value || value.length > 1024)) invalid();
  }
  if ((operation === 'get_task' && typeof query.id !== 'string') || (operation === 'list_task_activity' && typeof query.taskId !== 'string')) invalid();
  return query;
}
