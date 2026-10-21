import { RepositoryError } from '../normalized.ts';
import { patchLocal, localFiles } from '../local-dto.js';
const fail = code => {
  throw new RepositoryError(code);
};
/** A duplicate is authored by the validated legacy member, including receipt replay. */
export function assertFileDuplicationActor(data, operation, result) {
  if (operation !== 'duplicate_file') return;
  if (!data.members?.some(member => member.id === data.me) || (result && result.authorUserId !== data.me)) fail('forbidden');
}
/** Labels and file metadata share record CAS; their task links use parent CAS. */
export function mutateTaskDetails({ data, find, cas, bump, dto, initialize }, operation, input) {
  if (operation === 'duplicate_file') {
    assertFileDuplicationActor(data, operation);
    const source = find('file', input.id);
    cas('file', source);
    const id = input.newId ?? crypto.randomUUID();
    if (localFiles(data).some(file => file.id === id)) fail('validation_error');
    const at = Date.now();
    const row = { ...structuredClone(source), id, name: input.name ?? source.name.replace(/(\.[^.]+)$/, ' copy$1'), by: data.me, at };
    for (const alias of ['authorUserId', 'author_user_id']) if (Object.hasOwn(row, alias)) row[alias] = data.me;
    for (const alias of ['createdAt', 'created_at']) if (Object.hasOwn(row, alias)) row[alias] = new Date(at).toISOString();
    initialize('file', row);
    (data.files ??= []).push(row);
    return dto('file', row);
  }
  if (/^(set|remove)_task_(label|attachment)$/.test(operation)) {
    const task = find('task', input.id);
    cas('task', task);
    const label = operation.endsWith('label');
    const row = find(label ? 'label' : 'file', label ? input.labelId : input.fileId);
    const field = label ? 'labels' : 'attachments';
    const links = task[field] ?? [];
    if (label && !(data.labels ?? []).some(item => item.id === row.id)) (data.labels ??= []).push(structuredClone(row));
    const matches = link => (label ? link : link.id) === row.id;
    // Freeze the full canonical record before a new embedded link can precede its source.
    if (!label && !(data.files ?? []).some(file => file.id === row.id)) (data.files ??= []).push(structuredClone(row));
    if (operation.startsWith('remove')) {
      task[field] = links.filter(link => !matches(link));
    } else if (links.some(matches)) {
      if (!label) task[field] = links.map(link => (matches(link) ? { ...link, order: input.sortOrder ?? 0 } : link));
    } else task[field] = [...links, label ? row.id : { id: row.id, name: row.name, type: row.type, size: row.size, order: input.sortOrder ?? 0 }];
    bump('task', task);
    return dto('task', task);
  }
  const kind = operation.endsWith('_label') ? 'label' : 'file';
  const collection = kind === 'label' ? 'labels' : 'files';
  const mode = operation.split('_')[0];
  let row;
  if (mode === 'create') {
    row = { id: input.id ?? crypto.randomUUID(), ...(kind === 'file' ? { by: data.me, type: 'doc' } : {}) };
    if (
      (data[collection] ?? []).some(item => item.id === row.id) ||
      (kind === 'file' && data.tasks.some(t => (t.attachments ?? []).some(f => f.id === row.id))) ||
      (kind === 'label' && data.tasks.some(t => (t.labels ?? []).includes(row.id)))
    )
      fail('validation_error');
    initialize(kind, row);
    (data[collection] ??= []).push(row);
  } else {
    row = find(kind, input.id);
    cas(kind, row);
    if (mode === 'update' && !(data[collection] ?? []).some(item => item.id === row.id)) {
      const parent = kind === 'file' ? data.tasks.find(task => (task.attachments ?? []).some(file => file.id === row.id)) : null;
      row = {
        ...structuredClone(row),
        ...(kind === 'file'
          ? {
              project: Object.hasOwn(row, 'project') ? row.project : (parent?.project ?? null),
              task: Object.hasOwn(row, 'task') ? row.task : (parent?.id ?? null),
            }
          : {}),
      };
      (data[collection] ??= []).push(row);
    }
  }
  if (mode === 'delete') {
    if (data.tasks.some(task => (kind === 'label' ? (task.labels ?? []).includes(row.id) : (task.attachments ?? []).some(file => file.id === row.id))))
      fail('validation_error');
    data[collection] = data[collection].filter(item => item.id !== row.id);
    return { id: row.id, deleted: true };
  }
  if (input.projectId) find('project', input.projectId);
  if (input.taskId) find('task', input.taskId);
  patchLocal(row, input);
  if (Object.hasOwn(input, 'taskId')) row.task = input.taskId;
  if (mode !== 'create') bump(kind, row);
  return dto(kind, row);
}
