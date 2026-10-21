import { useEffect, useRef, useState } from 'react';
import type { Json, SavedView } from '../../domain/contracts';
import type { Translate } from '../auth/ConsentPage';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Execute } from './ProjectsPage';
import type { DraftGuard } from '../tasks/TaskDrawer';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { projectError } from './ProjectEditor';
import { Info } from 'lucide-react';
export type ViewEdit = { projectId: string; view?: SavedView; filters: Json[]; type: string; opener: HTMLElement | null };
export function SavedViewEditor({
  edit,
  views,
  execute,
  repo,
  t,
  close,
  open,
  registerDraft,
  refresh,
}: {
  edit: ViewEdit;
  views: SavedView[];
  execute: Execute;
  repo: WorkspaceRepository;
  t: Translate;
  close: () => void;
  open: (id: string) => void;
  registerDraft: (draft: DraftGuard | null) => void;
  refresh: () => Promise<unknown>;
}) {
  const [name, setName] = useState(edit.view?.name ?? ''),
    [type, setType] = useState(edit.type),
    [base, setBase] = useState(edit.view),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [discard, setDiscard] = useState(false);
  const id = useRef(edit.view?.id ?? crypto.randomUUID()),
    trigger = useRef(edit.opener);
  const live = edit.view ? views.find(v => v.id === edit.view!.id) : undefined,
    conflict = !!edit.view && (!live || live.version !== base?.version),
    dirty = name !== (edit.view?.name ?? '') || type !== edit.type;
  useEffect(() => {
    registerDraft({
      dirty: dirty || busy,
      flush: async () => {
        setError(t('Salve ou descarte a visualização antes de sair.', 'Save or discard the view before leaving.'));
        return false;
      },
    });
    return () => registerDraft(null);
  }, [dirty, busy, registerDraft, t]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      await execute(
        edit.view ? 'update_view' : 'create_view',
        edit.view ? { id: id.current, name } : { id: id.current, projectId: edit.projectId, name, viewType: type, filters: edit.filters },
        base?.version,
      );
      if (!repo.controller.signal.aborted) {
        registerDraft(null);
        if (!edit.view) trigger.current = null;
        close();
        if (!edit.view) open(id.current);
      }
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
        if (!open && !busy) {
          if (dirty) setDiscard(true);
          else close();
        }
      }}
    >
      <SheetContent
        className="project-modal saved-view-modal"
        closeLabel={t('Fechar painel', 'Close panel')}
        onCloseAutoFocus={e => {
          e.preventDefault();
          if (!repo.controller.signal.aborted && trigger.current?.isConnected) trigger.current.focus();
        }}
      >
        <div className="modal-h">
          <SheetTitle>{edit.view ? t('Renomear visualização', 'Rename view') : t('Salvar visualização', 'Save view')}</SheetTitle>
        </div>
        <SheetDescription>{t('Salve os filtros atuais como uma aba deste projeto.', 'Save the current filters as a tab on this project.')}</SheetDescription>
        <form
          className="project-modal-form"
          onSubmit={e => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="modal-b">
            <label className="form-field">
              {t('Nome da visualização', 'View name')}
              <Input
                required
                maxLength={500}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('Ex.: Fila de revisão de design', 'e.g. Design review queue')}
              />
            </label>
            {!edit.view && (
              <label className="form-field">
                {t('Layout', 'Layout')}
                <select aria-label={t('Tipo de visualização', 'View type')} value={type} onChange={e => setType(e.target.value)}>
                  {['list', 'board', 'table'].map(type => (
                    <option key={type} value={type}>
                      {{ list: t('Lista', 'List'), board: t('Quadro', 'Board'), table: t('Tabela', 'Table') }[type]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!edit.view && (
              <div className="saved-filter-summary">
                {edit.filters.length ? (
                  <div className="row">
                    {edit.filters.map((filter, index) => (
                      <span className="badge" key={index}>
                        {filter && typeof filter === 'object' && !Array.isArray(filter)
                          ? `${String(filter.f ?? '')}: ${Array.isArray(filter.v) ? filter.v.join(', ') : ''}`
                          : String(filter)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="saved-view-no-filters">
                    <Info size={14} aria-hidden="true" />
                    <span>
                      {t(
                        'Nenhum filtro ativo. A visualização mostrará todas as tarefas. Você pode adicionar filtros depois de salvar.',
                        'No filters are active — the view will show all tasks. You can add filters after saving.',
                      )}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
          {conflict && (
            <div role="alert">
              <p>
                {live
                  ? t('A visualização mudou. O rascunho foi mantido.', 'The view changed. Your draft was kept.')
                  : t('A visualização foi removida. O rascunho foi mantido.', 'The view was removed. Your draft was kept.')}
              </p>
              {live && (
                <Button type="button" variant="outline" onClick={() => setBase(live)}>
                  {t('Usar versão atual e manter rascunho', 'Use current version and keep draft')}
                </Button>
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
          <div className="modal-f">
            <span className="sp" />
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (dirty) setDiscard(true);
                else close();
              }}
            >
              {t('Cancelar', 'Cancel')}
            </Button>
            <Button type="submit" disabled={busy || conflict || !name.trim()}>
              {t('Salvar visualização', 'Save view')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
