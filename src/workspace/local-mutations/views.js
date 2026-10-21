import { RepositoryError } from '../normalized.ts';
import { patchLocal } from '../local-dto.js';
export function mutateView({ data, find, cas, bump, dto, initialize }, operation, input) {
  if (input.projectId) find('project', input.projectId);
  let row;
  if (operation === 'create_view') {
    row = { id: input.id ?? crypto.randomUUID(), project: null, filters: [] };
    if ((data.savedViews ?? []).some(v => v.id === row.id)) throw new RepositoryError('validation_error');
    initialize('view', row);
    (data.savedViews ??= []).push(row);
  } else {
    row = find('view', input.id);
    cas('view', row);
  }
  if (operation === 'delete_view') {
    data.savedViews = data.savedViews.filter(v => v.id !== row.id);
    return { id: row.id, deleted: true };
  }
  patchLocal(row, input);
  if (operation !== 'create_view') bump('view', row);
  return dto('view', row);
}
