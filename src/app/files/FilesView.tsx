import { useEffect, useRef, useState } from 'react';
import {
  FileText,
  LayoutGrid,
  List,
  MoreHorizontal,
  FolderArchive,
  UploadCloud,
  Upload,
  Search,
  Image,
  FileSpreadsheet,
  FileCode,
  File,
  Figma,
  FileType,
  Eye,
  Pencil,
  Link,
  Copy,
  Trash2,
} from 'lucide-react';
import type { FileMetadata, Project, Task, TaskAttachment } from '../../domain/contracts';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Member } from '../../workspace/normalized';
import type { Translate } from '../auth/ConsentPage';
import type { Execute } from '../projects/ProjectsPage';
import { AnchoredSurface } from '../tasks/AnchoredSurface';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel } from '../../components/ui/alert-dialog';
import { errorMessage } from '../shell/messages';
import { MemberAvatar } from '../projects/ProjectVisual';
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
  const [menuFile, setMenuFile] = useState<FileMetadata | null>(null),
    [renaming, setRenaming] = useState(false);
  const menuAnchor = useRef<HTMLElement | null>(null);
  function options(file: FileMetadata, element: HTMLElement) {
    menuAnchor.current = element;
    setMenuFile(file);
  }
  const metadataPicker = useRef<HTMLInputElement>(null);
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
  const date = (file: FileMetadata) => {
    if (!file.createdAt || Number.isNaN(Date.parse(file.createdAt))) return t('Data desconhecida', 'Unknown date');
    const minutes = Math.max(0, Math.round((Date.now() - Date.parse(file.createdAt)) / 60000));
    if (minutes < 1) return t('agora', 'just now');
    if (minutes < 60) return t(`há ${minutes} min`, `${minutes}m ago`);
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t(`há ${hours} h`, `${hours}h ago`);
    const days = Math.floor(hours / 24);
    return days < 7 ? t(`há ${days} d`, `${days}d ago`) : new Date(file.createdAt).toLocaleDateString(t('pt-BR', 'en'), { month: 'short', day: 'numeric' });
  };
  const shown = filterFiles(files, view, projectId || view.project || undefined),
    links = file ? attachments.filter(a => a.fileId === file.id) : [];
  function open(id: string, element: HTMLElement) {
    trigger.current = element;
    selectFile(id);
  }
  return (
    <section className="files-view">
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
          <div className="schedule-controls files-toolbar toolbar">
            <div className="inwrap file-search">
              <Search size={13} className="i" />
              <Input
                aria-label={t('Buscar arquivos', 'Search files')}
                placeholder={t('Buscar arquivos', 'Search files')}
                value={view.q}
                onChange={e => save({ ...view, q: e.target.value })}
              />
            </div>
            <select aria-label={t('Filtrar por tipo', 'Filter by type')} value={view.type} onChange={e => save({ ...view, type: e.target.value })}>
              <option value="all">{t('Todos os tipos', 'All types')}</option>
              {['fig', 'pdf', 'zip', 'img', 'sheet', 'doc', 'code', 'other'].map(type => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <select aria-label={t('Ordenar arquivos', 'Sort files')} value={view.sort} onChange={e => save({ ...view, sort: e.target.value })}>
              <option value="date">{t('Ordenar: Mais recentes', 'Sort: Newest')}</option>
              <option value="name">{t('Ordenar: Nome', 'Sort: Name')}</option>
              <option value="type">{t('Ordenar: Tipo', 'Sort: Type')}</option>
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
            <span className="sp" />
            <div className="seg file-layout-segments">
              <Button
                variant="ghost"
                className={view.layout === 'grid' ? 'on' : ''}
                aria-label={t('Visualização em grade', 'Grid view')}
                aria-pressed={view.layout === 'grid'}
                onClick={() => save({ ...view, layout: 'grid' })}
              >
                <LayoutGrid size={13} />
              </Button>
              <Button
                variant="outline"
                className={view.layout === 'list' ? 'on' : ''}
                aria-label={t('Visualização em lista', 'List view')}
                aria-pressed={view.layout === 'list'}
                onClick={() => save({ ...view, layout: 'list' })}
              >
                <List size={13} />
              </Button>
            </div>
            {repo.mode === 'local' && (
              <Button className="metadata-picker-trigger" disabled={busy || readOnly} onClick={() => metadataPicker.current?.click()}>
                <Upload size={13} />
                {t('Metadados', 'Add metadata')}
              </Button>
            )}
          </div>
          <div className="page wide files-body">
            {repo.mode === 'local' && (
              <div
                className="file-metadata-drop"
                data-metadata-drop
                onDragOver={event => {
                  if (!busy && !readOnly && event.dataTransfer.types.includes('Files')) event.preventDefault();
                }}
                onDrop={event => {
                  event.preventDefault();
                  selectMetadata(event.dataTransfer.files);
                }}
              >
                <label className="dropzone">
                  <UploadCloud size={18} />
                  <span>
                    {t('Solte arquivos ou clique para registrar metadados.', 'Drop files here or browse · Metadata only')}
                    <small>{t('O conteúdo não é lido nem enviado.', 'Contents are never read or uploaded.')}</small>
                  </span>
                  <Input
                    className="sr-only"
                    ref={metadataPicker}
                    type="file"
                    multiple
                    aria-label={t('Selecionar arquivos para simular metadados', 'Select files for metadata simulation')}
                    disabled={busy || readOnly}
                    onChange={event => {
                      selectMetadata(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </label>
                {selectedFiles.length > 0 && (
                  <div className="metadata-confirmation">
                    <p role="status">
                      {selectedFiles.length} {t('selecionados', 'selected')}: {selectedFiles.map(file => file.name).join(', ')}
                    </p>
                    {!projectId && (
                      <label>
                        {t('Projeto de destino', 'Metadata project')}
                        <select value={destination} disabled={busy || readOnly} onChange={event => setDestination(event.target.value)}>
                          <option value="">{t('Selecione um projeto', 'Select a project')}</option>
                          {projects.map(project => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <Button
                      disabled={busy || readOnly || !projects.some(project => project.id === destination)}
                      onClick={() =>
                        void action(async () => {
                          await execute('batch', {
                            commands: selectedFiles.map(file => ({ operation: 'create_file', input: { ...file, projectId: destination } })),
                          });
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
                )}
              </div>
            )}

            {!shown.length ? (
              <p className="work-empty">{t('Nenhum arquivo encontrado.', 'No files found.')}</p>
            ) : view.layout === 'grid' ? (
              <div className="file-collection grid fgrid">
                {shown.map(f => (
                  <article
                    className="file-card fcard"
                    key={f.id}
                    data-file-id={f.id}
                    onContextMenu={e => {
                      e.preventDefault();
                      options(f, e.currentTarget);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                        e.preventDefault();
                        options(f, e.currentTarget);
                      }
                    }}
                  >
                    <button
                      className="file-preview-trigger"
                      aria-label={`${t('Visualizar arquivo', 'Preview file')}: ${f.name}`}
                      onClick={e => open(f.id, e.currentTarget)}
                    >
                      <FilePreview file={f} />
                    </button>
                    <div className="fi">
                      <Button variant="ghost" className="file-name fn trunc" onClick={e => open(f.id, e.currentTarget)}>
                        {f.name}
                      </Button>
                      <small className="fm">
                        {f.sizeLabel || '—'} · {author(f).split(' ')[0]} · {date(f)}
                      </small>
                    </div>
                    <Button
                      variant="ghost"
                      className="ibtn ibtn-xs more"
                      aria-label={`${t('Opções do arquivo', 'File options')}: ${f.name}`}
                      onClick={e => options(f, e.currentTarget)}
                    >
                      <MoreHorizontal size={13} />
                    </Button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="panel file-list-panel">
                <table className="perm-t file-table">
                  <thead>
                    <tr>
                      {[
                        t('Nome', 'Name'),
                        t('Tipo', 'Type'),
                        t('Tamanho', 'Size'),
                        t('Enviado por', 'Uploaded by'),
                        t('Data', 'Date'),
                        t('Opções', 'Options'),
                      ].map(label => (
                        <th key={label}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(f => (
                      <tr
                        key={f.id}
                        data-file-id={f.id}
                        onContextMenu={e => {
                          e.preventDefault();
                          options(f, e.currentTarget);
                        }}
                      >
                        <td>
                          <span className="row">
                            <span className="ftype" style={{ '--c': fileTone(f.fileType) } as React.CSSProperties}>
                              <FileTypeIcon type={f.fileType} size={14} />
                            </span>
                            <Button variant="ghost" className="file-name" onClick={e => open(f.id, e.currentTarget)}>
                              {f.name}
                            </Button>
                            {f.taskId && tasks.some(task => task.id === f.taskId) && (
                              <Button className="badge" variant="ghost" onClick={() => openTask(f.taskId!)}>
                                {tasks.find(task => task.id === f.taskId)?.key || t('Abrir tarefa', 'Open task')}
                              </Button>
                            )}
                          </span>
                        </td>
                        <td className="muted">{f.fileType}</td>
                        <td className="num muted">{f.sizeLabel || '—'}</td>
                        <td>
                          <span className="row">
                            <MemberAvatar member={members.find(m => m.user_id === f.authorUserId)} />
                            {author(f)}
                          </span>
                        </td>
                        <td className="muted">{date(f)}</td>
                        <td>
                          <Button
                            variant="ghost"
                            className="ibtn ibtn-sm"
                            aria-label={`${t('Opções do arquivo', 'File options')}: ${f.name}`}
                            onClick={e => options(f, e.currentTarget)}
                          >
                            <MoreHorizontal size={14} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      {menuFile && (
        <AnchoredSurface
          anchor={menuAnchor}
          label={t('Opções do arquivo', 'File options')}
          role="menu"
          width={200}
          className="file-options-menu"
          close={() => setMenuFile(null)}
        >
          <Button
            variant="ghost"
            role="menuitem"
            onClick={() => {
              const target = menuFile;
              setMenuFile(null);
              open(target.id, menuAnchor.current!);
            }}
          >
            <Eye size={15} />
            {t('Visualizar', 'Preview')}
          </Button>
          <Button
            variant="ghost"
            role="menuitem"
            disabled={busy || readOnly}
            onClick={() => {
              setEditing(menuFile);
              setName(menuFile.name);
              setMenuFile(null);
              setRenaming(true);
            }}
          >
            <Pencil size={15} />
            {t('Renomear', 'Rename')}
          </Button>
          <Button
            variant="ghost"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              const target = menuFile;
              setMenuFile(null);
              void action(async () => {
                const url = new URL(location.href);
                url.searchParams.set('file', target.id);
                await navigator.clipboard.writeText(url.href);
                if (!signal.aborted) setNotice(t('Link copiado', 'Link copied'));
              });
            }}
          >
            <Link size={15} />
            {t('Copiar link', 'Copy link')}
          </Button>
          <Button
            variant="ghost"
            role="menuitem"
            disabled={busy || readOnly}
            onClick={() => {
              const target = menuFile;
              setMenuFile(null);
              void action(async () => {
                if (!copyId.current || copyId.current.source !== target.id || copyId.current.version !== target.version)
                  copyId.current = { source: target.id, version: target.version, id: crypto.randomUUID() };
                const copied = await execute<FileMetadata>('duplicate_file', { id: target.id, newId: copyId.current.id }, target.version);
                if (!signal.aborted) {
                  copyId.current = null;
                  selectFile(copied.id);
                }
              });
            }}
          >
            <Copy size={15} />
            {t('Duplicar', 'Duplicate')}
          </Button>
          <hr />
          <Button
            variant="ghost"
            role="menuitem"
            className="danger"
            disabled={busy || readOnly}
            onClick={() => {
              setRemove({
                file: structuredClone(menuFile),
                links: structuredClone(attachments.filter(a => a.fileId === menuFile.id)),
                tasks: structuredClone(tasks),
              });
              setMenuFile(null);
            }}
          >
            <Trash2 size={15} />
            {t('Excluir', 'Delete')}
          </Button>
        </AnchoredSurface>
      )}
      <Sheet
        open={!!fileId}
        onOpenChange={open => {
          if (!open && !busy) selectFile('');
        }}
      >
        <SheetContent
          className="file-preview-modal"
          closeLabel={t('Fechar painel', 'Close panel')}
          onCloseAutoFocus={e => {
            e.preventDefault();
            trigger.current?.focus();
          }}
        >
          <header className="file-modal-heading">
            <SheetTitle>{file?.name ?? t('Arquivo indisponível', 'File unavailable')}</SheetTitle>
            <SheetDescription>
              {file ? `${file.fileType} · ${file.sizeLabel || '—'} · ${author(file)} · ${date(file)}` : t('Arquivo indisponível', 'File unavailable')}
            </SheetDescription>
          </header>
          <div className="file-modal-body">
            {error && <p role="alert">{error}</p>}
            {notice && <p role="status">{notice}</p>}
            {file && (
              <>
                <div className="file-preview-art">
                  <FilePreview file={file} />
                </div>
                <p className="permission-note">
                  {t('Somente metadados. Nenhum conteúdo de arquivo é armazenado aqui.', 'Metadata only. No file content is stored here.')}
                </p>
                {!!links.length && (
                  <div className="file-preview-links">
                    <Link size={13} />
                    <span>{t('Anexado a', 'Attached to')}</span>
                    {links.map(link => (
                      <Button key={link.taskId} variant="ghost" onClick={() => openTask(link.taskId)}>
                        {tasks.find(task => task.id === link.taskId)?.title ?? link.taskId}
                      </Button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <footer className="file-modal-footer">
            <Button
              variant="outline"
              disabled={busy || !file}
              onClick={() =>
                void action(async () => {
                  const url = new URL(location.href);
                  url.searchParams.set('file', file!.id);
                  await navigator.clipboard.writeText(url.href);
                  if (!signal.aborted) setNotice(t('Link copiado', 'Link copied'));
                })
              }
            >
              <Link size={14} />
              {t('Copiar link', 'Copy link')}
            </Button>
            <span className="sp" />
            <Button onClick={() => selectFile('')}>{t('Fechar', 'Close')}</Button>
          </footer>
        </SheetContent>
      </Sheet>
      <Sheet
        open={renaming}
        onOpenChange={open => {
          if (!busy) setRenaming(open);
        }}
      >
        <SheetContent
          className="file-rename-modal"
          closeLabel={t('Fechar painel', 'Close panel')}
          onCloseAutoFocus={e => {
            e.preventDefault();
            menuAnchor.current?.focus();
          }}
        >
          <header className="file-modal-heading">
            <SheetTitle>{t('Renomear arquivo', 'Rename file')}</SheetTitle>
            <SheetDescription>{t('Atualize o nome dos metadados do arquivo.', 'Update the file metadata name.')}</SheetDescription>
          </header>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (readOnly || !editing) return;
              void action(async () => {
                const updated = await execute<FileMetadata>('update_file', { id: editing.id, name, fileType: fileTypeForName(name) }, editing.version);
                if (!signal.aborted) {
                  setEditing(updated);
                  setName(updated.name);
                  setRenaming(false);
                }
              });
            }}
          >
            <div className="file-modal-body">
              <label className="form-field">
                {t('Nome do arquivo', 'File name')}
                <Input required maxLength={500} disabled={busy || readOnly} value={name} onChange={e => setName(e.target.value)} />
              </label>
              {error && <p role="alert">{error}</p>}
            </div>
            <footer className="file-modal-footer">
              <span className="sp" />
              <Button type="button" variant="outline" disabled={busy} onClick={() => setRenaming(false)}>
                {t('Cancelar', 'Cancel')}
              </Button>
              <Button type="submit" disabled={busy || readOnly}>
                {t('Renomear arquivo', 'Rename file')}
              </Button>
            </footer>
          </form>
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

export const fileTone = (type: string) =>
  `var(--${({ fig: 'violet', pdf: 'red', zip: 'gray', img: 'teal', sheet: 'green', doc: 'blue', code: 'amber' } as Record<string, string>)[type] ?? 'gray'})`;
export function FileTypeIcon({ type, size = 14 }: { type: string; size?: number }) {
  const Icon =
    ({ fig: Figma, pdf: FileType, zip: FolderArchive, img: Image, sheet: FileSpreadsheet, doc: FileText, code: FileCode } as Record<string, typeof File>)[
      type
    ] ?? File;
  return <Icon size={size} aria-hidden="true" />;
}
export function FilePreview({ file }: { file: FileMetadata }) {
  const tone = fileTone(file.fileType);
  return (
    <div className="fprev" style={{ '--c': tone } as React.CSSProperties} aria-hidden="true">
      {file.fileType === 'zip' ? (
        <FolderArchive size={30} style={{ color: tone }} />
      ) : file.fileType === 'img' ? (
        <div className="art file-art-image">
          <svg viewBox="0 0 100 60" preserveAspectRatio="none">
            <path d="M0 60 L30 28 L52 46 L70 32 L100 58 L100 60Z" fill={`color-mix(in srgb,${tone} 45%,var(--surface))`} />
            <circle cx="76" cy="16" r="7" fill={`color-mix(in srgb,${tone} 30%,var(--surface))`} />
          </svg>
        </div>
      ) : file.fileType === 'sheet' ? (
        <div className="art file-art-sheet">
          {Array.from({ length: 20 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      ) : file.fileType === 'fig' ? (
        <div className="art file-art-fig">
          <div>
            <i className="h" />
            <i />
            <i style={{ width: '70%' }} />
            <i className="file-art-block" />
          </div>
          <div />
        </div>
      ) : (
        <div className="art">
          <i className="h" />
          <i />
          <i />
          <i style={{ width: '80%' }} />
          <i />
          <i style={{ width: '60%' }} />
        </div>
      )}
      <span className="ext">{(file.name.split('.').pop() || '').slice(0, 4)}</span>
    </div>
  );
}
