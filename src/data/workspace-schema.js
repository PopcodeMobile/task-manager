import { WorkspaceError } from '../workspace/errors.js';

const identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const color = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const date = /^\d{4}-\d{2}-\d{2}$/;
const references = new Set(['id', 'key', 'project', 'task', 'by', 'assignee', 'lead', 'team', 'me']);
const referenceLists = new Set(['deps', 'labels', 'projOrder']);
const taskStatuses = ['backlog', 'todo', 'progress', 'review', 'done'];
const projectStatuses = ['planning', 'active', 'risk', 'hold', 'complete'];
const priorities = ['none', 'low', 'medium', 'high', 'urgent'];
const fileTypes = ['fig', 'pdf', 'zip', 'img', 'sheet', 'doc', 'code', 'other'];
const fail = () => {
  throw new WorkspaceError('invalid');
};
const validID = value => typeof value === 'string' && identifier.test(value);
const optionalEnum = (value, values) => {
  if (value != null && !values.includes(value)) fail();
};

// Free text remains untouched and must be escaped by renderers. Structural values
// enter attribute names, CSS variables, selectors and domain lookups directly.
export function validateWorkspace(data) {
  function walk(value, depth = 0) {
    if (depth > 14) fail();
    if (Array.isArray(value)) {
      value.forEach(item => walk(item, depth + 1));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) fail();
      if (references.has(key) && item != null && item !== '' && !validID(item)) fail();
      if (referenceLists.has(key) && (!Array.isArray(item) || item.some(id => !validID(id)))) fail();
      if (key === 'members' && Array.isArray(item) && item.some(member => typeof member === 'string' && !validID(member))) fail();
      if (key === 'c' && item != null && (typeof item !== 'string' || !color.test(item))) fail();
      if (key === 'icon' && item != null && (typeof item !== 'string' || !/^[a-z0-9-]{1,60}$/.test(item))) fail();
      if (['due', 'start', 'date'].includes(key) && item != null && item !== '' && (typeof item !== 'string' || !date.test(item))) fail();
      if (key === 'time' && item != null && (typeof item !== 'string' || !/^\d{2}:\d{2}$/.test(item))) fail();
      if (
        ['order', 'seq', 'created', 'updated', 'completedAt', 'archivedAt'].includes(key) &&
        item != null &&
        (typeof item !== 'number' || !Number.isFinite(item))
      )
        fail();
      if (key === 'recur') optionalEnum(item, ['Daily', 'Weekly', 'Every 2 weeks', 'Monthly']);
      if (key === 'role') optionalEnum(item, ['Owner', 'Admin', 'Member', 'Guest', 'owner', 'admin', 'member', 'guest']);
      if (key === 'size' && item != null && (typeof item !== 'string' || !/^[\d.,\s]+\s(?:B|KB|MB|GB|TB)$/.test(item))) fail();
      if (key === 're' && item && typeof item === 'object') {
        for (const [reaction, users] of Object.entries(item)) {
          if (!/^[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]+$/u.test(reaction) || !Array.isArray(users) || users.some(id => !validID(id)))
            fail();
        }
      }
      if (key === 'memberTeams' && item && typeof item === 'object') {
        if (Object.entries(item).some(([id, team]) => !validID(id) || (team !== '' && !validID(team)))) fail();
      }
      walk(item, depth + 1);
    }
  }
  walk(data);
  for (const task of data.tasks || []) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) fail();
    optionalEnum(task.status, taskStatuses);
    optionalEnum(task.prevStatus, taskStatuses);
    optionalEnum(task.priority, priorities);
    for (const file of task.attachments || []) optionalEnum(file.type, fileTypes);
  }
  for (const project of data.projects || []) {
    optionalEnum(project.status, projectStatuses);
    optionalEnum(project.color, ['indigo', 'blue', 'violet', 'teal', 'rose', 'amber', 'green', 'slate']);
  }
  for (const file of data.files || []) optionalEnum(file.type, fileTypes);
  for (const view of data.savedViews || []) {
    optionalEnum(view.type, ['board', 'list', 'table', 'calendar', 'timeline', 'files', 'overview']);
    for (const filter of view.filters || []) {
      optionalEnum(filter.f, ['status', 'priority', 'assignee', 'due', 'project', 'labels', 'created', 'updated']);
      optionalEnum(filter.op, ['is', 'not']);
    }
  }
  return data;
}
