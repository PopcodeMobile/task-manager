import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Task, Subtask } from '../../domain/contracts';
import type { Member } from '../../workspace/normalized';
import type { Translate } from '../auth/ConsentPage';
import type { Execute } from '../projects/ProjectsPage';
import type { DetailAction } from './TaskRelationSection';
import { promoteSubtask } from './task-detail-model';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
export function TaskSubtasksSection({
  task,
  subtasks,
  members,
  action,
  execute,
  disabled,
  t,
  open,
  registerDirty,
  canOpen,
}: {
  task: Task;
  subtasks: Subtask[];
  members: Member[];
  action: DetailAction;
  execute: Execute;
  disabled: boolean;
  t: Translate;
  open: (id: string) => void;
  registerDirty: (dirty: boolean) => void;
  canOpen: () => boolean;
}) {
  const [title, setTitle] = useState(''),
    [id, setId] = useState(() => crypto.randomUUID()),
    [selected, select] = useState<Subtask | null>(null),
    [editing, setEditing] = useState(false);
  useEffect(() => {
    registerDirty(editing);
    return () => registerDirty(false);
  }, [editing, registerDirty]);
  // The live collection can remove a row while its editor still owns an unsaved draft.
  const live = subtasks.find(s => s.id === selected?.id);
  const current = live ?? selected;
  const removed = !!selected && !live;
  return (
    <section className="drawer-section task-subtasks-section">
      <h3>{t('Subtarefas', 'Subtasks')}</h3>
      {subtasks.map(s => (
        <div key={s.id} className="subtask-row">
          <input
            type="checkbox"
            aria-label={t('Concluir subtarefa: ', 'Complete subtask: ') + s.title}
            checked={s.done}
            disabled={disabled || editing}
            onChange={() => void action(() => execute('update_subtask', { taskId: task.id, id: s.id, done: !s.done }, task.version), true)}
          />
          <Button
            variant="ghost"
            aria-label={t('Detalhes da subtarefa: ', 'Subtask details: ') + s.title}
            disabled={editing}
            onClick={() => {
              if (canOpen()) select(s);
            }}
          >
            {s.title}
          </Button>
        </div>
      ))}
      <form
        className="inline-form task-subtask-add"
        onSubmit={e => {
          e.preventDefault();
          void action(async () => {
            await execute('create_subtask', { id, taskId: task.id, title }, task.version);
            setTitle('');
            setId(crypto.randomUUID());
          }, true);
        }}
      >
        <Input
          aria-label={t('Nova subtarefa', 'New subtask')}
          placeholder={t('Adicionar uma subtarefa', 'Add a subtask')}
          required
          maxLength={500}
          value={title}
          onChange={e => setTitle(e.target.value)}
          disabled={disabled || editing}
        />
        <Button type="submit" variant="ghost" aria-label={t('Adicionar subtarefa', 'Add subtask')} disabled={disabled || editing}>
          <Plus size={14} />
        </Button>
      </form>
      {current && (
        <SubtaskEditor
          key={current.id}
          task={task}
          subtask={current}
          removed={removed}
          members={members}
          action={action}
          execute={execute}
          disabled={disabled}
          t={t}
          open={open}
          close={() => select(null)}
          registerDirty={setEditing}
          previous={subtasks.findIndex(s => s.id === current.id) > 0 ? () => select(subtasks[subtasks.findIndex(s => s.id === current.id) - 1]) : undefined}
          next={
            subtasks.findIndex(s => s.id === current.id) < subtasks.length - 1
              ? () => select(subtasks[subtasks.findIndex(s => s.id === current.id) + 1])
              : undefined
          }
        />
      )}
    </section>
  );
}
function SubtaskEditor({
  task,
  subtask,
  removed,
  members,
  action,
  execute,
  disabled,
  t,
  open,
  close,
  registerDirty,
  previous,
  next,
}: {
  task: Task;
  subtask: Subtask;
  removed: boolean;
  members: Member[];
  action: DetailAction;
  execute: Execute;
  disabled: boolean;
  t: Translate;
  open: (id: string) => void;
  close: () => void;
  registerDirty: (dirty: boolean) => void;
  previous?: () => void;
  next?: () => void;
}) {
  const [title, setTitle] = useState(subtask.title),
    [due, setDue] = useState(String(subtask.legacyMetadata.due ?? '')),
    [note, setNote] = useState(String(subtask.legacyMetadata.note ?? '')),
    [assignee, setAssignee] = useState(String(subtask.legacyMetadata.assignee ?? ''));
  const target = useRef(crypto.randomUUID());
  const [editVersion, setEditVersion] = useState(task.version),
    [rowVersion, setRowVersion] = useState(subtask.version);
  const fingerprint = JSON.stringify([title, due, note, assignee]);
  const saved = useRef(fingerprint);
  const dirty = fingerprint !== saved.current;
  useEffect(() => {
    registerDirty(dirty || removed);
    return () => registerDirty(false);
  }, [dirty, removed, registerDirty]);
  function reload() {
    setTitle(subtask.title);
    setDue(String(subtask.legacyMetadata.due ?? ''));
    setNote(String(subtask.legacyMetadata.note ?? ''));
    setAssignee(String(subtask.legacyMetadata.assignee ?? ''));
    saved.current = JSON.stringify([
      subtask.title,
      String(subtask.legacyMetadata.due ?? ''),
      String(subtask.legacyMetadata.note ?? ''),
      String(subtask.legacyMetadata.assignee ?? ''),
    ]);
    setEditVersion(task.version);
    setRowVersion(subtask.version);
  }
  useEffect(() => {
    if (!dirty && !removed && !disabled && subtask.version >= rowVersion) reload();
  }, [task.version, subtask.version, disabled, dirty, removed]);
  return (
    <div className="subtask-editor">
      <h4>{t('Detalhes da subtarefa', 'Subtask details')}</h4>
      {removed && (
        <p role="alert">
          {t(
            'Esta subtarefa foi excluída em outro lugar. Seu rascunho foi mantido. Copie o que precisar e descarte o rascunho para continuar.',
            'This subtask was deleted elsewhere. Your draft was kept. Copy anything you need, then discard the draft to continue.',
          )}
        </p>
      )}
      <form
        onSubmit={e => {
          e.preventDefault();
          if (removed) return;
          void action(async () => {
            const result = await execute<Subtask>(
              'update_subtask',
              { taskId: task.id, id: subtask.id, title, attributes: { due: due || null, note, assignee: assignee || null } },
              editVersion,
            );
            saved.current = fingerprint;
            setRowVersion(result.version);
            setEditVersion(editVersion + 1);
          }, true);
        }}
      >
        <label className="form-field">
          {t('Título da subtarefa', 'Subtask title')}
          <Input value={title} onChange={e => setTitle(e.target.value)} required maxLength={500} disabled={disabled} />
        </label>
        <label className="form-field">
          {t('Responsável da subtarefa', 'Subtask assignee')}
          <select disabled={disabled} value={assignee} onChange={e => setAssignee(e.target.value)}>
            <option value="">{t('Sem responsável', 'Unassigned')}</option>
            {members.map(m => (
              <option key={m.user_id} value={m.user_id}>
                {m.name}
              </option>
            ))}
            {assignee && !members.some(m => m.user_id === assignee) && <option value={assignee}>{assignee}</option>}
          </select>
        </label>
        <label className="form-field">
          {t('Prazo da subtarefa', 'Subtask due date')}
          <Input type="date" value={due} onChange={e => setDue(e.target.value)} disabled={disabled} />
        </label>
        <label className="form-field">
          {t('Notas da subtarefa', 'Subtask notes')}
          <textarea
            aria-label={t('Notas da subtarefa', 'Subtask notes')}
            value={note}
            maxLength={20000}
            onChange={e => setNote(e.target.value)}
            disabled={disabled}
          />
        </label>
        <Button type="submit" disabled={disabled || removed}>
          {t('Salvar subtarefa', 'Save subtask')}
        </Button>
      </form>
      {dirty && !removed && <p>{t('Salve os detalhes antes de converter ou excluir.', 'Save details before converting or deleting.')}</p>}
      {(dirty || removed) && (
        <Button variant="outline" disabled={disabled} onClick={removed ? close : reload}>
          {t('Descartar rascunho da subtarefa', 'Discard subtask draft')}
        </Button>
      )}
      <div className="button-row">
        <Button variant="ghost" disabled={!previous || dirty || removed || disabled} onClick={previous}>
          {t('Subtarefa anterior', 'Previous subtask')}
        </Button>
        <Button variant="ghost" disabled={!next || dirty || removed || disabled} onClick={next}>
          {t('Próxima subtarefa', 'Next subtask')}
        </Button>
        <Button
          variant="outline"
          disabled={disabled || dirty || removed}
          onClick={() =>
            void action(async () => {
              await execute('batch', {
                commands: promoteSubtask(
                  task,
                  subtask,
                  target.current,
                  members.map(m => m.user_id),
                ),
              });
              open(target.current);
            }, true)
          }
        >
          {t('Converter em tarefa', 'Convert to task')}
        </Button>
        <Button
          variant="destructive"
          disabled={disabled || dirty || removed}
          onClick={() =>
            void action(async () => {
              await execute('delete_subtask', { id: subtask.id, taskId: task.id }, task.version);
              close();
            }, true)
          }
        >
          {t('Excluir subtarefa', 'Delete subtask')}
        </Button>
        <Button variant="ghost" disabled={dirty || removed || disabled} onClick={close}>
          {t('Voltar à tarefa', 'Back to task')}
        </Button>
      </div>
    </div>
  );
}
