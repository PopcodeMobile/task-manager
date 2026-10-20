import { RepositoryError } from '../normalized.ts';
import { patchLocal } from '../local-dto.js';
const fail = code => {
  throw new RepositoryError(code);
};
import { removeProject } from '../../core/task-operations.js';
import { protectRemoval } from './task-graph.js';
export function mutateProject({ data, find, cas, bump, dto, initialize }, operation, input) {
  if (/^(create|update|delete|archive|restore)_project$/.test(operation)) {
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
    patchLocal(project, input);
    if (operation !== 'create_project') bump('project', project);
    return dto('project', project);
  }
}
