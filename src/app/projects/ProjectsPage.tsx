import { useState } from 'react';
import { FolderKanban, Plus } from 'lucide-react';
import type { Project } from '../../domain/contracts';
import type { Translate } from '../auth/ConsentPage';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { errorMessage } from '../shell/messages';
export type Execute = <T = unknown>(operation: string, input: Record<string, unknown>, version?: number) => Promise<T>;
export function ProjectsPage({
  projects,
  t,
  execute,
  openProject,
  readOnly,
}: {
  projects: Project[];
  t: Translate;
  execute: Execute;
  openProject: (id: string) => void;
  readOnly: boolean;
}) {
  const [edit, setEdit] = useState<Project | 'new' | null>(null),
    [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const begin = (project: Project | 'new') => {
    setName(project === 'new' ? '' : project.name);
    setDescription(project === 'new' ? '' : project.description);
    setEdit(project);
    setError('');
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{t('Projetos', 'Projects')}</h1>
          <p>{t('Organize o trabalho em um só lugar.', 'Organize your work in one place.')}</p>
        </div>
        <Button disabled={readOnly} onClick={() => begin('new')}>
          <Plus size={16} />
          {t('Novo projeto', 'New project')}
        </Button>
      </div>
      <div className="project-list">
        {projects.map(p => (
          <article className="project-row" key={p.id}>
            <span className="project-icon">
              <FolderKanban size={18} />
            </span>
            <button onClick={() => openProject(p.id)}>
              <strong>{p.name}</strong>
              <small>{p.key ?? t('Projeto', 'Project')}</small>
            </button>
            <span>
              {
                {
                  planning: t('Planejamento', 'Planning'),
                  active: t('Em andamento', 'In progress'),
                  risk: t('Em risco', 'At risk'),
                  hold: t('Em pausa', 'On hold'),
                  complete: t('Concluído', 'Complete'),
                }[p.status]
              }
            </span>
            <Button variant="ghost" disabled={readOnly} onClick={() => begin(p)}>
              {t('Editar', 'Edit')}
            </Button>
          </article>
        ))}
      </div>
      {!projects.length && <p className="work-empty">{t('Crie seu primeiro projeto para adicionar tarefas.', 'Create your first project to add tasks.')}</p>}
      <Sheet
        open={!!edit}
        onOpenChange={open => {
          if (!open) setEdit(null);
        }}
      >
        <SheetContent closeLabel={t('Fechar painel', 'Close panel')}>
          <SheetTitle>{edit === 'new' ? t('Novo projeto', 'New project') : t('Editar projeto', 'Edit project')}</SheetTitle>
          <SheetDescription>{t('Nome e descrição do projeto.', 'Project name and description.')}</SheetDescription>
          <form
            onSubmit={async e => {
              e.preventDefault();
              if (!edit) return;
              setBusy(true);
              setError('');
              try {
                await execute(
                  edit === 'new' ? 'create_project' : 'update_project',
                  { ...(edit === 'new' ? {} : { id: edit.id }), name, description },
                  edit === 'new' ? undefined : edit.version,
                );
                setEdit(null);
              } catch (err) {
                setError(errorMessage(err, t));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="form-field">
              {t('Nome', 'Name')}
              <Input required maxLength={500} value={name} onChange={e => setName(e.target.value)} />
            </label>
            <label className="form-field">
              {t('Descrição', 'Description')}
              <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={100000} />
            </label>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <Button disabled={busy} type="submit">
              {t('Salvar projeto', 'Save project')}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
