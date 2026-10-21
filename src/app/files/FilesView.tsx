import { useEffect, useRef, useState } from 'react';
import { FileText, LayoutGrid, List } from 'lucide-react';
import type { FileMetadata, Project, Task, TaskAttachment } from '../../domain/contracts';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Member } from '../../workspace/normalized';
import type { Translate } from '../auth/ConsentPage';
import type { Execute } from '../projects/ProjectsPage';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel } from '../../components/ui/alert-dialog';
import { errorMessage } from '../shell/messages';
import { useSurfaceView } from '../schedules/useSurfaceView';
import { deleteFileCommands, filterFiles, fileTypeForName } from './file-view-model';
const readView = (v: Record<string, unknown>) => ({
  q: typeof v.q === 'string' ? v.q : '',
  type: typeof v.type === 'string' ? v.type : 'all',
  sort: ['name', 'type'].includes(String(v.sort)) ? String(v.sort) : 'date',
  layout: v.layout === 'list' ? 'list' : 'grid',
  project: typeof v.project === 'string' ? v.project : '',
});
export function FilesView({
  repo,
  files,
  attachments,
  tasks,
  projects,
  members,
  projectId,
  viewKey,
  execute,
  readOnly,
  t,
  openTask,
  fileId,
  selectFile,
}: {
  repo: WorkspaceRepository;
  files: FileMetadata[];
  attachments: TaskAttachment[];
  tasks: Task[];
  projects: Project[];
  members: Member[];
  projectId?: string;
  viewKey?: string;
  execute: Execute;
  readOnly: boolean;
  t: Translate;
  openTask: (id: string) => void;
  fileId?: string;
  selectFile: (id: string) => void;
}) {
  const { value: view, save, ready, error, setError, retry } = useSurfaceView(repo, viewKey ?? `${projectId ? `project:${projectId}:` : ''}files`, readView, t);
  const file = files.find(f => f.id === fileId && (!projectId || f.projectId === projectId)),
    [editing, setEditing] = useState<FileMetadata | null>(null),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState<{ file: FileMetadata; links: TaskAttachment[]; tasks: Task[] } | null>(null),
    [notice, setNotice] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<{ id: string; name: string; fileType: string; sizeLabel: string }[]>([]);
  const [destination, setDestination] = useState(projectId || '');
  function selectMetadata(list: FileList | null) {
    if (!list || busy || readOnly || signal.aborted || repo.mode !== 'local') return;
    setError('');
    if (list.length > 100) {
      setSelectedFiles([]);
      setError(t('Selecione no máximo 100 arquivos. Nada foi alterado.', 'Select at most 100 files. Nothing was changed.'));
      return;
    }
    // Only browser metadata is inspected. No FileReader, byte read, or upload. IDs survive retries.
    setSelectedFiles(Array.from(list, f => ({ id: crypto.randomUUID(), name: f.name, fileType: fileTypeForName(f.name), sizeLabel: `${f.size} B` })));
  }
  const copyId = useRef<{ source: string; version: number; id: string } | null>(null),
    trigger = useRef<HTMLElement | null>(null),
    signal = repo.controller.signal;
  useEffect(() => {
    setEditing(file ?? null);
    setName(file?.name ?? '');
    copyId.current = null;
  }, [fileId]);
  async function action(run: () => Promise<void>) {
    if (busy || signal.aborted) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await run();
    } catch (err) {
      if (!signal.aborted)
        setError(
          err && typeof err === 'object' && 'code' in err && err.code === 'batch_limit'
            ? t(
                'Há mais de 99 vínculos. Desvincule algumas tarefas explicitamente antes de excluir. Nada foi alterado.',
                'There are more than 99 links. Explicitly unlink some tasks before deleting. Nothing was changed.',
              )
            : errorMessage(err, t),
        );
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  const author = (f: FileMetadata) => members.find(m => m.user_id === f.authorUserId)?.name ?? (f.authorUserId || t('Autor desconhecido', 'Unknown author'));
  const date = (f: FileMetadata) =>
    f.createdAt && !Number.isNaN(Date.parse(f.createdAt)) ? new Date(f.createdAt).toLocaleDateString(t('pt-BR', 'en')) : t('Data desconhecida', 'Unknown date');
  const shown = filterFiles(files, view, projectId || view.project || undefined),
    links = file ? attachments.filter(a => a.fileId === file.id) : [];
  function open(id: string, element: HTMLElement) {
    trigger.current = element;
    selectFile(id);
  }
  return (
    <section className="files-view">
      <p className="permission-note">
        {t('Somente metadados. O conteúdo dos arquivos não é enviado nem armazenado.', 'Metadata only. File contents are neither uploaded nor stored.')}
      </p>
      {error && (
        <div className="error-row">
          <p role="alert">{error}</p>
          {!ready && <Button onClick={retry}>{t('Tentar novamente', 'Try again')}</Button>}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {!ready ? (
        <p role="status">{t('Carregando arquivos...', 'Loading files...')}</p>
      ) : (
        <>
          {repo.mode === 'local' && (
            <div
              className="file-metadata-import"
              data-metadata-drop
              onDragOver={e => {
                if (!busy && !readOnly && e.dataTransfer.types.includes('Files')) e.preventDefault();
              }}
              onDrop={e => {
                e.preventDefault();
                selectMetadata(e.dataTransfer.files);
              }}
            >
              <p>
                {t(
                  'Simulação local de metadados: selecione ou solte arquivos. Apenas nome, tipo e tamanho serão registrados; o conteúdo não será lido nem enviado.',
                  'Local metadata simulation: select or drop files. Only name, type and size are recorded; contents are never read or uploaded.',
                )}
              </p>
              <div className="schedule-controls">
                <label className="form-field">
                  {t('Selecionar arquivos para simular metadados', 'Select files for metadata simulation')}
                  <Input
                    type="file"
                    multiple
                    disabled={busy || readOnly}
                    onChange={e => {
                      selectMetadata(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
                {!projectId && (
                  <label className="form-field">
                    {t('Projeto de destino', 'Metadata project')}
                    <select value={destination} disabled={busy || readOnly} onChange={e => setDestination(e.target.value)}>
                      <option value="">{t('Selecione um projeto', 'Select a project')}</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <Button
                  disabled={busy || readOnly || !selectedFiles.length || !projects.some(p => p.id === destination)}
                  onClick={() =>
                    void action(async () => {
                      await execute('batch', { commands: selectedFiles.map(f => ({ operation: 'create_file', input: { ...f, projectId: destination } })) });
                      if (!signal.aborted) {
                        setSelectedFiles([]);
                        setNotice(t('Metadados registrados', 'Metadata recorded'));
                      }
                    })
                  }
                >
                  {t('Adicionar metadados selecionados', 'Add selected metadata')}
                </Button>
              </div>
              {!!selectedFiles.length && (
                <p role="status">
                  {selectedFiles.length} {t('selecionados', 'selected')}: {selectedFiles.map(f => f.name).join(', ')}
                </p>
              )}
            </div>
          )}
          <div className="schedule-controls">
            <Input
              aria-label={t('Buscar arquivos', 'Search files')}
              placeholder={t('Buscar arquivos', 'Search files')}
              value={view.q}
              onChange={e => save({ ...view, q: e.target.value })}
            />
            <select aria-label={t('Filtrar por tipo', 'Filter by type')} value={view.type} onChange={e => save({ ...view, type: e.target.value })}>
              <option value="all">{t('Todos os tipos', 'All types')}</option>
              {['fig', 'pdf', 'zip', 'img', 'sheet', 'doc', 'code', 'other'].map(type => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <select aria-label={t('Ordenar arquivos', 'Sort files')} value={view.sort} onChange={e => save({ ...view, sort: e.target.value })}>
              <option value="date">{t('Mais recentes', 'Newest')}</option>
              <option value="name">{t('Nome', 'Name')}</option>
              <option value="type">{t('Tipo', 'Type')}</option>
            </select>
            {!projectId && (
              <select aria-label={t('Projeto dos arquivos', 'Files project')} value={view.project} onChange={e => save({ ...view, project: e.target.value })}>
                <option value="">{t('Todos os projetos', 'All projects')}</option>
                {projects.map(p => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <Button
              variant="outline"
              aria-label={t('Visualização em grade', 'Grid view')}
              aria-pressed={view.layout === 'grid'}
              onClick={() => save({ ...view, layout: 'grid' })}
            >
              <LayoutGrid size={16} />
            </Button>
            <Button
              variant="outline"
              aria-label={t('Visualização em lista', 'List view')}
              aria-pressed={view.layout === 'list'}
              onClick={() => save({ ...view, layout: 'list' })}
            >
              <List size={16} />
            </Button>
          </div>
          {!shown.length ? (
            <p className="work-empty">{t('Nenhum arquivo encontrado.', 'No files found.')}</p>
          ) : (
            <div className={`file-collection ${view.layout}`}>
              {shown.map(f => (
                <article className="file-card" key={f.id} data-file-id={f.id}>
                  <FileText size={32} />
                  <div>
                    <Button variant="ghost" className="file-name" onClick={e => open(f.id, e.currentTarget)}>
                      {f.name}
                    </Button>
                    <small>
                      {f.fileType} · {f.sizeLabel || '—'}
                    </small>
                    <small>
                      {author(f)} · {date(f)}
                    </small>
                    <small>{projects.find(p => p.id === f.projectId)?.name}</small>
                    {f.taskId && tasks.some(task => task.id === f.taskId) && (
                      <Button variant="ghost" onClick={() => openTask(f.taskId!)}>
                        {tasks.find(task => task.id === f.taskId)?.key || t('Abrir tarefa', 'Open task')}
                      </Button>
                    )}
                  </div>
                  <Button variant="ghost" aria-label={`${t('Opções do arquivo', 'File options')}: ${f.name}`} onClick={e => open(f.id, e.currentTarget)}>
                    ⋯
                  </Button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      <Sheet
        open={!!fileId}
        onOpenChange={open => {
          if (!open && !busy) selectFile('');
        }}
      >
        <SheetContent
          closeLabel={t('Fechar painel', 'Close panel')}
          onCloseAutoFocus={e => {
            e.preventDefault();
            trigger.current?.focus();
          }}
        >
          <SheetTitle>{file?.name ?? t('Arquivo indisponível', 'File unavailable')}</SheetTitle>
          <SheetDescription>
            {t('Somente metadados. Nenhum conteúdo de arquivo é armazenado aqui.', 'Metadata only. No file content is stored here.')}
          </SheetDescription>
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          {file && (
            <>
              <dl className="file-metadata">
                <dt>{t('Tipo', 'File type')}</dt>
                <dd>{file.fileType}</dd>
                <dt>{t('Tamanho informado', 'Size label')}</dt>
                <dd>{file.sizeLabel || '—'}</dd>
                <dt>{t('Enviado por', 'Uploaded by')}</dt>
                <dd>{author(file)}</dd>
                <dt>{t('Data', 'Date')}</dt>
                <dd>{date(file)}</dd>
                <dt>{t('Projeto', 'Project')}</dt>
                <dd>{projects.find(p => p.id === file.projectId)?.name || '—'}</dd>
                <dt>{t('Identificador', 'Identifier')}</dt>
                <dd>{file.id}</dd>
              </dl>
              {!!links.length && (
                <div>
                  <h3>{t('Vinculado a tarefas', 'Linked tasks')}</h3>
                  {links.map(link => (
                    <Button key={link.taskId} variant="ghost" onClick={() => openTask(link.taskId)}>
                      {tasks.find(task => task.id === link.taskId)?.title ?? link.taskId}
                    </Button>
                  ))}
                </div>
              )}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (readOnly || !editing) return;
                  void action(async () => {
                    const updated = await execute<FileMetadata>('update_file', { id: editing.id, name, fileType: fileTypeForName(name) }, editing.version);
                    if (!signal.aborted) {
                      setEditing(updated);
                      setName(updated.name);
                    }
                  });
                }}
              >
                <label className="form-field">
                  {t('Nome do arquivo', 'File name')}
                  <Input required maxLength={500} disabled={busy || readOnly} value={name} onChange={e => setName(e.target.value)} />
                </label>
                <Button type="submit" variant="outline" disabled={busy || readOnly}>
                  {t('Renomear arquivo', 'Rename file')}
                </Button>
              </form>
              <div className="button-row">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const url = new URL(location.href);
                      url.searchParams.set('file', file.id);
                      await navigator.clipboard.writeText(url.href);
                      if (!signal.aborted) setNotice(t('Link copiado', 'Link copied'));
                    })
                  }
                >
                  {t('Copiar link', 'Copy link')}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || readOnly}
                  onClick={() =>
                    void action(async () => {
                      if (!copyId.current || copyId.current.source !== file.id || copyId.current.version !== file.version)
                        copyId.current = { source: file.id, version: file.version, id: crypto.randomUUID() };
                      const copied = await execute<FileMetadata>('duplicate_file', { id: file.id, newId: copyId.current.id }, file.version);
                      if (!signal.aborted) {
                        copyId.current = null;
                        selectFile(copied.id);
                      }
                    })
                  }
                >
                  {t('Duplicar', 'Duplicate')}
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy || readOnly}
                  onClick={() => setRemove({ file: structuredClone(file), links: structuredClone(links), tasks: structuredClone(tasks) })}
                >
                  {t('Excluir arquivo', 'Delete file')}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={!!remove}
        onOpenChange={open => {
          if (!open && !busy) setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t('Excluir arquivo?', 'Delete file?')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'Os metadados serão excluídos permanentemente. Os vínculos listados serão removidos na mesma ação. Reservas ativas exigem retomada explícita na tarefa.',
              'Metadata will be permanently deleted. The listed links will be removed in the same action. Active reservations require explicit intervention on the task.',
            )}
          </AlertDialogDescription>
          {remove?.links.map(link => (
            <p key={link.taskId}>{remove.tasks.find(task => task.id === link.taskId)?.title || link.taskId}</p>
          ))}
          {error && <p role="alert">{error}</p>}
          <div className="button-row">
            <AlertDialogCancel asChild>
              <Button disabled={busy} variant="outline">
                {t('Cancelar', 'Cancel')}
              </Button>
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy || readOnly}
              onClick={() => {
                if (!remove) return;
                void action(async () => {
                  await execute('batch', { commands: deleteFileCommands(remove.file, remove.links, remove.tasks) });
                  if (!signal.aborted) {
                    setRemove(null);
                    selectFile('');
                  }
                });
              }}
            >
              {t('Confirmar exclusão', 'Confirm deletion')}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
