import { useEffect, useRef, useState } from 'react';
import type { Project, BatchCommand, BatchResult } from '../../domain/contracts';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Snapshot } from '../shell/useWorkspaceData';
import type { Translate } from '../auth/ConsentPage';
import type { DraftGuard } from '../tasks/TaskDrawer';
import { ProjectIcon, type Execute } from './ProjectsPage';
import { PICONS, PCOLORS } from '../../core/constants.js';
import { Check } from 'lucide-react';
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
    [discard, setDiscard] = useState(false),
    [copyConflict, setCopyConflict] = useState(false);
  const committed = !!attempt.current?.result;
  const dirty = JSON.stringify(draft) !== initial.current;
  const live = source ? snapshot.projects.find(p => p.id === source.id) : undefined;
  const conflict = !committed && !!source && (!live || live.version !== base?.version);
  useEffect(() => {
    registerDraft({
      dirty: dirty || busy || committed || copyConflict,
      flush: async () => {
        setError(t('Salve ou descarte o rascunho do projeto antes de sair.', 'Save or discard the project draft before leaving.'));
        return false;
      },
    });
    return () => registerDraft(null);
  }, [dirty, busy, committed, copyConflict, registerDraft, t]);
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
    if (busy || conflict || copyConflict) return;
    setBusy(true);
    setError('');
    try {
      const signature = JSON.stringify([draft, base?.version]);
      if (!attempt.current?.result && attempt.current?.signature !== signature)
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
      if (edit.kind !== 'edit') openProject(draft.id, draft.template === 'blank' ? 'overview' : undefined);
    } catch (err) {
      if (!repo.controller.signal.aborted) {
        setError(projectError(err, t));
        const code = err instanceof Error && 'code' in err ? String(err.code) : '';
        // A definitive atomic rejection can be replanned. An ambiguous transport failure
        // retains the exact commands, and therefore the existing idempotency key.
        if (edit.kind === 'copy' && !attempt.current?.result && ['version_conflict', 'not_found'].includes(code)) setCopyConflict(true);
      }
    } finally {
      setBusy(false);
    }
  }
  const preview = { ...source, legacyMetadata: { ...source?.legacyMetadata, icon: draft.icon, color: draft.color } } as Project;
  return (
    <Sheet
      open
      onOpenChange={open => {
        if (!open) dismiss();
      }}
    >
      <SheetContent
        className="project-modal project-editor-modal"
        closeLabel={t('Fechar painel', 'Close panel')}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (!repo.controller.signal.aborted && opener.current?.isConnected) opener.current.focus();
        }}
      >
        <div className="modal-h">
          <SheetTitle>
            {edit.kind === 'new'
              ? t('Novo projeto', 'New project')
              : edit.kind === 'copy'
                ? t('Duplicar projeto', 'Duplicate project')
                : t('Editar projeto', 'Edit project')}
          </SheetTitle>
        </div>
        <SheetDescription className={edit.kind === 'edit' ? 'sr-only' : undefined}>
          {t('Projetos reúnem tarefas, arquivos e conversas de um trabalho.', 'Projects hold tasks, files, and conversations for one body of work.')}
        </SheetDescription>
        <form
          className="project-modal-form"
          onSubmit={e => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="project-editor-scroll">
            <fieldset disabled={busy || committed} className="project-form-fields modal-b">
              <div className="row project-name-row">
                <ProjectIcon project={preview} size={18} />
                <label className="form-field grow">
                  {t('Nome do projeto', 'Project name')}
                  <Input
                    aria-label={t('Nome', 'Name')}
                    required
                    maxLength={500}
                    value={draft.name}
                    onChange={e => patch({ name: e.target.value })}
                    placeholder={t('Ex.: Redesign do site', 'e.g. Website Redesign')}
                  />
                </label>
              </div>
              <label className="form-field">
                {t('Descrição', 'Description')}
                <textarea
                  rows={2}
                  maxLength={100000}
                  value={draft.description}
                  onChange={e => patch({ description: e.target.value })}
                  placeholder={t('Sobre o que é este projeto?', 'What is this project about?')}
                />
              </label>
              <div className="row project-choice-row">
                <div className="form-field grow">
                  <span>{t('Ícone', 'Icon')}</span>
                  <div className="iconpick" role="radiogroup" aria-label={t('Ícone', 'Icon')}>
                    {[...new Set([...PICONS, draft.icon])].map(icon => (
                      <Button
                        type="button"
                        role="radio"
                        aria-checked={draft.icon === icon}
                        variant="ghost"
                        className={draft.icon === icon ? 'on' : ''}
                        key={icon}
                        aria-label={icon}
                        onClick={() => patch({ icon })}
                      >
                        <ProjectIcon project={{ ...preview, legacyMetadata: { ...preview.legacyMetadata, icon } }} size={15} />
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="form-field">
                  <span>{t('Cor', 'Color')}</span>
                  <div className="swatches" role="radiogroup" aria-label={t('Cor', 'Color')}>
                    {Object.entries(PCOLORS).map(([color, value]) => (
                      <Button
                        type="button"
                        role="radio"
                        aria-checked={draft.color === color}
                        variant="ghost"
                        className={`sw ${draft.color === color ? 'on' : ''}`}
                        key={color}
                        aria-label={color}
                        style={{ '--c': value } as React.CSSProperties}
                        onClick={() => patch({ color })}
                      >
                        {draft.color === color && <Check size={12} />}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="row project-properties-row">
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
                  {t('Data prevista', 'Target date')}
                  <Input type="date" value={draft.dueDate ?? ''} onChange={e => patch({ dueDate: e.target.value })} />
                </label>
              </div>
              {edit.kind === 'new' && (
                <div className="form-field">
                  <span>{t('Modelo', 'Template')}</span>
                  <div className="tmpls" role="radiogroup" aria-label={t('Modelo', 'Template')}>
                    {projectTemplates.map(template => (
                      <Button
                        type="button"
                        role="radio"
                        aria-checked={draft.template === template.id}
                        className={`opt ${draft.template === template.id ? 'on' : ''}`}
                        variant="ghost"
                        key={template.id}
                        onClick={() => patch({ template: template.id, ...(draft.icon === 'folder' ? { icon: template.icon } : {}) })}
                      >
                        <ProjectIcon project={{ ...preview, legacyMetadata: { ...preview.legacyMetadata, icon: template.icon } }} size={16} />
                        <b>{t(template.name[0], template.name[1])}</b>
                        <span>
                          {template.tasks.length
                            ? `${template.tasks.length} ${t('tarefas iniciais', 'starter tasks')}`
                            : t('Comece do zero', 'Start from scratch')}
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
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
                        if (attempt.current?.result) return;
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
            {copyConflict && !committed && (
              <div role="status">
                <p>
                  {t(
                    'As tarefas de origem mudaram ou foram removidas. Revise a origem antes de tentar novamente.',
                    'Source tasks changed or were removed. Review the source before retrying.',
                  )}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void (async () => {
                      setBusy(true);
                      try {
                        if ((await refresh()) && !repo.controller.signal.aborted && !attempt.current?.result) {
                          attempt.current = undefined;
                          setCopyConflict(false);
                          setError('');
                        }
                      } catch (err) {
                        if (!repo.controller.signal.aborted) setError(projectError(err, t));
                      } finally {
                        setBusy(false);
                      }
                    })()
                  }
                >
                  {t('Revisar tarefas atuais e manter rascunho', 'Review current source tasks and keep draft')}
                </Button>
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
          </div>
          <div className="modal-f">
            <span className="sp" />
            <Button type="button" variant="outline" disabled={busy} onClick={dismiss}>
              {t('Cancelar', 'Cancel')}
            </Button>
            <Button type="submit" aria-label={t('Salvar projeto', 'Save project')} disabled={busy || conflict || copyConflict || !draft.name.trim()}>
              {edit.kind === 'edit'
                ? t('Salvar alterações', 'Save changes')
                : edit.kind === 'copy'
                  ? t('Duplicar projeto', 'Duplicate project')
                  : t('Criar projeto', 'Create project')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
