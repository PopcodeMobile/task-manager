import type { LegacyInspection } from './contracts.ts';

const collections = ['projects', 'tasks', 'comments', 'files', 'events', 'teams', 'savedViews', 'activity', 'notifs'];
const known: Record<string, string[]> = {
  projects: [
    'id',
    'key',
    'name',
    'icon',
    'color',
    'status',
    'team',
    'lead',
    'due',
    'start',
    'fav',
    'members',
    'desc',
    'milestones',
    'last',
    'private',
    'archived',
    'archivedAt',
    'created',
    'updated',
    'seq',
  ],
  tasks: [
    'id',
    'key',
    'project',
    'title',
    'desc',
    'status',
    'prevStatus',
    'assignee',
    'priority',
    'due',
    'start',
    'labels',
    'subtasks',
    'attachments',
    'deps',
    'estimate',
    'created',
    'updated',
    'order',
    'fav',
    'recur',
    'completedAt',
    'archived',
    'archivedAt',
    'seq',
    'est',
    'len',
    'age',
    'upd',
  ],
  comments: ['id', 'task', 'by', 'at', 'text', 're'],
  files: ['id', 'project', 'task', 'name', 'type', 'size', 'by', 'at'],
  events: ['id', 'project', 'task', 'title', 'date', 'time'],
  teams: ['id', 'name', 'desc', 'icon', 'c', 'members'],
  savedViews: ['id', 'project', 'name', 'type', 'filters'],
  activity: ['id', 'by', 'verb', 'task', 'project', 'at', 'extra', 'kind', 'value'],
  notifs: ['id', 'type', 'by', 'task', 'project', 'text', 'snippet', 'at', 'read'],
};
const top = new Set([
  ...collections,
  'ws',
  'members',
  'me',
  'memberTeams',
  'projOrder',
  'workspaces',
  'sessions',
  'invoices',
  'tfa',
  'notifPrefs',
  'recentSearches',
]);
const statuses = ['backlog', 'todo', 'progress', 'review', 'done'];
const priorities = ['none', 'low', 'medium', 'high', 'urgent'];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);

/** Advisory diagnosis only. The migration repeats validation inside its transaction.
 * User references are unresolved until compared with authoritative membership in SQL. */
