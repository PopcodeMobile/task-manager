import { useEffect, useRef, useState } from 'react';
import type { Project, BatchCommand, BatchResult } from '../../domain/contracts';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Snapshot } from '../shell/useWorkspaceData';
import type { Translate } from '../auth/ConsentPage';
import type { DraftGuard } from '../tasks/TaskDrawer';
import type { Execute } from './ProjectsPage';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { iso, addD } from '../../core/calendar.js';
import { errorMessage } from '../shell/messages';
import { editProjectPlan, projectPlan, projectTemplates, type ProjectDraft } from './project-model';
export type ProjectEdit = { kind: 'new' | 'edit' | 'copy'; project?: Project; opener: HTMLElement | null };
export function projectError(error: unknown, t: Translate) {
  const code = error instanceof Error ? ('code' in error ? String(error.code) : error.message) : '';
  if (code === 'batch_limit' || code === 'payload_limit')
    return t(
      'A operação excede o limite atômico de 100 alterações ou 256 KiB. Nada foi alterado.',
      'The operation exceeds the atomic limit of 100 changes or 256 KiB. Nothing was changed.',
    );
  if (code === 'version_conflict')
    return t(
      'O item mudou. Seu rascunho foi mantido. Confira a versão atual antes de tentar novamente.',
      'The item changed. Your draft was kept. Review the current version before retrying.',
    );
  return errorMessage(error, t);
}
export function ProjectEditor({
  edit,
  snapshot,
  repo,
  execute,
  t,
  close,
  openProject,
  registerDraft,
  copyFavorites,
  refresh,
}: {
  edit: ProjectEdit;
  snapshot: Snapshot;
  repo: WorkspaceRepository;
  execute: Execute;
  t: Translate;
  close: () => void;
  openProject: (id: string, tab?: string) => void;
  registerDraft: (guard: DraftGuard | null) => void;
  copyFavorites: (ids: string[]) => Promise<void>;
  refresh: () => Promise<unknown>;
}) {
  const source = edit.project;
  const [base, setBase] = useState(source);
  const [draft, setDraft] = useState<ProjectDraft>(() => ({
    id: edit.kind === 'edit' ? source!.id : crypto.randomUUID(),
    name: source ? source.name + (edit.kind === 'copy' ? ' copy' : '') : '',
    description: source?.description ?? '',
    icon: String(source?.legacyMetadata.icon ?? 'folder'),
    color: String(source?.legacyMetadata.color ?? 'indigo'),
    teamId: source ? source.teamId : snapshot.teams.some(team => team.id === snapshot.actorTeamId) ? snapshot.actorTeamId : null,
    leadUserId: source ? source.leadUserId : snapshot.actorId,
    dueDate: source ? source.dueDate : iso(addD(new Date(), 30)),
    template: 'blank',
  }));
  const initial = useRef(JSON.stringify(draft)),
    opener = useRef(edit.opener),
    attempt = useRef<{ signature: string; commands: BatchCommand[]; result?: BatchResult } | undefined>(undefined);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [discard, setDiscard] = useState(false);
  const committed = !!attempt.current?.result;
  const dirty = JSON.stringify(draft) !== initial.current;
  const live = source ? snapshot.projects.find(p => p.id === source.id) : undefined;
  const conflict = !!source && (!live || live.version !== base?.version);
  useEffect(() => {
    registerDraft({
      dirty: dirty || busy || committed,
      flush: async () => {
        setError(t('Salve ou descarte o rascunho do projeto antes de sair.', 'Save or discard the project draft before leaving.'));
        return false;
      },
    });
    return () => registerDraft(null);
  }, [dirty, busy, committed, registerDraft, t]);
  const patch = (next: Partial<ProjectDraft>) => setDraft(old => ({ ...old, ...next }));
  function dismiss() {
    if (busy || committed) return;
    if (dirty) {
      setDiscard(true);
      return;
    }
    registerDraft(null);
    close();
  }
  async function save() {
    if (busy || conflict) return;
    setBusy(true);
    setError('');
    try {
      const signature = JSON.stringify([draft, base?.version]);
      if (attempt.current?.signature !== signature)
        attempt.current = {
          signature,
          commands:
            edit.kind === 'edit'
              ? editProjectPlan(
                  draft,
                  base!,
                  snapshot.projectMembers.filter(m => m.projectId === base!.id).map(m => m.userId),
                )
              : projectPlan(draft, snapshot.projects, snapshot.actorId, snapshot.tasks, edit.kind === 'copy' ? base : undefined, undefined, t),
        };
      const current = attempt.current;
      if (!current.result) current.result = await execute<BatchResult>('batch', { commands: current.commands });
      if (edit.kind === 'copy') {
        const preferences = await repo.preferences();
        const favorites = current.commands.flatMap((c, i) =>
          c.operation === 'duplicate_task_graph' && preferences.favoriteTaskIds.includes(String(c.input.id))
            ? [String((current.result!.results[i].data as { id: string }).id)]
            : [],
        );
        if (favorites.length) await copyFavorites(favorites);
      }
      if (repo.controller.signal.aborted) return;
      initial.current = JSON.stringify(draft);
      registerDraft(null);
      if (edit.kind !== 'edit') opener.current = null;
      close();
      if (edit.kind !== 'edit') openProject(draft.id, draft.template === 'blank' ? 'overview' : 'board');
    } catch (err) {
      if (!repo.controller.signal.aborted) setError(projectError(err, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onOpenChange={open => {
        if (!open) dismiss();
      }}
    >
      <SheetContent
        closeLabel={t('Fechar painel', 'Close panel')}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (!repo.controller.signal.aborted && opener.current?.isConnected) opener.current.focus();
        }}
      >
        <SheetTitle>
          {edit.kind === 'new'
            ? t('Novo projeto', 'New project')
            : edit.kind === 'copy'
              ? t('Duplicar projeto', 'Duplicate project')
              : t('Editar projeto', 'Edit project')}
        </SheetTitle>
        <SheetDescription>{t('Detalhes, responsável e modelo do projeto.', 'Project details, lead and template.')}</SheetDescription>
        <form
          onSubmit={e => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy || committed} className="project-form-fields">
            <label className="form-field">
              {t('Nome', 'Name')}
              <Input required maxLength={500} value={draft.name} onChange={e => patch({ name: e.target.value })} />
            </label>
            <label className="form-field">
              {t('Descrição', 'Description')}
              <textarea maxLength={100000} value={draft.description} onChange={e => patch({ description: e.target.value })} />
            </label>
            <div className="project-form-grid">
              <label className="form-field">
                {t('Ícone', 'Icon')}
                <select value={draft.icon} onChange={e => patch({ icon: e.target.value })}>
                  {[...new Set(['folder', 'target', 'globe', 'megaphone', 'palette', 'code', 'heart', 'rocket', 'briefcase', 'layers', draft.icon])].map(
                    icon => (
                      <option key={icon}>{icon}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="form-field">
                {t('Cor', 'Color')}
                <select value={draft.color} onChange={e => patch({ color: e.target.value })}>
                  {[...new Set(['indigo', 'blue', 'violet', 'teal', 'rose', 'amber', 'green', 'slate', draft.color])].map(color => (
                    <option key={color}>{color}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="form-field">
              {t('Equipe', 'Team')}
              <select value={draft.teamId ?? ''} onChange={e => patch({ teamId: e.target.value || null })}>
                <option value="">{t('Sem equipe', 'No team')}</option>
                {snapshot.teams.map(team => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              {t('Líder', 'Lead')}
              <select value={draft.leadUserId ?? ''} onChange={e => patch({ leadUserId: e.target.value || null })}>
                <option value="">{t('Sem líder', 'No lead')}</option>
                {snapshot.members.map(member => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              {t('Prazo', 'Due date')}
              <Input type="date" value={draft.dueDate ?? ''} onChange={e => patch({ dueDate: e.target.value })} />
            </label>
            {edit.kind === 'new' && (
              <label className="form-field">
                {t('Modelo', 'Template')}
                <select
                  value={draft.template}
                  onChange={e =>
                    patch({
                      template: e.target.value,
                      ...(draft.icon === 'folder' ? { icon: projectTemplates.find(x => x.id === e.target.value)?.icon ?? 'folder' } : {}),
                    })
                  }
                >
                  {projectTemplates.map(template => (
                    <option key={template.id} value={template.id}>
                      {t(template.name[0], template.name[1])}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </fieldset>
          {committed && (
            <p role="status">
              {t(
                'O projeto foi criado. Tente salvar os favoritos pessoais novamente para concluir.',
                'The project was created. Retry saving personal favorites to finish.',
              )}
            </p>
          )}
          {conflict && (
            <div role="alert">
              <p>
                {live
                  ? t('O projeto mudou. O rascunho foi mantido.', 'The project changed. Your draft was kept.')
                  : t('O projeto foi removido. O rascunho foi mantido para consulta.', 'The project was removed. Your draft was kept for reference.')}
              </p>
              {live && (
                <>
                  <p>
                    {live.name} · {projectError({ code: 'version_conflict' }, t)}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setBase(live);
                      attempt.current = undefined;
                    }}
                  >
                    {t('Usar versão atual e manter rascunho', 'Use current version and keep draft')}
                  </Button>
                </>
              )}
            </div>
          )}
          {error && (
            <Button type="button" variant="outline" onClick={() => void refresh()}>
              {t('Consultar versão atual', 'Check current version')}
            </Button>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          {discard && (
            <div role="alert">
              <p>{t('Descartar alterações do projeto?', 'Discard project changes?')}</p>
              <Button type="button" variant="outline" onClick={() => setDiscard(false)}>
                {t('Continuar editando', 'Keep editing')}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  registerDraft(null);
                  close();
                }}
              >
                {t('Descartar rascunho', 'Discard draft')}
              </Button>
            </div>
          )}
          <Button type="submit" disabled={busy || conflict || !draft.name.trim()}>
            {t('Salvar projeto', 'Save project')}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
