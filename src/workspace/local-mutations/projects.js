import { RepositoryError } from '../normalized.ts';
import { patchLocal } from '../local-dto.js';
const fail = code => {
  throw new RepositoryError(code);
};
import { removeProject } from '../../core/task-operations.js';
import { protectRemoval } from './task-graph.js';
export function mutateProject({ data, find, cas, bump, dto, initialize }, operation, input) {
  if (
    /^(create|update|delete|archive|restore)_project$/.test(operation) ||
    ['set_project_member', 'remove_project_member', 'local_project_sharing'].includes(operation)
  ) {
    let project;
    if (operation === 'create_project') {
      if (!input.name?.trim()) fail('validation_error');
      project = {
        id: input.id ?? crypto.randomUUID(),
        name: input.name,
        key:
          input.key ??
          input.name
            .replace(/[^a-z]/gi, '')
            .slice(0, 4)
            .toUpperCase(),
        status: 'active',
        seq: 0,
      };
      if (data.projects.some(p => p.id === project.id)) fail('validation_error');
      initialize('project', project);
      data.projects.push(project);
      (data.projOrder ??= []).push(project.id);
    } else {
      project = find('project', input.id);
      cas('project', project);
    }
    if (operation === 'delete_project') {
      const ids = new Set(data.tasks.filter(t => t.project === project.id).map(t => t.id));
      protectRemoval(data, ids, project.id);
      removeProject(data, project.id);
      return { id: project.id, deleted: true };
    }
    if (operation === 'archive_project' || operation === 'restore_project') project.archived = operation === 'archive_project';
    if (operation === 'set_project_member') project.members = [...new Set([...(project.members ?? []), input.userId])];
    if (operation === 'remove_project_member') project.members = (project.members ?? []).filter(id => id !== input.userId);
    let localMemberId;
    if (operation === 'local_project_sharing') {
      if (input.access !== undefined && !['private', 'workspace'].includes(input.access)) fail('validation_error');
      if (input.permission !== undefined && !['Can edit', 'Can view', 'Can comment', 'Full access'].includes(input.permission)) fail('validation_error');
      if (input.email !== undefined) {
        if (typeof input.email !== 'string' || !/^\S+@\S+\.\S+$/.test(input.email) || input.email.length > 254) fail('validation_error');
        let member = data.members.find(m => m.email?.toLowerCase() === input.email.toLowerCase());
        if (!member) {
          member = {
            id: crypto.randomUUID(),
            email: input.email,
            name: input.email.split('@')[0].replace(/[._-]+/g, ' '),
            role: 'Guest',
            team: project.team,
            status: 'invited',
            title: 'Guest',
            c: '#6B7280',
            last: null,
            tz: '',
          };
          data.members.push(member);
        }
        localMemberId = member.id;
        project.members = [...new Set([...(project.members ?? []), member.id])];
      } else localMemberId = input.userId;
      if (input.permission && localMemberId) (project.perms ??= {})[localMemberId] = input.permission;
      if (input.access !== undefined) project.access = input.access;
    } else if (!operation.endsWith('_member')) {
      patchLocal(project, input);
      if (input.sortOrder !== undefined) {
        const order = [...new Set([...(data.projOrder ?? []), ...data.projects.map(p => p.id)])].filter(
          id => id !== project.id && data.projects.some(p => p.id === id),
        );
        order.splice(Math.max(0, Math.min(order.length, Math.trunc(input.sortOrder))), 0, project.id);
        data.projOrder = order;
      }
    }
    if (operation !== 'create_project') bump('project', project);
    return { ...dto('project', project), ...(localMemberId ? { localMemberId } : {}) };
  }
}
