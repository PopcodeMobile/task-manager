import { Maximize2, Minimize2, Circle, CircleCheck, Star, Link, Calendar, Repeat2, Timer, FileText, Save } from 'lucide-react';
import { TaskDescriptionEditor } from './TaskDescriptionEditor';
import { TaskFieldControl, taskDateLabel } from './TaskFieldPopover';
import { MemberAvatar, projectTone } from '../projects/ProjectVisual';
import { TaskStatusIcon, TaskPriorityIcon } from './TaskVisual';
import { taskCreateCommand, knownNonCommitting } from './task-create-command';
import { prepareTaskAction } from './task-view-model';
import { TaskCoreActions } from './TaskCoreActions';
import { TaskExecutionSection } from './TaskExecutionSection';
import type { WorkspaceRepository } from '../../workspace/repository';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TaskRelationSection } from './TaskRelationSection';
import { TaskSubtasksSection } from './TaskSubtasksSection';
import { TaskAttachmentsSection } from './TaskAttachmentsSection';
import { TaskDiscussionSection } from './TaskDiscussionSection';
import { useTaskDetails, type TaskGraph } from '../shell/useWorkspaceData';
import type { Task, Project, TaskStatus, TaskPriority, Recurrence, Json } from '../../domain/contracts';
import { type Agent, type Member } from '../../workspace/normalized';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '../../components/ui/alert-dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import type { Translate } from '../auth/ConsentPage';
import { errorMessage } from '../shell/messages';
import type { Execute } from '../projects/ProjectsPage';
import { statuses, statusLabel, priorityLabel } from './TaskList';
export type DraftGuard = { dirty: boolean; flush: () => Promise<boolean> };
export function TaskDrawer({
  task,
  removed = false,
  projects,
  tasks,
  agents,
  members,
  repo,
  execute,
  t,
  close,
  created,
  readOnly,
  projectId,
  initialDueDate,
  initialAssignee,
  initialStatus,
  prefs = {},
  revision,
  admin,
  refresh,
  registerDraft,
  favorite,
  toggleFavorite,
  copyLink,
  graph,
  quickEdit = false,
}: {
  task: Task | 'new';
  quickEdit?: boolean;
  removed?: boolean;
  projects: Project[];
  tasks: Task[];
  agents: Agent[];
  members: Member[];
  repo: WorkspaceRepository;
  execute: Execute;
  t: Translate;
  close: () => void;
  created: (id: string) => void;
  readOnly: boolean;
  projectId?: string;
  initialDueDate?: string;
  initialAssignee?: string;
  initialStatus?: string;
  prefs?: Record<string, unknown>;
  revision: number;
  admin: boolean;
  refresh: () => Promise<void>;
  registerDraft: (guard: DraftGuard | null) => void;
  favorite: boolean;
  toggleFavorite: () => Promise<void>;
  copyLink: () => Promise<void>;
  graph: TaskGraph;
}) {
  const titleInput = useRef<HTMLTextAreaElement>(null);
  const discussionGuard = useRef<DraftGuard | null>(null);
  const registerDiscussion = useCallback((guard: DraftGuard | null) => {
    discussionGuard.current = guard;
  }, []);
  const [attempt, setAttempt] = useState<{ operation: string; input: Record<string, unknown>; version?: number } | null>(null);
  const unavailable = readOnly || removed;
  const initial = task === 'new' ? null : task;
  const [newTaskId, setNewTaskId] = useState(() => crypto.randomUUID());
  const [createMore, setCreateMore] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? ''),
    [description, setDescription] = useState(initial?.description ?? ''),
    [project, setProject] = useState(initial?.projectId ?? (projectId || projects[0]?.id || '')),
    [status, setStatus] = useState<TaskStatus>(
      initial?.status ?? (['backlog', 'todo', 'progress', 'review', 'done'].includes(initialStatus ?? '') ? (initialStatus as TaskStatus) : 'todo'),
    ),
    [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'none'),
    [due, setDue] = useState(initial?.dueDate ?? initialDueDate ?? ''),
    [start, setStart] = useState(initial?.startDate ?? ''),
    [recurrence, setRecurrence] = useState<Recurrence | ''>(initial?.recurrence ?? ''),
    [estimate, setEstimate] = useState(String(initial?.legacyMetadata.estimate ?? '')),
    [assignee, setAssignee] = useState(initial?.assigneeUserId ?? initialAssignee ?? ''),
    [agent, setAgent] = useState(initial?.executorAgentId ?? ''),
    [deleteConfirm, setDeleteConfirm] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [conflict, setConflict] = useState(false),
    [subDirty, setSubDirty] = useState(false),
    [full, setFull] = useState(prefs.openTasks === 'full');
  const current = task === 'new' ? null : task,
    centered = !current || quickEdit,
    active = !!current?.reservation?.active && Date.parse(current.reservation.expiresAt) > Date.now();
  const version = current?.version;
  const [editVersion, setEditVersion] = useState(initial?.version);
  const saveButton = useRef<HTMLButtonElement>(null);
  const fingerprint = JSON.stringify([title, description, project, status, priority, due, assignee, start, recurrence, estimate]);
  const savedFingerprint = useRef(fingerprint);
  useLayoutEffect(() => {
    const input = titleInput.current;
    if (!input) return;
    const size = () => {
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
    };
    size();
    const observer = new ResizeObserver(size);
    observer.observe(input);
    return () => observer.disconnect();
  }, [title, full]);
  const dirty = fingerprint !== savedFingerprint.current;
  async function save() {
    if (subDirty) {
      setError(t('Salve a subtarefa antes de continuar.', 'Save subtask before continuing.'));
      return false;
    }
    if (conflict || busy || removed) return false;
    if (!title.trim() || !project) {
      setError(t('Informe o título e o projeto antes de continuar.', 'Enter a title and project before continuing.'));
      return false;
    }
    setBusy(true);
    setError('');
    try {
      const input = {
        ...(current ? { id: current.id } : { id: newTaskId, projectId: project }),
        title,
        description,
        priority,
        assigneeUserId: assignee || null,
        dueDate: due || null,
        startDate: start || null,
        recurrence: recurrence || null,
        ...(estimate === String(current?.legacyMetadata.estimate ?? '') ? {} : { attributes: { estimate } }),
        ...(status === current?.status ? {} : { status }),
      };
      const command = attempt ?? (current ? { operation: 'update_task', input, version: editVersion } : taskCreateCommand(input));
      setAttempt(command);
      const result = await execute<Task | { results: { data: Task }[] }>(command.operation, command.input, 'version' in command ? command.version : undefined);
      const saved = 'results' in result ? result.results.at(-1)!.data : result;
      setAttempt(null);
      savedFingerprint.current = fingerprint;
      setEditVersion(saved.version);
      setConflict(false);
      registerDraft(null);
      if (!current && createMore) {
        setTitle('');
        setDescription('');
        setNewTaskId(crypto.randomUUID());
        savedFingerprint.current = JSON.stringify(['', '', project, status, priority, due, assignee, start, recurrence, estimate]);
        titleInput.current?.focus();
      } else if (!current) created(saved.id);
      return true;
    } catch (err) {
      if (knownNonCommitting(err)) setAttempt(null);
      if (!repo.controller.signal.aborted) {
        setError(errorMessage(err, t));
        if ((err as { code?: string }).code === 'version_conflict') setConflict(true);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    registerDraft({
      get dirty() {
        return dirty || busy || subDirty || !!attempt || !!discussionGuard.current?.dirty;
      },
      flush: async () => {
        if (discussionGuard.current?.dirty && !(await discussionGuard.current.flush())) return false;
        return removed ? false : save();
      },
    });
    return () => registerDraft(null);
  });
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirty || busy || subDirty || attempt || discussionGuard.current?.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    addEventListener('beforeunload', before);
    return () => removeEventListener('beforeunload', before);
  }, [dirty, busy, subDirty, attempt, discussionGuard]);
  useEffect(() => {
    if (!current || dirty || busy || attempt || removed) return;
    setTitle(current.title);
    setDescription(current.description);
    setProject(current.projectId);
    setStatus(current.status);
    setPriority(current.priority);
    setDue(current.dueDate ?? '');
    setStart(current.startDate ?? '');
    setRecurrence(current.recurrence ?? '');
    setEstimate(String(current.legacyMetadata.estimate ?? ''));
    setAssignee(current.assigneeUserId ?? '');
    setEditVersion(current.version);
    savedFingerprint.current = JSON.stringify([
      current.title,
      current.description,
      current.projectId,
      current.status,
      current.priority,
      current.dueDate ?? '',
      current.assigneeUserId ?? '',
      current.startDate ?? '',
      current.recurrence ?? '',
      String(current.legacyMetadata.estimate ?? ''),
    ]);
  }, [current?.version, busy, dirty]);
  const details = useTaskDetails(repo, current?.id, revision, t, graph);
  const incoming = details.dependencies.filter(d => d.dependsOnTaskId === current?.id);
  const sharedFiles = details.attachments.filter(
    link => link.taskId !== current?.id && details.files.some(file => file.id === link.fileId && file.taskId === current?.id),
  );
  async function action(run: () => Promise<unknown>) {
    if (busy || removed) return;
    setBusy(true);
    setError('');
    try {
      await run();
    } catch (err) {
      if (!repo.controller.signal.aborted) {
        setError(errorMessage(err, t));
        if ((err as { code?: string }).code === 'version_conflict') setConflict(true);
      }
    } finally {
      setBusy(false);
    }
  }
  function requireSaved(includeSubtask = true) {
    if (removed || attempt || discussionGuard.current?.dirty) {
      if (discussionGuard.current?.dirty) void discussionGuard.current.flush();
      return false;
    }
    if (includeSubtask && subDirty) {
      setError(t('Salve a subtarefa antes de continuar.', 'Save subtask before continuing.'));
      return false;
    }
    if (!dirty && !conflict) return true;
    setError(t('Salve as alterações antes desta ação. O rascunho foi mantido.', 'Save changes before this action. Your draft was kept.'));
    saveButton.current?.focus();
    return false;
  }
  async function detailAction(run: () => Promise<unknown>, parent = false, subtask = false) {
    if (parent && !requireSaved(!subtask)) return;
    await action(run);
  }
  function taskAction(operation: string, input: Record<string, Json> = {}, after?: 'open' | 'close') {
    if (!current || !requireSaved()) return;
    void action(async () => {
      const command = prepareTaskAction(current, operation, input, editVersion);
      const result = await execute<Task>(command.operation, command.input, command.expectedVersion);
      if (after === 'open') {
        registerDraft(null);
        created(result.id);
      }
      if (after === 'close') {
        registerDraft(null);
        close();
      }
    });
  }
  return (
    <Sheet
      open
      onOpenChange={open => {
        if (!open) close();
      }}
    >
      <SheetContent
        className={`task-drawer ${centered ? 'task-modal' : full ? 'task-full' : ''}`}
        closeLabel={t('Fechar painel', 'Close panel')}
        onEscapeKeyDown={event => {
          if ((event.target as HTMLElement).closest('.task-field-popover')) event.preventDefault();
        }}
      >
        <div className="drawer-h task-drawer-heading">
          {centered ? (
            <strong>{current ? t('Editar tarefa', 'Edit task') : t('Nova tarefa', 'New task')}</strong>
          ) : (
            <>
              <span className="drawer-project-label">{projects.find(p => p.id === project)?.name}</span>
              <span className="faint">/</span>
              <span className="drawer-eyebrow">{current?.key ?? t('Nova tarefa', 'New task')}</span>
              <span className="sp" />
              {current && (
                <>
                  <Button
                    type="button"
                    className="btn-sm task-complete-trigger"
                    aria-label={current.status === 'done' ? t('Reabrir tarefa', 'Reopen task') : t('Marcar como concluída', 'Mark complete')}
                    variant="ghost"
                    disabled={busy || unavailable || active}
                    onClick={() => taskAction(current.status === 'done' ? 'update_task' : 'complete_task', current.status === 'done' ? { status: 'todo' } : {})}
                  >
                    {current.status === 'done' ? <CircleCheck size={14} /> : <Circle size={14} />}
                    <span className="hide-m">{current.status === 'done' ? t('Concluída', 'Completed') : t('Marcar como concluída', 'Mark complete')}</span>
                  </Button>
                  <Button
                    type="submit"
                    form="task-details-form"
                    ref={saveButton}
                    variant="ghost"
                    className="ibtn ibtn-sm"
                    aria-label={t('Salvar alterações', 'Save changes')}
                    disabled={busy || unavailable || conflict || !project}
                  >
                    <Save size={15} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="ibtn ibtn-sm"
                    aria-label={favorite ? t('Remover dos favoritos', 'Remove from favorites') : t('Adicionar aos favoritos', 'Add to favorites')}
                    disabled={busy}
                    onClick={() => void action(toggleFavorite)}
                  >
                    <Star size={15} fill={favorite ? 'currentColor' : 'none'} style={{ color: favorite ? 'var(--amber)' : undefined }} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="ibtn ibtn-sm"
                    aria-label={t('Copiar link', 'Copy link')}
                    onClick={() => void action(copyLink)}
                  >
                    <Link size={15} />
                  </Button>
                </>
              )}
              <Button
                className="ibtn ibtn-sm"
                variant="ghost"
                aria-label={full ? t('Minimizar tarefa', 'Minimize task') : t('Maximizar tarefa', 'Maximize task')}
                aria-pressed={full}
                onClick={() => setFull(value => !value)}
              >
                {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </Button>
            </>
          )}
        </div>
        <SheetTitle className="sr-only">{current ? t('Detalhes da tarefa', 'Task details') : t('Nova tarefa', 'New task')}</SheetTitle>
        <SheetDescription className="sr-only">
          {t('Organize a tarefa, acompanhe o agente e registre decisões.', 'Organize the task, supervise its agent and record decisions.')}
        </SheetDescription>
        <div className="drawer-b">
          {removed && (
            <div role="alert">
              <p>{t('Esta tarefa foi excluída. Seu rascunho foi mantido para cópia.', 'This task was deleted. Your draft is retained for copying.')}</p>
              <Button
                variant="outline"
                onClick={() => {
                  registerDraft(null);
                  close();
                }}
              >
                {t('Descartar rascunhos e fechar', 'Discard drafts and close')}
              </Button>
            </div>
          )}
          {attempt && !busy && <p role="status">{t('Confirme a gravação anterior tentando salvar novamente.', 'Save again to confirm the previous write.')}</p>}
          {current?.status === 'done' && !centered && (
            <div className="task-completed-banner">
              <CircleCheck size={15} />
              <span>
                {t('Concluída.', 'Completed.')}{' '}
                <Button variant="ghost" disabled={busy || unavailable || active} onClick={() => taskAction('update_task', { status: 'todo' })}>
                  {t('Reabrir', 'Reopen')}
                </Button>
              </span>
            </div>
          )}
          <form
            id="task-details-form"
            className={centered ? 'task-modal-form' : undefined}
            onSubmit={e => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="form-field task-drawer-title">
              <span className="sr-only">{t('Título', 'Title')}</span>
              <textarea
                aria-label={t('Título', 'Title')}
                className={centered ? 'ttl-edit input input-lg' : 'ttl-edit'}
                placeholder={t('Nome da tarefa', 'Task name')}
                required
                ref={titleInput}
                rows={1}
                maxLength={500}
                value={title}
                onChange={e => setTitle(e.target.value)}
                disabled={unavailable || busy || subDirty || !!attempt}
              />
            </label>
            {centered && <TaskDescriptionEditor value={description} onChange={setDescription} disabled={unavailable || busy || subDirty || !!attempt} t={t} />}
            <div className="drawer-fields kv">
              <div className="task-property">
                <span>
                  <Circle size={14} />
                  {t('Status', 'Status')}
                </span>
                <TaskFieldControl
                  triggerLabel={t('Status', 'Status')}
                  menuLabel={t('Status', 'Status')}
                  fieldId="drawer:status"
                  value={status}
                  disabled={unavailable || busy || subDirty || !!attempt}
                  onChange={value => setStatus(value as TaskStatus)}
                  t={t}
                  choices={statuses
                    .filter(s => !current || s !== 'done' || current.status === 'done')
                    .map((id, i) => ({ id, label: statusLabel(id, t), icon: <TaskStatusIcon status={id} />, shortcut: String(i + 1) }))}
                >
                  <TaskStatusIcon status={status} />
                  <span>{statusLabel(status, t)}</span>
                </TaskFieldControl>
              </div>
              <div className="task-property">
                <span>
                  <TaskPriorityIcon priority={priority} />
                  {t('Prioridade', 'Priority')}
                </span>
                <TaskFieldControl
                  triggerLabel={t('Prioridade', 'Priority')}
                  menuLabel={t('Prioridade', 'Priority')}
                  fieldId="drawer:priority"
                  value={priority}
                  disabled={unavailable || busy || subDirty || !!attempt}
                  onChange={value => setPriority(value as TaskPriority)}
                  t={t}
                  choices={(['urgent', 'high', 'medium', 'low', 'none'] as const).map(id => ({
                    id,
                    label: priorityLabel(id, t),
                    icon: <TaskPriorityIcon priority={id} />,
                  }))}
                >
                  <TaskPriorityIcon priority={priority} />
                  <span>{priorityLabel(priority, t)}</span>
                </TaskFieldControl>
              </div>
              <div className="task-property">
                <span>
                  <MemberAvatar />
                  {t('Responsável', 'Assignee')}
                </span>
                <TaskFieldControl
                  triggerLabel={t('Responsável', 'Assignee')}
                  menuLabel={t('Responsável', 'Assignee')}
                  fieldId="drawer:assignee"
                  value={assignee}
                  disabled={unavailable || busy || subDirty || !!attempt}
                  onChange={setAssignee}
                  searchLabel={t('Buscar responsáveis', 'Search assignees')}
                  t={t}
                  choices={[
                    { id: '', label: t('Sem responsável', 'Unassigned'), icon: <MemberAvatar /> },
                    ...members.map(member => ({ id: member.user_id, label: member.name, icon: <MemberAvatar member={member} /> })),
                    ...(assignee && !members.some(m => m.user_id === assignee) ? [{ id: assignee, label: assignee }] : []),
                  ]}
                >
                  <MemberAvatar member={members.find(member => member.user_id === assignee)} />
                  <span>{members.find(member => member.user_id === assignee)?.name ?? (assignee || t('Sem responsável', 'Unassigned'))}</span>
                </TaskFieldControl>
              </div>
              <div className="task-property">
                <span>
                  <Calendar size={14} />
                  {t('Prazo', 'Due date')}
                </span>
                <TaskFieldControl
                  triggerLabel={t('Prazo', 'Due date')}
                  menuLabel={t('Prazo', 'Due date')}
                  fieldId="drawer:due"
                  date
                  value={due}
                  disabled={unavailable || busy || subDirty || !!attempt}
                  onChange={setDue}
                  prefs={prefs}
                  t={t}
                >
                  <Calendar size={13} />
                  <span>{taskDateLabel(due, t, prefs)}</span>
                </TaskFieldControl>
              </div>
              <div className="task-property">
                <span>
                  <Calendar size={14} />
                  {t('Início', 'Start date')}
                </span>
                <TaskFieldControl
                  triggerLabel={t('Início', 'Start date')}
                  menuLabel={t('Início', 'Start date')}
                  fieldId="drawer:start"
                  date
                  value={start}
                  disabled={unavailable || busy || subDirty || !!attempt}
                  onChange={setStart}
                  prefs={prefs}
                  t={t}
                >
                  <Calendar size={13} />
                  <span>{taskDateLabel(start, t, prefs)}</span>
                </TaskFieldControl>
              </div>
              <div className="task-property">
                <span>
                  <FileText size={14} />
                  {t('Projeto', 'Project')}
                </span>
                <TaskFieldControl
                  triggerLabel={t('Projeto', 'Project')}
                  menuLabel={t('Projeto', 'Project')}
                  fieldId="drawer:project"
                  value={project}
                  disabled={!!current || unavailable || busy || subDirty || !!attempt}
                  onChange={setProject}
                  searchLabel={t('Buscar projetos', 'Search projects')}
                  t={t}
                  choices={projects.map(p => ({
                    id: p.id,
                    label: p.name,
                    icon: <span className="pdot" style={{ '--c': projectTone(p) } as React.CSSProperties} />,
                  }))}
                >
                  <span
                    className="pdot"
                    style={
                      {
                        '--c': projects.find(p => p.id === project) ? projectTone(projects.find(p => p.id === project)!) : 'var(--accent)',
                      } as React.CSSProperties
                    }
                  />
                  <span>{projects.find(p => p.id === project)?.name ?? t('Selecione um projeto', 'Select a project')}</span>
                </TaskFieldControl>
              </div>
              <div className="task-property">
                <span>
                  <Repeat2 size={14} />
                  {t('Recorrência', 'Recurrence')}
                </span>
                <TaskFieldControl
                  triggerLabel={t('Recorrência', 'Recurrence')}
                  menuLabel={t('Recorrência', 'Recurrence')}
                  fieldId="drawer:recurrence"
                  value={recurrence}
                  disabled={unavailable || busy || subDirty || !!attempt}
                  onChange={value => setRecurrence(value as Recurrence | '')}
                  t={t}
                  choices={[
                    { id: '', label: t('Não se repete', 'Does not repeat'), icon: <Repeat2 size={14} /> },
                    ...(['Daily', 'Weekly', 'Every 2 weeks', 'Monthly'] as const).map(id => ({
                      id,
                      label: {
                        Daily: t('Diária', 'Daily'),
                        Weekly: t('Semanal', 'Weekly'),
                        'Every 2 weeks': t('A cada 2 semanas', 'Every 2 weeks'),
                        Monthly: t('Mensal', 'Monthly'),
                      }[id],
                      icon: <Repeat2 size={14} />,
                    })),
                  ]}
                >
                  <Repeat2 size={13} />
                  <span>
                    {(
                      {
                        Daily: t('Diária', 'Daily'),
                        Weekly: t('Semanal', 'Weekly'),
                        'Every 2 weeks': t('A cada 2 semanas', 'Every 2 weeks'),
                        Monthly: t('Mensal', 'Monthly'),
                      } as Record<string, string>
                    )[recurrence] || t('Não se repete', 'Does not repeat')}
                  </span>
                </TaskFieldControl>
              </div>
              <label className="task-property">
                <span>
                  <Timer size={14} />
                  {t('Estimativa', 'Estimate')}
                </span>
                <Input
                  value={estimate}
                  placeholder={t('Adicionar estimativa', 'Add estimate')}
                  maxLength={120}
                  onChange={e => setEstimate(e.target.value)}
                  disabled={unavailable || busy || subDirty || !!attempt}
                />
              </label>
              {current && !centered && (
                <TaskRelationSection
                  task={current}
                  tasks={tasks}
                  labels={details.labels}
                  links={details.links}
                  dependencies={details.dependencies}
                  execute={execute}
                  action={detailAction}
                  disabled={busy || unavailable || active || details.loading || !!details.error}
                  t={t}
                  open={created}
                />
              )}
            </div>
            {!centered && <TaskDescriptionEditor value={description} onChange={setDescription} disabled={unavailable || busy || subDirty || !!attempt} t={t} />}
            {centered && (
              <>
                <section className="task-modal-section">
                  <span>{t('Subtarefas', 'Subtasks')}</span>
                  <p className="permission-note">{t('Salve a tarefa para gerenciar subtarefas.', 'Save the task to manage subtasks.')}</p>
                </section>
                <section className="task-modal-section">
                  <span>{t('Anexos', 'Attachments')}</span>
                  <p className="task-modal-attachments">
                    {t(
                      'Salve a tarefa para vincular metadados de arquivos. Nenhum conteúdo é enviado.',
                      'Save the task to link file metadata. No content is uploaded.',
                    )}
                  </p>
                </section>
              </>
            )}
          </form>
          {error && (
            <div>
              <p role="alert" className="error-message">
                {error}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  const blob = new Blob(
                    [
                      JSON.stringify(
                        {
                          workspaceId: repo.workspaceId,
                          exportedAt: new Date().toISOString(),
                          task: {
                            id: current?.id ?? newTaskId,
                            version: editVersion,
                            title,
                            description,
                            projectId: project,
                            status,
                            priority,
                            assigneeUserId: assignee || null,
                            dueDate: due || null,
                            startDate: start || null,
                            recurrence: recurrence || null,
                            estimate,
                          },
                        },
                        null,
                        2,
                      ),
                    ],
                    { type: 'application/json' },
                  );
                  const url = URL.createObjectURL(blob),
                    link = document.createElement('a');
                  link.href = url;
                  link.download = 'task-draft.json';
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                {t('Exportar rascunho da tarefa', 'Export task draft')}
              </Button>
            </div>
          )}
          {conflict && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const latest = await repo.query<{ data: Task }>('get_task', { id: current!.id }, true);
                  setTitle(latest.data.title);
                  setDescription(latest.data.description);
                  setStatus(latest.data.status);
                  setPriority(latest.data.priority);
                  setDue(latest.data.dueDate ?? '');
                  setStart(latest.data.startDate ?? '');
                  setRecurrence(latest.data.recurrence ?? '');
                  setEstimate(String(latest.data.legacyMetadata.estimate ?? ''));
                  setAssignee(latest.data.assigneeUserId ?? '');
                  setEditVersion(latest.data.version);
                  savedFingerprint.current = JSON.stringify([
                    latest.data.title,
                    latest.data.description,
                    latest.data.projectId,
                    latest.data.status,
                    latest.data.priority,
                    latest.data.dueDate ?? '',
                    latest.data.assigneeUserId ?? '',
                    latest.data.startDate ?? '',
                    latest.data.recurrence ?? '',
                    String(latest.data.legacyMetadata.estimate ?? ''),
                  ]);
                  await refresh();
                  setConflict(false);
                })
              }
            >
              {t('Recarregar versão e descartar rascunho', 'Reload version and discard draft')}
            </Button>
          )}
          {current && !centered && (
            <>
              {details.error && (
                <p role="alert">
                  {details.error}
                  <Button variant="outline" onClick={details.retry}>
                    {t('Tentar novamente', 'Try again')}
                  </Button>
                </p>
              )}
              <TaskSubtasksSection
                task={current}
                subtasks={details.subtasks}
                members={members}
                execute={execute}
                action={(run, parent) => detailAction(run, parent, true)}
                registerDirty={setSubDirty}
                canOpen={requireSaved}
                disabled={busy || unavailable || active || details.loading || !!details.error}
                t={t}
                open={id => {
                  registerDraft(null);
                  created(id);
                }}
              />
              <TaskAttachmentsSection
                task={current}
                files={details.files}
                attachments={details.attachments}
                execute={execute}
                action={detailAction}
                disabled={busy || unavailable || active || details.loading || !!details.error}
                t={t}
              />
              <TaskDiscussionSection
                registerDraft={registerDiscussion}
                task={current}
                more={details.more}
                loadMore={details.loadMore}
                comments={details.comments}
                reactions={details.reactions}
                events={details.events}
                history={details.history}
                members={members}
                agents={agents}
                actorId={details.actorId}
                admin={repo.mode === 'cloud' && admin}
                execute={execute}
                action={detailAction}
                disabled={busy || unavailable || details.loading || !!details.error}
                t={t}
              />
              <details className="drawer-extra-actions" open={active || !!current.executorAgentId || undefined}>
                <summary>
                  {t('Ações da tarefa e agente', 'Task actions and agent')}
                  {active ? ` · ${t('Execução reservada', 'Execution reserved')}` : ''}
                </summary>{' '}
                <TaskExecutionSection
                  current={current}
                  active={active}
                  agent={agent}
                  agents={agents}
                  setAgent={setAgent}
                  readOnly={unavailable}
                  busy={busy}
                  t={t}
                  onAssign={() => taskAction('intervene_task', { action: 'reassign', executorAgentId: agent })}
                  onResume={() => {
                    if (requireSaved()) setConfirm(true);
                  }}
                  onComplete={() => taskAction('complete_task')}
                />
                <TaskCoreActions task={current} projects={projects} t={t} disabled={busy || unavailable || active} run={taskAction} />
              </details>
              {!!sharedFiles.length && (
                <section className="drawer-section">
                  <p>{t('Desvincule os arquivos nas tarefas relacionadas antes de excluir:', 'Unlink files in related tasks before deleting:')}</p>
                  {sharedFiles.map(link => (
                    <Button key={`${link.taskId}:${link.fileId}`} variant="ghost" onClick={() => created(link.taskId)}>
                      {tasks.find(task => task.id === link.taskId)?.title ?? link.taskId}
                    </Button>
                  ))}
                </section>
              )}
              <section className="drawer-section">
                <Button
                  variant="destructive"
                  disabled={busy || unavailable || active}
                  onClick={() => {
                    if (requireSaved()) {
                      if (prefs.confirmDel === false && !incoming.length && !sharedFiles.length && !details.loading && !details.error)
                        void action(async () => {
                          await execute('delete_task', { id: current.id }, version);
                          registerDraft(null);
                          close();
                        });
                      else setDeleteConfirm(true);
                    }
                  }}
                >
                  {t('Excluir tarefa', 'Delete task')}
                </Button>
                <p className="permission-note">
                  {t(
                    'Relações com tarefas que continuam no workspace precisam ser desvinculadas antes da exclusão.',
                    'Relations with tasks remaining in the workspace must be unlinked before deletion.',
                  )}
                </p>
              </section>
              <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
                <AlertDialogContent>
                  <AlertDialogTitle>{t('Excluir esta tarefa?', 'Delete this task?')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {incoming.length
                      ? t(
                          'Abra as tarefas relacionadas e desvincule as dependências antes de excluir.',
                          'Open the related tasks and unlink their dependencies before deleting.',
                        )
                      : t(
                          'A tarefa e seus comentários serão excluídos. Esta ação não pode ser desfeita.',
                          'The task and its comments will be deleted. This action cannot be undone.',
                        )}
                  </AlertDialogDescription>
                  <div className="button-row">
                    <AlertDialogCancel asChild>
                      <Button variant="outline">{t('Cancelar', 'Cancel')}</Button>
                    </AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <Button
                        variant="destructive"
                        disabled={!!incoming.length || !!sharedFiles.length || details.loading || !!details.error}
                        onClick={() =>
                          void action(async () => {
                            await execute('delete_task', { id: current.id }, version);
                            registerDraft(null);
                            close();
                          })
                        }
                      >
                        {t('Confirmar exclusão', 'Confirm deletion')}
                      </Button>
                    </AlertDialogAction>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog open={confirm} onOpenChange={setConfirm}>
                <AlertDialogContent>
                  <AlertDialogTitle>{t('Retomar controle humano?', 'Resume human control?')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t(
                      'A reserva do agente será encerrada. A tarefa volta ao controle humano e a intervenção fica registrada na atividade.',
                      'The agent reservation will end. The task returns to human control and the intervention is recorded in activity.',
                    )}
                  </AlertDialogDescription>
                  <div className="button-row">
                    <AlertDialogCancel asChild>
                      <Button variant="outline">{t('Cancelar', 'Cancel')}</Button>
                    </AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <Button
                        onClick={() =>
                          void action(async () => {
                            if (!requireSaved()) return;
                            await execute('intervene_task', { id: current.id, action: 'release' }, editVersion);
                            setAgent('');
                          })
                        }
                      >
                        {t('Confirmar retomada', 'Confirm resume')}
                      </Button>
                    </AlertDialogAction>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
        {centered && (
          <div className="task-modal-footer">
            {!current && (
              <label className="row">
                <input type="checkbox" checked={createMore} disabled={busy || !!attempt} onChange={event => setCreateMore(event.target.checked)} />
                {t('Criar outra', 'Create more')}
              </label>
            )}
            <span className="sp" />
            <Button variant="outline" disabled={busy} onClick={close}>
              {t('Cancelar', 'Cancel')}
            </Button>
            <Button ref={saveButton} type="submit" form="task-details-form" disabled={busy || unavailable || conflict || !project}>
              {current ? t('Salvar alterações', 'Save changes') : t('Criar tarefa', 'Create task')}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
