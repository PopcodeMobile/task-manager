import { Users, Code, Palette, Megaphone, Briefcase, Heart } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BatchCommand, Team } from '../../domain/contracts';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '../../components/ui/alert-dialog';
import { errorMessage } from '../shell/messages';
import { teamCommands, type TeamDraft } from './panel-model';
import type { PanelProps } from './types';
import { ContextHistory } from '../activity/ContextHistory';
function TeamMark({ team }: { team: Team }) {
  const Icon =
    ({ users: Users, code: Code, palette: Palette, megaphone: Megaphone, briefcase: Briefcase, heart: Heart } as Record<string, typeof Users>)[
      String(team.legacyMetadata.icon)
    ] ?? Users;
  return (
    <span className="team-mark" style={{ color: String(team.legacyMetadata.color ?? team.legacyMetadata.c ?? 'var(--accent)') }}>
      <Icon size={20} />
    </span>
  );
}
function Avatar({ name, color }: { name: string; color?: string }) {
  return (
    <span className="account-avatar" aria-hidden="true" style={{ background: color ?? 'var(--accent)' }}>
      {name
        .split(' ')
        .map(part => part[0])
        .slice(0, 2)
        .join('')}
    </span>
  );
}
export function PeoplePages(p: PanelProps) {
  const { snapshot: s, t } = p;
  const opener = useRef<HTMLElement | null>(null),
    originalTeam = useRef(false);
  const restore = (event: Event) => {
    event.preventDefault();
    if (opener.current?.isConnected) opener.current.focus();
    else document.querySelector<HTMLElement>('#work-content')?.focus();
  };
  const [query, setQuery] = useState(''),
    [role, setRole] = useState(''),
    [tab, setTab] = useState(p.params.get('tab') ?? 'members'),
    [edit, setEdit] = useState<TeamDraft | null>(null),
    [baseline, setBaseline] = useState({ teams: s.teams, relations: s.teamMembers }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<null | (() => Promise<unknown>)>(null),
    [invite, setInvite] = useState(false),
    [email, setEmail] = useState(''),
    [submission, setSubmission] = useState<BatchCommand[] | null>(null),
    [conflict, setConflict] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const removed = !!edit && originalTeam.current && !s.teams.some(team => team.id === edit.id);
  useEffect(() => {
    if (!edit) return;
    p.registerDraft({
      dirty: true,
      flush: async () => {
        setError(
          t(
            'Conclua ou feche o editor de equipe antes de sair. Um envio sem resposta precisa ser recuperado.',
            'Finish or close the team editor before leaving. A save with no response must be recovered.',
          ),
        );
        return false;
      },
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    addEventListener('beforeunload', beforeUnload);
    return () => {
      p.registerDraft(null);
      removeEventListener('beforeunload', beforeUnload);
    };
  }, [!!edit, p.registerDraft, t]);
  async function saveTeam() {
    if (!edit || conflict || busy || (removed && !submission)) return;
    await action(async () => {
      const commands = submission ?? teamCommands(edit, baseline.teams, baseline.relations);
      setSubmission(commands);
      try {
        await p.execute('batch', { commands });
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        if (code === 'version_conflict') {
          setConflict(true);
          setSubmission(null);
          await p.refresh();
        } else if (['validation_error', 'forbidden', 'not_found', 'rate_limited', 'storage'].includes(code)) setSubmission(null);
        throw error;
      }
      setSubmission(null);
      p.registerDraft(null);
      setEdit(null);
      p.go('team', { id: edit.id });
    });
  }
  async function reviewMemberships() {
    await action(async () => {
      const [teams, relations] = await Promise.all([
        p.repo.list<Team>('list_teams', {}, true),
        p.repo.list<{ teamId: string; userId: string }>('list_team_members', {}, true),
      ]);
      if (originalTeam.current && !teams.some(team => team.id === edit?.id)) throw { code: 'not_found' };
      setBaseline({ teams, relations });
      setConflict(false);
      setReviewed(true);
    });
  }
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  function editor(team?: Team) {
    opener.current = document.activeElement as HTMLElement;
    originalTeam.current = !!team;
    setSubmission(null);
    setConflict(false);
    setReviewed(false);
    setError('');
    setBaseline({ teams: s.teams, relations: s.teamMembers });
    setEdit({
      id: team?.id ?? crypto.randomUUID(),
      name: team?.name ?? '',
      description: team?.description ?? '',
      icon: String(team?.legacyMetadata.icon ?? 'users'),
      color: String(team?.legacyMetadata.color ?? team?.legacyMetadata.c ?? 'teal'),
      members: s.teamMembers.filter(r => r.teamId === team?.id).map(r => r.userId),
    });
  }
  const team = s.teams.find(team => team.id === p.params.get('id')),
    member = s.members.find(m => m.user_id === p.params.get('id'));
  const teamList = p.route === 'teams' || (p.route === 'members' && tab === 'teams');
  const members = s.members.filter(m => (m.name + ' ' + m.email).toLowerCase().includes(query.toLowerCase()) && (!role || m.role.toLowerCase() === role));
  const teamsUI = (
    <div className="panel-grid">
      {s.teams.map(team => (
        <article className="panel-card" key={team.id}>
          <button className="inline-link" onClick={() => p.go('team', { id: team.id })}>
            <TeamMark team={team} />
            <h2>{team.name}</h2>
          </button>
          <p>{team.description}</p>
          <p>
            {s.teamMembers.filter(r => r.teamId === team.id).length} {t('membros', 'members')} ·{' '}
            {s.projects.filter(project => project.teamId === team.id && !project.archived).length} {t('projetos', 'projects')}
          </p>
          <div>
            {s.teamMembers
              .filter(r => r.teamId === team.id)
              .map(r => (
                <Button key={r.userId} variant="ghost" onClick={() => p.go('member', { id: r.userId })}>
                  {s.members.find(m => m.user_id === r.userId)?.name ?? r.userId}
                </Button>
              ))}
          </div>
        </article>
      ))}
      {!s.teams.length && <p>{t('Nenhuma equipe. Crie a primeira equipe.', 'No teams. Create your first team.')}</p>}
    </div>
  );
  const missing = (p.route === 'team' && !team) || (p.route === 'member' && !member);
  const notFound = (
    <div>
      <p>{t('Página não encontrada', 'Page not found')}</p>
      <Button onClick={() => p.go('home')}>{t('Ir para início', 'Go to Home')}</Button>
    </div>
  );
  if (missing && !edit) return notFound;
  const assigned = member ? s.tasks.filter(task => !task.archived && task.assigneeUserId === member.user_id) : [];
  return (
    <section className="panel-page">
      {error && !edit && <p role="alert">{error}</p>}
      {p.route === 'members' && (
        <div className="button-row">
          {[
            ['members', t('Membros', 'Members')],
            ['teams', t('Equipes', 'Teams')],
            ['permissions', t('Permissões', 'Permissions')],
          ].map(([id, label]) => (
            <Button key={id} variant={tab === id ? 'default' : 'ghost'} onClick={() => setTab(id)}>
              {label}
            </Button>
          ))}
        </div>
      )}
      {(teamList || (p.route === 'team' && team)) && (
        <div className="button-row">
          <Button disabled={p.readOnly} onClick={() => editor(p.route === 'team' ? team : undefined)}>
            {p.route === 'team' ? t('Editar equipe', 'Edit team') : t('Criar equipe', 'Create team')}
          </Button>
        </div>
      )}
      {missing ? (
        notFound
      ) : teamList ? (
        teamsUI
      ) : p.route === 'team' && team ? (
        <>
          <TeamMark team={team} />
          <h2>{team.name}</h2>
          <p>{team.description}</p>
          <h3>{t('Membros', 'Members')}</h3>
          <div className="button-row">
            {s.teamMembers
              .filter(r => r.teamId === team.id)
              .map(r => (
                <Button key={r.userId} variant="outline" onClick={() => p.go('member', { id: r.userId })}>
                  {s.members.find(m => m.user_id === r.userId)?.name ?? r.userId}
                </Button>
              ))}
          </div>
          <h3>{t('Projetos', 'Projects')}</h3>
          {s.projects
            .filter(project => project.teamId === team.id && !project.archived)
            .map(project => (
              <Button key={project.id} variant="ghost" onClick={() => p.openProject(project.id)}>
                {project.name}
              </Button>
            ))}
          <Button
            variant="outline"
            onClick={() => {
              opener.current = document.activeElement as HTMLElement;
              setInvite(true);
            }}
          >
            {t('Convidar membro', 'Invite member')}
          </Button>
        </>
      ) : p.route === 'member' && member ? (
        <>
          <div className="button-row">
            <Avatar name={member.name} color={member.color} />
            <h2>{member.name}</h2>
          </div>
          <p>
            {member.title} {member.role}
          </p>
          <p>{member.email}</p>
          <p>
            {member.timezone} {member.status}
          </p>
          {s.teamMembers
            .filter(r => r.userId === member.user_id)
            .map(r => (
              <Button key={r.teamId} variant="ghost" onClick={() => p.go('team', { id: r.teamId })}>
                {s.teams.find(team => team.id === r.teamId)?.name}
              </Button>
            ))}
          <div className="button-row">
            <Button disabled={p.readOnly} onClick={() => p.createTask(member.user_id)}>
              {t('Atribuir tarefa', 'Assign task')}
            </Button>
            <Button variant="outline" onClick={() => void action(() => navigator.clipboard.writeText(member.email))}>
              {t('Copiar email', 'Copy email')}
            </Button>
          </div>
          <p>
            {assigned.length} {t('tarefas', 'tasks')} · {assigned.filter(task => task.status === 'done').length} {t('concluídas', 'completed')}
          </p>
          <div className="button-row">
            <Button onClick={() => setTab('assigned')}>{t('Atribuídas', 'Assigned')}</Button>
            <Button onClick={() => setTab('completed')}>{t('Concluídas', 'Completed')}</Button>
          </div>
          {assigned
            .filter(task => (task.status === 'done') === (tab === 'completed'))
            .map(task => (
              <div className="panel-row" key={task.id}>
                <button className="inline-link" onClick={() => p.openTask(task.id)}>
                  {task.title}
                </button>
              </div>
            ))}
          <h3>{t('Projetos', 'Projects')}</h3>
          {s.projects
            .filter(
              project =>
                !project.archived &&
                (s.projectMembers.some(r => r.projectId === project.id && r.userId === member.user_id) || assigned.some(task => task.projectId === project.id)),
            )
            .map(project => (
              <Button key={project.id} variant="ghost" onClick={() => p.openProject(project.id)}>
                {project.name}
              </Button>
            ))}
          <h3>{t('Atividade recente', 'Recent activity')}</h3>
          <ContextHistory key={member.user_id} snapshot={s} repo={p.repo} actorId={member.user_id} limit={8} openTask={p.openTask} t={t} />
        </>
      ) : tab === 'permissions' ? (
        <p className="configuration-note">
          {p.repo.mode === 'cloud'
            ? t('O gerenciamento de acesso não está disponível neste painel.', 'Access management is unavailable in this panel.')
            : t(
                'Demonstração local: administradores gerenciam o espaço; membros editam o trabalho; convidados consultam. Nenhum acesso remoto é concedido.',
                'Local demonstration: admins manage the workspace; members edit work; guests read. No remote access is granted.',
              )}
        </p>
      ) : (
        <>
          <div className="panel-toolbar">
            <label>
              {t('Buscar pessoas', 'Search people')}
              <Input value={query} onChange={e => setQuery(e.target.value)} />
            </label>
            <label>
              {t('Papel', 'Role')}
              <select value={role} onChange={e => setRole(e.target.value)}>
                <option value="">{t('Todos', 'All')}</option>
                {['owner', 'admin', 'member', 'guest'].map(v => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <Button
              onClick={() => {
                opener.current = document.activeElement as HTMLElement;
                setInvite(true);
              }}
            >
              {t('Convidar membro', 'Invite member')}
            </Button>
          </div>
          {members.map(m => (
            <article className="panel-row" key={m.user_id}>
              <div>
                <button className="inline-link" onClick={() => p.go('member', { id: m.user_id })}>
                  {m.name}
                </button>
                <p>
                  {m.email} · {m.role}
                </p>
              </div>
              <div className="button-row">
                <Button variant="ghost" disabled={p.readOnly} onClick={() => p.createTask(m.user_id)}>
                  {t('Atribuir tarefa', 'Assign task')}
                </Button>
                <Button variant="ghost" onClick={() => void action(() => navigator.clipboard.writeText(m.email))}>
                  {t('Copiar email', 'Copy email')}
                </Button>
                {p.repo.mode === 'local' && m.user_id !== s.actorId && (
                  <>
                    <label>
                      {t('Papel local', 'Local role')}
                      <select
                        disabled={busy}
                        value={m.role === 'admin' ? 'Admin' : m.role === 'guest' ? 'Guest' : 'Member'}
                        onChange={e => void action(() => p.execute('local_workspace_member', { action: 'role', userId: m.user_id, role: e.target.value }))}
                      >
                        {['Admin', 'Member', 'Guest'].map(r => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant="ghost"
                      onClick={() => setConfirm(() => () => p.execute('local_workspace_member', { action: 'remove', userId: m.user_id }))}
                    >
                      {t('Remover', 'Remove')}
                    </Button>
                    {m.status === 'Invited' && (
                      <Button variant="ghost" onClick={() => void action(() => p.execute('local_workspace_member', { action: 'resend', userId: m.user_id }))}>
                        {t('Reenviar convite local', 'Resend local invitation')}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
          {!members.length && <p>{t('Nenhuma pessoa encontrada.', 'No people found.')}</p>}
        </>
      )}
      <Sheet
        open={!!edit}
        onOpenChange={open => {
          if (!open && !busy && !submission && !removed) setEdit(null);
        }}
      >
        <SheetContent onCloseAutoFocus={restore} closeLabel={t('Fechar', 'Close')}>
          <SheetTitle>{t('Equipe', 'Team')}</SheetTitle>
          <SheetDescription>{t('Organize pessoas e projetos.', 'Organize people and projects.')}</SheetDescription>
          {edit && (
            <form
              onSubmit={e => {
                e.preventDefault();
                void saveTeam();
              }}
            >
              {removed && (
                <p role="alert">
                  {t(
                    'Esta equipe foi removida. Seu rascunho continua disponível abaixo. Descarte-o quando estiver pronto para sair.',
                    'This team was removed. Your draft is still available below. Discard it when you are ready to leave.',
                  )}
                </p>
              )}
              <fieldset disabled={busy || !!submission || conflict || removed}>
                <label className="form-field">
                  {t('Nome', 'Name')}
                  <Input required value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
                </label>
                <label className="form-field">
                  {t('Descrição', 'Description')}
                  <textarea value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} />
                </label>
                <label className="form-field">
                  {t('Ícone', 'Icon')}
                  <select value={edit.icon} onChange={e => setEdit({ ...edit, icon: e.target.value })}>
                    {['users', 'code', 'palette', 'megaphone', 'briefcase', 'heart'].map(v => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  {t('Cor', 'Color')}
                  <Input value={edit.color} onChange={e => setEdit({ ...edit, color: e.target.value })} />
                </label>
                <fieldset>
                  <legend>{t('Membros', 'Members')}</legend>
                  {s.members.map(m => (
                    <label className="panel-check" key={m.user_id}>
                      <input
                        type="checkbox"
                        checked={edit.members.includes(m.user_id)}
                        onChange={e =>
                          setEdit({ ...edit, members: e.target.checked ? [...edit.members, m.user_id] : edit.members.filter(id => id !== m.user_id) })
                        }
                      />
                      {m.name}
                    </label>
                  ))}
                </fieldset>
              </fieldset>
              {error && !removed && (
                <p role="alert">
                  {conflict
                    ? t(
                        'As relações da equipe mudaram. Seu rascunho foi mantido; revise as relações atuais antes de salvar.',
                        'Team memberships changed. Your draft was kept; review current memberships before saving.',
                      )
                    : error}
                </p>
              )}
              {conflict && !removed && (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void reviewMemberships()}>
                  {t('Revisar relações atuais e manter rascunho', 'Review current memberships and keep draft')}
                </Button>
              )}
              {submission && !busy && (
                <p role="status">
                  {t(
                    'A resposta do envio é incerta. Tente novamente para recuperar o mesmo envio antes de editar ou sair.',
                    'The save response is uncertain. Retry to recover the same submission before editing or leaving.',
                  )}
                </p>
              )}
              {reviewed && (
                <section aria-label={t('Relações atuais', 'Current memberships')}>
                  <h3>{t('Revise antes de salvar', 'Review before saving')}</h3>
                  {[...new Set([...edit.members, ...baseline.relations.filter(r => r.teamId === edit.id).map(r => r.userId)])].map(userId => (
                    <p key={userId}>
                      {s.members.find(m => m.user_id === userId)?.name ?? userId}:{' '}
                      {baseline.relations
                        .filter(r => r.userId === userId)
                        .map(r => baseline.teams.find(team => team.id === r.teamId)?.name ?? r.teamId)
                        .join(', ') || t('Sem equipe', 'No team')}
                    </p>
                  ))}
                </section>
              )}
              <div className="button-row">
                <Button disabled={busy || conflict || (removed && !submission)}>{t('Salvar equipe', 'Save team')}</Button>
                {removed && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !!submission}
                    onClick={() => {
                      p.registerDraft(null);
                      setEdit(null);
                      setError('');
                    }}
                  >
                    {t('Descartar rascunho da equipe', 'Discard team draft')}
                  </Button>
                )}
                {s.teams.some(team => team.id === edit.id) && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={busy || !!submission || conflict}
                    onClick={() =>
                      setConfirm(() => async () => {
                        await p.execute('delete_team', { id: edit.id }, baseline.teams.find(team => team.id === edit.id)!.version);
                        p.registerDraft(null);
                        setEdit(null);
                        p.go('teams');
                      })
                    }
                  >
                    {t('Excluir equipe', 'Delete team')}
                  </Button>
                )}
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
      <Sheet open={invite} onOpenChange={setInvite}>
        <SheetContent onCloseAutoFocus={restore} closeLabel={t('Fechar', 'Close')}>
          <SheetTitle>{t('Convidar membro', 'Invite member')}</SheetTitle>
          <SheetDescription>
            {p.repo.mode === 'local'
              ? t('Demonstração neste dispositivo. Nenhum email será enviado.', 'Demonstration on this device. No email will be sent.')
              : t('Convites e gerenciamento de acesso não estão disponíveis neste painel.', 'Invitations and access management are unavailable in this panel.')}
          </SheetDescription>
          {p.repo.mode === 'local' && (
            <form
              onSubmit={e => {
                e.preventDefault();
                void action(async () => {
                  await p.execute('local_workspace_member', { action: 'invite', email });
                  setInvite(false);
                  setEmail('');
                });
              }}
            >
              <label className="form-field">
                Email
                <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} />
              </label>
              {error && !edit && <p role="alert">{error}</p>}
              <Button disabled={busy}>{t('Criar convite local', 'Create local invitation')}</Button>
            </form>
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={!!confirm}
        onOpenChange={open => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t('Confirmar exclusão?', 'Confirm deletion?')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'As relações serão removidas. Pessoas e projetos de uma equipe não são excluídos.',
              'Relations will be removed. Team people and projects are not deleted.',
            )}
          </AlertDialogDescription>
          <div className="button-row">
            <AlertDialogCancel asChild>
              <Button variant="outline">{t('Cancelar', 'Cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirm) void action(confirm);
                }}
              >
                {t('Confirmar', 'Confirm')}
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