export function inspectLegacyWorkspace(payload: unknown): LegacyInspection {
  const result: LegacyInspection = { valid: false, counts: {}, duplicateIds: [], orphans: [], unmappedFields: [], unresolvedUsers: [], errors: [] };
  if (!object(payload)) {
    result.errors.push('payload');
    return result;
  }
  for (const required of ['projects', 'tasks']) if (!Array.isArray(payload[required])) result.errors.push(required);
  const data: Record<string, Record<string, unknown>[]> = {};
  const users = new Set<string>();
  function walk(value: unknown, path: string, depth = 0) {
    if (depth > 20) {
      result.errors.push(path);
      return;
    }
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1));
    else if (object(value))
      for (const [k, v] of Object.entries(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(k)) result.errors.push(`${path}.${k}`);
        walk(v, `${path}.${k}`, depth + 1);
      }
    else if (typeof value === 'number' && !Number.isFinite(value)) result.errors.push(path);
    else if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) result.errors.push(path);
  }
  walk(payload, 'payload');
  for (const key of Object.keys(payload)) if (!top.has(key)) result.unmappedFields.push(key);
  for (const key of collections) {
    if (payload[key] !== undefined && !Array.isArray(payload[key])) result.errors.push(key);
    data[key] = Array.isArray(payload[key]) ? payload[key].filter(object) : [];
    result.counts[key] = data[key].length;
    if (Array.isArray(payload[key]) && data[key].length !== payload[key].length) result.errors.push(key);
    const ids = new Set();
    data[key].forEach((record, i) => {
      if (!id(record.id)) result.errors.push(`${key}[${i}].id`);
      else if (ids.has(record.id)) result.duplicateIds.push(`${key}:${record.id}`);
      ids.add(record.id);
      for (const field of Object.keys(record)) if (!known[key].includes(field)) result.unmappedFields.push(`${key}[${i}].${field}`);
      for (const field of ['assignee', 'lead', 'by']) if (typeof record[field] === 'string' && record[field]) users.add(record[field]);
      if (Array.isArray(record.members)) for (const user of record.members) if (typeof user === 'string' && user) users.add(user);
      if (record.re != null && !object(record.re)) result.errors.push(`${key}[${i}].re`);
      if (object(record.re))
        for (const [reaction, values] of Object.entries(record.re)) {
          if (!Array.isArray(values)) result.errors.push(`${key}[${i}].re.${reaction}`);
          else
            for (const user of values) {
              if (!id(user)) result.errors.push(`${key}[${i}].re.${reaction}`);
              else users.add(user);
            }
        }
      for (const [nested, fields] of Object.entries({
        subtasks: ['id', 'title', 'done'],
        attachments: ['id', 'name', 'type', 'size', 'by', 'at'],
        milestones: ['name', 'date'],
        filters: ['f', 'op', 'v'],
      })) {
        if (Array.isArray(record[nested]))
          record[nested].forEach((entry, n) => {
            if (object(entry)) {
              for (const field of Object.keys(entry)) if (!fields.includes(field)) result.unmappedFields.push(`${key}[${i}].${nested}[${n}].${field}`);
              if (nested === 'attachments' && typeof entry.by === 'string' && entry.by) users.add(entry.by);
            }
          });
      }
    });
  }
  const projectIds = new Set(data.projects.map(p => p.id));
  const taskIds = new Set(data.tasks.map(t => t.id));
  const teamIds = new Set(data.teams.map(t => t.id));
  const ref = (value: unknown, ids: Set<unknown>, path: string, required = false) => {
    if (value == null || value === '') {
      if (required) result.orphans.push(path);
    } else if (!ids.has(value)) result.orphans.push(`${path}:${String(value)}`);
  };
  result.counts.subtasks = 0;
  result.counts.attachments = 0;
  const subIds = new Set();
  for (const [key, records] of Object.entries(data))
    records.forEach((record, i) => {
      const path = `${key}[${i}]`;
      if (key === 'tasks' || record.project != null) ref(record.project, projectIds, `${path}.project`, key === 'tasks');
      if (key === 'comments' || record.task != null) ref(record.task, taskIds, `${path}.task`, key === 'comments');
      if (record.team) ref(record.team, teamIds, `${path}.team`);
      if (key === 'projects' && record.status != null && !['planning', 'active', 'risk', 'hold', 'complete'].includes(String(record.status)))
        result.errors.push(`${path}.status`);
      if (key !== 'tasks') return;
      if (record.status != null && !statuses.includes(String(record.status))) result.errors.push(`${path}.status`);
      if (record.priority != null && !priorities.includes(String(record.priority))) result.errors.push(`${path}.priority`);
      if (record.recur != null && !['Daily', 'Weekly', 'Every 2 weeks', 'Monthly'].includes(String(record.recur))) result.errors.push(`${path}.recur`);
      for (const field of ['deps', 'labels', 'subtasks', 'attachments']) {
        if (record[field] != null && !Array.isArray(record[field])) {
          result.errors.push(`${path}.${field}`);
          continue;
        }
        const entries = (record[field] || []) as unknown[];
        if (field === 'deps') entries.forEach(v => ref(v, taskIds, `${path}.deps`, true));
        if (field === 'subtasks' || field === 'attachments') {
          result.counts[field] += entries.length;
          for (const [n, entry] of entries.entries()) {
            if (!object(entry) || !id(entry.id)) result.errors.push(`${path}.${field}[${n}].id`);
            else if (field === 'subtasks') {
              if (subIds.has(entry.id)) result.duplicateIds.push(`subtasks:${entry.id}`);
              subIds.add(entry.id);
            }
          }
        }
      }
    });
  if (payload.projOrder != null && !Array.isArray(payload.projOrder)) result.errors.push('projOrder');
  if (Array.isArray(payload.projOrder)) payload.projOrder.forEach(p => ref(p, projectIds, 'projOrder', true));
  if (payload.memberTeams != null && !object(payload.memberTeams)) result.errors.push('memberTeams');
  if (object(payload.memberTeams))
    for (const [user, team] of Object.entries(payload.memberTeams)) {
      users.add(user);
      if (team) ref(team, teamIds, `memberTeams.${user}`);
    }
  result.unresolvedUsers = [...users];
  result.valid = !result.duplicateIds.length && !result.orphans.length && !result.errors.length;
  return result;
}
