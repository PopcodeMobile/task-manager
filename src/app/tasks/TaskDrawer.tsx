import { prepareTaskAction } from './task-view-model';
import { TaskCoreActions } from './TaskCoreActions';
import { TaskExecutionSection } from './TaskExecutionSection';
import type { WorkspaceRepository } from '../../workspace/repository';
import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
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
  revision,
  admin,
  refresh,
  registerDraft,
  favorite,
  toggleFavorite,
  copyLink,
  graph,
}: {
  task: Task | 'new';
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
  revision: number;
  admin: boolean;
  refresh: () => Promise<void>;
  registerDraft: (guard: DraftGuard | null) => void;
  favorite: boolean;
  toggleFavorite: () => Promise<void>;
  copyLink: () => Promise<void>;
  graph: TaskGraph;
}) {
  const initial = task === 'new' ? null : task;
  const [newTaskId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState(initial?.title ?? ''),
    [description, setDescription] = useState(initial?.description ?? ''),
    [project, setProject] = useState(initial?.projectId ?? (projectId || projects[0]?.id || '')),
    [status, setStatus] = useState<TaskStatus>(initial?.status ?? 'todo'),
    [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'none'),
    [due, setDue] = useState(initial?.dueDate ?? initialDueDate ?? ''),
    [start, setStart] = useState(initial?.startDate ?? ''),
    [recurrence, setRecurrence] = useState<Recurrence | ''>(initial?.recurrence ?? ''),
    [estimate, setEstimate] = useState(String(initial?.legacyMetadata.estimate ?? '')),
    [assignee, setAssignee] = useState(initial?.assigneeUserId ?? ''),
    [agent, setAgent] = useState(initial?.executorAgentId ?? ''),
    [deleteConfirm, setDeleteConfirm] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [conflict, setConflict] = useState(false),
    [subDirty, setSubDirty] = useState(false);
  const current = task === 'new' ? null : task,
    active = !!current?.reservation?.active && Date.parse(current.reservation.expiresAt) > Date.now();
  const version = current?.version;
  const [editVersion, setEditVersion] = useState(initial?.version);
  const saveButton = useRef<HTMLButtonElement>(null);
  const fingerprint = JSON.stringify([title, description, project, status, priority, due, assignee, start, recurrence, estimate]);
  const savedFingerprint = useRef(fingerprint);
  const dirty = fingerprint !== savedFingerprint.current;
  async function save() {
    if (subDirty) {
      setError(t('Salve a subtarefa antes de continuar.', 'Save subtask before continuing.'));
      return false;
    }
    if (conflict || busy) return false;
    if (!title.trim() || !project) {
      setError(t('Informe o título e o projeto antes de continuar.', 'Enter a title and project before continuing.'));
      return false;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await execute<Task>(
        current ? 'update_task' : 'create_task',
        {
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
        },
        current ? editVersion : undefined,
      );
      savedFingerprint.current = fingerprint;
      setEditVersion(saved.version);
      setConflict(false);
      registerDraft(null);
      if (!current) created(saved.id);
      return true;
    } catch (err) {
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
    registerDraft({ dirty: dirty || busy || subDirty, flush: save });
    return () => registerDraft(null);
  });
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirty || busy || subDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    addEventListener('beforeunload', before);
    return () => removeEventListener('beforeunload', before);
  }, [dirty, busy, subDirty]);
  useEffect(() => {
    if (!current || dirty || busy) return;
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
    if (busy) return;
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
      <SheetContent closeLabel={t('Fechar painel', 'Close panel')}>
        <div className="drawer-eyebrow">{current?.key ?? t('Nova tarefa', 'New task')}</div>
        <SheetTitle>{current ? t('Detalhes da tarefa', 'Task details') : t('Nova tarefa', 'New task')}</SheetTitle>
        <SheetDescription>
          {t('Organize a tarefa, acompanhe o agente e registre decisões.', 'Organize the task, supervise its agent and record decisions.')}
        </SheetDescription>
        <form
          onSubmit={e => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="form-field">
            {t('Título', 'Title')}
            <Input required maxLength={500} value={title} onChange={e => setTitle(e.target.value)} disabled={readOnly || busy || subDirty} />
          </label>
          <div className="drawer-fields">
            <label className="form-field">
              {t('Projeto', 'Project')}
              <select value={project} onChange={e => setProject(e.target.value)} disabled={!!current || readOnly || busy || subDirty} required>
                {projects.map(p => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              {t('Status', 'Status')}
              <select value={status} onChange={e => setStatus(e.target.value as TaskStatus)} disabled={readOnly || busy || subDirty}>
                {statuses
                  .filter(s => s !== 'done' || current?.status === 'done')
                  .map(s => (
                    <option key={s} value={s}>
                      {statusLabel(s, t)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-field">
              {t('Prioridade', 'Priority')}
              <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} disabled={readOnly || busy || subDirty}>
                {['none', 'low', 'medium', 'high', 'urgent'].map(p => (
                  <option key={p} value={p}>
                    {priorityLabel(p, t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              {t('Responsável', 'Assignee')}
              <select value={assignee} onChange={e => setAssignee(e.target.value)} disabled={readOnly || busy || subDirty}>
                <option value="">{t('Sem responsável', 'Unassigned')}</option>
                {members.map(member => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              {t('Prazo', 'Due date')}
              <Input type="date" value={due} onChange={e => setDue(e.target.value)} disabled={readOnly || busy || subDirty} />
            </label>
            <label className="form-field">
              {t('Início', 'Start date')}
              <Input type="date" value={start} onChange={e => setStart(e.target.value)} disabled={readOnly || busy || subDirty} />
            </label>
            <label className="form-field">
              {t('Recorrência', 'Recurrence')}
              <select
                aria-label={t('Recorrência', 'Recurrence')}
                value={recurrence}
                onChange={e => setRecurrence(e.target.value as Recurrence | '')}
                disabled={readOnly || busy || subDirty}
              >
                <option value="">{t('Nenhuma', 'None')}</option>
                {(['Daily', 'Weekly', 'Every 2 weeks', 'Monthly'] as const).map(r => (
                  <option key={r} value={r}>
                    {
                      {
                        Daily: t('Diária', 'Daily'),
                        Weekly: t('Semanal', 'Weekly'),
                        'Every 2 weeks': t('A cada 2 semanas', 'Every 2 weeks'),
                        Monthly: t('Mensal', 'Monthly'),
                      }[r]
                    }
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              {t('Estimativa', 'Estimate')}
              <Input value={estimate} maxLength={120} onChange={e => setEstimate(e.target.value)} disabled={readOnly || busy || subDirty} />
            </label>
          </div>
          <label className="form-field">
            {t('Descrição', 'Description')}
            <textarea
              aria-label={t('Descrição', 'Description')}
              value={description}
              maxLength={100000}
              onChange={e => setDescription(e.target.value)}
              disabled={readOnly || busy || subDirty}
            />
          </label>
          {description && (
            <div className="rich-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(description, { USE_PROFILES: { html: true } }) }} />
          )}
          <Button ref={saveButton} type="submit" disabled={busy || readOnly || conflict || !project}>
            {current ? t('Salvar alterações', 'Save changes') : t('Criar tarefa', 'Create task')}
          </Button>
        </form>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
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
        {current && (
          <>
            <TaskExecutionSection
              current={current}
              active={active}
              agent={agent}
              agents={agents}
              setAgent={setAgent}
              readOnly={readOnly}
              busy={busy}
              t={t}
              onAssign={() => taskAction('intervene_task', { action: 'reassign', executorAgentId: agent })}
              onResume={() => {
                if (requireSaved()) setConfirm(true);
              }}
              onComplete={() => taskAction('complete_task')}
            />
            <TaskCoreActions task={current} projects={projects} t={t} disabled={busy || readOnly || active} run={taskAction} />
            <div className="button-row">
              <Button variant="outline" disabled={busy} onClick={() => void action(toggleFavorite)}>
                {favorite ? t('Remover dos favoritos', 'Remove from favorites') : t('Adicionar aos favoritos', 'Add to favorites')}
              </Button>
              <Button variant="ghost" onClick={() => void action(copyLink)}>
                {t('Copiar link', 'Copy link')}
              </Button>
            </div>
            {details.error && (
              <p role="alert">
                {details.error}
                <Button variant="outline" onClick={details.retry}>
                  {t('Tentar novamente', 'Try again')}
                </Button>
              </p>
            )}
            <TaskRelationSection
              task={current}
              tasks={tasks}
              labels={details.labels}
              links={details.links}
              dependencies={details.dependencies}
              execute={execute}
              action={detailAction}
              disabled={busy || readOnly || active || details.loading || !!details.error}
              t={t}
              open={created}
            />
            <TaskSubtasksSection
              task={current}
              subtasks={details.subtasks}
              members={members}
              execute={execute}
              action={(run, parent) => detailAction(run, parent, true)}
              registerDirty={setSubDirty}
              canOpen={requireSaved}
              disabled={busy || readOnly || active || details.loading || !!details.error}
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
              disabled={busy || readOnly || active || details.loading || !!details.error}
              t={t}
            />
            <TaskDiscussionSection
              task={current}
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
              disabled={busy || readOnly || details.loading || !!details.error}
              t={t}
            />
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
                disabled={busy || readOnly || active}
                onClick={() => {
                  if (requireSaved()) setDeleteConfirm(true);
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
      </SheetContent>
    </Sheet>
  );
}
