import type { BatchCommand, FileMetadata, Task, TaskAttachment } from '../../domain/contracts.ts';
import { RepositoryError } from '../../workspace/normalized.ts';
import { prepareTaskAction } from '../tasks/task-view-model.ts';
export function deleteFileCommands(file: FileMetadata, attachments: TaskAttachment[], tasks: Task[]): BatchCommand[] {
  const links = attachments.filter(link => link.fileId === file.id);
  if (links.length + 1 > 100) throw new RepositoryError('batch_limit');
  const commands = links.map(link => {
    const task = tasks.find(t => t.id === link.taskId);
    if (!task) throw new RepositoryError('version_conflict');
    return prepareTaskAction(task, 'remove_task_attachment', { fileId: file.id });
  });
  return [...commands, { operation: 'delete_file', input: { id: file.id }, expectedVersion: file.version }];
}
export function filterFiles(files: FileMetadata[], view: { q: string; type: string; sort: string }, projectId?: string) {
  return files
    .filter(
      file =>
        (!projectId || file.projectId === projectId) &&
        (!view.q || file.name.toLocaleLowerCase().includes(view.q.toLocaleLowerCase())) &&
        (view.type === 'all' || file.fileType === view.type),
    )
    .sort((a, b) =>
      view.sort === 'name'
        ? a.name.localeCompare(b.name)
        : view.sort === 'type'
          ? a.fileType.localeCompare(b.fileType)
          : (b.createdAt || '').localeCompare(a.createdAt || ''),
    );
}
/** Pure legacy extension classification; no legacy renderer/store import. */
export function fileTypeForName(name: string) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return (
    Object.entries({
      fig: ['fig'],
      pdf: ['pdf'],
      zip: ['zip', 'rar', '7z'],
      img: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'],
      sheet: ['xlsx', 'xls', 'csv', 'numbers'],
      doc: ['doc', 'docx', 'txt', 'md', 'pages', 'rtf'],
      code: ['js', 'ts', 'json', 'html', 'css', 'py'],
    }).find(([, extensions]) => extensions.includes(ext))?.[0] ?? 'other'
  );
}
