import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Task, Project, Json } from '../../domain/contracts';
import type { Translate } from '../auth/ConsentPage';
import type { Execute } from '../projects/ProjectsPage';
import { Button } from '../../components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel } from '../../components/ui/alert-dialog';
import { prepareTaskAction } from './task-view-model';
import { coreTaskLabels } from './TaskCoreActions';
import { errorMessage } from '../shell/messages';
/**6b2 may append real graph/favorite/copy-link items through this seam. */
export type ExtraTaskMenuAction = { id: string; label: string; disabled?: boolean; run: (task: Task) => void };
export function TaskContextMenu({
  task,
  projects,
  x,
  y,
  t,
  execute,
  readOnly,
  signal,
  close,
  open,
  extraActions = [],
}: {
  task: Task;
  projects: Project[];
  x: number;
  y: number;
  t: Translate;
  execute: Execute;
  readOnly: boolean;
  signal: AbortSignal;
  close: (restoreFocus?: boolean) => void;
  open: (id: string) => void;
  extraActions?: ExtraTaskMenuAction[];
}) {
  const menu = useRef<HTMLDivElement>(null),
    alive = useRef(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(false),
    [position, setPosition] = useState({ left: x, top: y });
  const active = !!task.reservation?.active && Date.parse(task.reservation.expiresAt) > Date.now(),
    locked = busy || readOnly || active,
    labels = coreTaskLabels(t);
  useLayoutEffect(() => {
    if (!confirm && menu.current) {
      const rect = menu.current.getBoundingClientRect();
      setPosition({ left: Math.max(0, Math.min(x, innerWidth - rect.width)), top: Math.max(0, Math.min(y, innerHeight - rect.height)) });
    }
  }, [x, y, confirm, error, projects.length]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!confirm) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [confirm]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!confirm && !menu.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
    };
  }, [close, confirm, busy]);
  function keyboard(event: KeyboardEvent) {
    const items = [...menu.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')],
      index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'Tab') {
      close();
      return;
    }
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % items.length
        : event.key === 'ArrowUp'
          ? (index - 1 + items.length) % items.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : null;
    if (next !== null) {
      event.preventDefault();
      event.stopPropagation();
      items[next]?.focus();
    }
  }
  async function run(operation: string, input: Record<string, Json> = {}, after?: 'open') {
    if (locked) return;
    setBusy(true);
    setError('');
    try {
      const command = prepareTaskAction(task, operation, input);
      const result = await execute<Task>(command.operation, command.input, command.expectedVersion);
      if (signal.aborted || !alive.current) return;
      close(after !== 'open');
      if (after === 'open') open(result.id);
    } catch (err) {
      if (alive.current && !signal.aborted) setError(errorMessage(err, t));
    } finally {
      if (alive.current && !signal.aborted) setBusy(false);
    }
  }
  function item(label: string, action: () => void, disabled = locked) {
    return (
      <Button
        role="menuitem"
        tabIndex={-1}
        variant="ghost"
        aria-disabled={disabled}
        onClick={() => {
          if (!disabled) action();
        }}
      >
        {label}
      </Button>
    );
  }
  return createPortal(
    <>
      {!confirm && (
        <div ref={menu} role="menu" aria-label={t('Ações da tarefa', 'Task actions')} className="task-context-menu" style={position} onKeyDown={keyboard}>
          {item(
            t('Abrir tarefa', 'Open task'),
            () => {
              close(false);
              open(task.id);
            },
            busy,
          )}
          {item(
            task.status === 'done' ? labels.reopen : labels.complete_task,
            () => void run(task.status === 'done' ? 'update_task' : 'complete_task', task.status === 'done' ? { status: 'todo' } : {}),
          )}
          {item(labels.duplicate_task, () => void run('duplicate_task', {}, 'open'))}
          <div role="separator" />
          <div role="group" aria-label={t('Mover para projeto', 'Move to project')}>
            {projects
              .filter(p => p.id !== task.projectId)
              .map(project => (
                <div key={project.id}>{item(t('Mover para: ', 'Move to: ') + project.name, () => void run('move_task', { projectId: project.id }))}</div>
              ))}
          </div>
          <div role="separator" />
          {item(task.archived ? labels.restore_task : labels.archive_task, () => void run(task.archived ? 'restore_task' : 'archive_task'))}
          {item(labels.delete_task, () => setConfirm(true))}
          {extraActions.map(action => (
            <div key={action.id}>
              {item(
                action.label,
                () => {
                  close(false);
                  action.run(task);
                },
                locked || !!action.disabled,
              )}
            </div>
          ))}
          {active && (
            <p className="permission-note">
              {t('Retome o controle humano nos detalhes antes de alterar esta tarefa.', 'Resume human control in task details before changing this task.')}
            </p>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </div>
      )}
      <AlertDialog
        open={confirm}
        onOpenChange={value => {
          if (!value && !busy) close();
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t('Excluir esta tarefa?', 'Delete this task?')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'A exclusão é permanente. Desvincule dependências e anexos nas tarefas que permanecerão no workspace.',
              'Deletion is permanent. Unlink dependencies and attachments in tasks remaining in the workspace.',
            )}
          </AlertDialogDescription>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <div className="button-row">
            <AlertDialogCancel asChild>
              <Button variant="outline" disabled={busy}>
                {t('Cancelar', 'Cancel')}
              </Button>
            </AlertDialogCancel>
            <Button variant="destructive" disabled={locked} onClick={() => void run('delete_task')}>
              {t('Confirmar exclusão', 'Confirm deletion')}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>,
    document.body,
  );
}
