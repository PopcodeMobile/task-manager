import { TaskExecutionSection } from './TaskExecutionSection';
import type { WorkspaceRepository } from '../../workspace/repository';
import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { MessageSquare, Plus, Unlink } from 'lucide-react';
import type { Task, Project, Comment, Subtask, TaskDependency, TaskStatus, TaskPriority } from '../../domain/contracts';
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
  revision,
  admin,
  refresh,
  registerDraft,
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
  revision: number;
  admin: boolean;
  refresh: () => Promise<void>;
  registerDraft: (guard: DraftGuard | null) => void;
}) {
  const initial = task === 'new' ? null : task;
  const [newTaskId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState(initial?.title ?? ''),
    [description, setDescription] = useState(initial?.description ?? ''),
    [project, setProject] = useState(initial?.projectId ?? (projectId || projects[0]?.id || '')),
    [status, setStatus] = useState<TaskStatus>(initial?.status ?? 'todo'),
    [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'none'),
    [due, setDue] = useState(initial?.dueDate ?? ''),
    [assignee, setAssignee] = useState(initial?.assigneeUserId ?? ''),
    [agent, setAgent] = useState(initial?.executorAgentId ?? ''),
    [comments, setComments] = useState<Comment[]>([]),
    [subtasks, setSubtasks] = useState<Subtask[]>([]),
    [dependencies, setDependencies] = useState<TaskDependency[]>([]),
    [incoming, setIncoming] = useState<TaskDependency[]>([]),
    [deleteConfirm, setDeleteConfirm] = useState(false),
    [comment, setComment] = useState(''),
    [subtask, setSubtask] = useState(''),
    [dependency, setDependency] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [conflict, setConflict] = useState(false);
  const current = task === 'new' ? null : task,
    active = !!current?.reservation?.active && Date.parse(current.reservation.expiresAt) > Date.now();
  const version = current?.version;
  const [editVersion, setEditVersion] = useState(initial?.version);
  const fingerprint = JSON.stringify([title, description, project, status, priority, due, assignee]);
  const savedFingerprint = useRef(fingerprint);
  const dirty = fingerprint !== savedFingerprint.current;
  async function save() {
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
    registerDraft({ dirty: dirty || busy, flush: save });
    return () => registerDraft(null);
  });
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    addEventListener('beforeunload', before);
    return () => removeEventListener('beforeunload', before);
  }, [dirty, busy]);
  useEffect(() => {
    if (!current || dirty || busy) return;
    setTitle(current.title);
    setDescription(current.description);
    setProject(current.projectId);
    setStatus(current.status);
    setPriority(current.priority);
    setDue(current.dueDate ?? '');
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
    ]);
  }, [current?.version, busy, dirty]);
  useEffect(() => {
    if (!current) return;
    let alive = true;
    Promise.all([
      repo.list<Comment>('list_comments', { taskId: current.id }, true),
      repo.list<Subtask>('list_subtasks', { taskId: current.id }, true),
      repo.list<TaskDependency>('list_dependencies', {}, true),
    ])
      .then(([c, s, d]) => {
        if (alive) {
          setComments(c);
          setSubtasks(s);
          setDependencies(d.filter(item => item.taskId === current.id));
          setIncoming(d.filter(item => item.dependsOnTaskId === current.id));
        }
      })
      .catch(err => {
        if (alive) setError(errorMessage(err, t));
      });
    return () => {
      alive = false;
    };
  }, [repo, current?.id, revision, t]);
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
            <Input required maxLength={500} value={title} onChange={e => setTitle(e.target.value)} disabled={readOnly || busy} />
          </label>
          <div className="drawer-fields">
            <label className="form-field">
              {t('Projeto', 'Project')}
              <select value={project} onChange={e => setProject(e.target.value)} disabled={!!current || readOnly || busy} required>
                {projects.map(p => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              {t('Status', 'Status')}
              <select value={status} onChange={e => setStatus(e.target.value as TaskStatus)} disabled={readOnly || busy}>
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
              <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} disabled={readOnly || busy}>
                {['none', 'low', 'medium', 'high', 'urgent'].map(p => (
                  <option key={p} value={p}>
                    {priorityLabel(p, t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              {t('Responsável', 'Assignee')}
              <select value={assignee} onChange={e => setAssignee(e.target.value)} disabled={readOnly || busy}>
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
              <Input type="date" value={due} onChange={e => setDue(e.target.value)} disabled={readOnly || busy} />
            </label>
          </div>
          <label className="form-field">
            {t('Descrição', 'Description')}
            <textarea value={description} maxLength={100000} onChange={e => setDescription(e.target.value)} disabled={readOnly || busy} />
          </label>
          {description && (
            <div className="rich-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(description, { USE_PROFILES: { html: true } }) }} />
          )}
          <Button type="submit" disabled={busy || readOnly || conflict || !project}>
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
              onAssign={() => void action(() => execute('intervene_task', { id: current.id, action: 'reassign', executorAgentId: agent }, version))}
              onResume={() => setConfirm(true)}
              onComplete={() => void action(() => execute('complete_task', { id: current.id }, version))}
            />
            <section className="drawer-section">
              <h3>{t('Subtarefas', 'Subtasks')}</h3>
              {subtasks.map(item => (
                <label className="subtask-row" key={item.id}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={busy || readOnly}
                    onChange={() => void action(() => execute('update_subtask', { id: item.id, taskId: current.id, done: !item.done }, version))}
                  />
                  <span>{item.title}</span>
                </label>
              ))}
              <form
                className="inline-form"
                onSubmit={e => {
                  e.preventDefault();
                  void action(async () => {
                    await execute('create_subtask', { taskId: current.id, title: subtask }, version);
                    setSubtask('');
                  });
                }}
              >
                <Input
                  aria-label={t('Nova subtarefa', 'New subtask')}
                  value={subtask}
                  onChange={e => setSubtask(e.target.value)}
                  required
                  maxLength={500}
                  disabled={readOnly || busy}
                />
                <Button variant="outline" type="submit" disabled={busy || readOnly}>
                  <Plus size={16} />
                  <span className="sr-only">{t('Adicionar subtarefa', 'Add subtask')}</span>
                </Button>
              </form>
            </section>
            <section className="drawer-section">
              <h3>{t('Dependências', 'Dependencies')}</h3>
              {incoming.length > 0 && (
                <div className="configuration-note">
                  <p>
                    {t(
                      'Outras tarefas dependem desta. Desvincule a dependência na tarefa relacionada antes de excluir.',
                      'Other tasks depend on this one. Unlink the dependency in the related task before deleting.',
                    )}
                  </p>
                  {incoming.map(item => (
                    <Button variant="ghost" key={item.taskId} onClick={() => created(item.taskId)}>
                      {tasks.find(x => x.id === item.taskId)?.title ?? item.taskId}
                    </Button>
                  ))}
                </div>
              )}
              {dependencies.map(item => (
                <div className="subtask-row" key={item.dependsOnTaskId}>
                  <span>{tasks.find(x => x.id === item.dependsOnTaskId)?.title ?? item.dependsOnTaskId}</span>
                  <Button
                    variant="ghost"
                    disabled={busy || readOnly}
                    aria-label={t('Desvincular dependência', 'Unlink dependency')}
                    onClick={() => void action(() => execute('remove_task_dependency', { id: current.id, dependsOnTaskId: item.dependsOnTaskId }, version))}
                  >
                    <Unlink size={15} />
                  </Button>
                </div>
              ))}
              <form
                className="inline-form"
                onSubmit={e => {
                  e.preventDefault();
                  void action(async () => {
                    await execute('set_task_dependency', { id: current.id, dependsOnTaskId: dependency }, version);
                    setDependency('');
                  });
                }}
              >
                <select
                  aria-label={t('Adicionar dependência', 'Add dependency')}
                  value={dependency}
                  onChange={e => setDependency(e.target.value)}
                  required
                  disabled={readOnly || busy}
                >
                  <option value="">{t('Selecionar tarefa', 'Select task')}</option>
                  {tasks
                    .filter(x => x.id !== current.id && !dependencies.some(d => d.dependsOnTaskId === x.id))
                    .map(x => (
                      <option key={x.id} value={x.id}>
                        {x.title}
                      </option>
                    ))}
                </select>
                <Button variant="outline" disabled={busy || readOnly} type="submit">
                  <Plus size={16} />
                  <span className="sr-only">{t('Vincular tarefa', 'Link task')}</span>
                </Button>
              </form>
            </section>
            <section className="drawer-section">
              <h3>
                <MessageSquare size={16} />
                {t('Comentários', 'Comments')}
              </h3>
              {comments.map(item => (
                <article className="comment" key={item.id}>
                  <strong>{members.find(m => m.user_id === item.authorUserId)?.name ?? t('Autor histórico', 'Historical author')}</strong>
                  <div className="rich-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.body, { USE_PROFILES: { html: true } }) }} />
                  {(admin || item.authorUserId === repo.userId) && (
                    <Button
                      variant="ghost"
                      disabled={busy || readOnly}
                      onClick={() => void action(() => execute('delete_comment', { id: item.id }, item.version))}
                    >
                      {t('Excluir comentário', 'Delete comment')}
                    </Button>
                  )}
                </article>
              ))}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  void action(async () => {
                    await execute('add_task_comment', { taskId: current.id, body: comment });
                    setComment('');
                  });
                }}
              >
                <label className="form-field">
                  {t('Comentário', 'Comment')}
                  <textarea required maxLength={20000} value={comment} onChange={e => setComment(e.target.value)} disabled={readOnly || busy} />
                </label>
                <Button type="submit" disabled={busy || readOnly}>
                  {t('Comentar', 'Post comment')}
                </Button>
              </form>
            </section>
            <section className="drawer-section">
              <Button variant="destructive" disabled={busy || readOnly || active} onClick={() => setDeleteConfirm(true)}>
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
                      disabled={!!incoming.length}
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
                          await execute('intervene_task', { id: current.id, action: 'release' }, version);
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
