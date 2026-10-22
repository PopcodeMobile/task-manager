import {
  Users,
  Code,
  Palette,
  Megaphone,
  Briefcase,
  Heart,
  MoreHorizontal,
  Search,
  Crown,
  Mail,
  MapPin,
  Clock,
  Copy,
  Plus,
  Pencil,
  Check,
  Globe,
  Rocket,
  Layers,
  Smartphone,
  Target,
  Component,
  Building2,
  Folder,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
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
import { PersonAvatar, MiniTasks, ProjectMark, ProjectState, ProgressBar } from './PanelVisual';
import { radioKeys } from './choice-navigation';
import { PermissionMatrix } from './PermissionMatrix';
import { CloudInvitations } from './CloudInvitations';
import { ContextHistory } from '../activity/ContextHistory';
const teamIcons = {
  users: Users,
  code: Code,
  palette: Palette,
  megaphone: Megaphone,
  briefcase: Briefcase,
  heart: Heart,
  globe: Globe,
  rocket: Rocket,
  layers: Layers,
  smartphone: Smartphone,
  target: Target,
  component: Component,
  'building-2': Building2,
};
const teamColors = ['indigo', 'blue', 'violet', 'teal', 'rose', 'amber', 'green', 'slate'];
const teamIcon = (name: string) => (Object.hasOwn(teamIcons, name) ? teamIcons[name as keyof typeof teamIcons] : Users);
const colorToken = (color: string) =>
  teamColors.includes(color) ? `var(--${color === 'indigo' ? 'accent-indigo' : color === 'slate' ? 'gray' : color})` : color;
function TeamMark({ team, size = 20 }: { team: Team; size?: number }) {
  const Icon = teamIcon(String(team.legacyMetadata.icon));
  return (
    <span
      className={'team-mark' + (size === 13 ? ' team-mark-inline' : '')}
      style={{ color: colorToken(String(team.legacyMetadata.color ?? team.legacyMetadata.c ?? 'var(--accent)')) }}
    >
      <Icon size={size} />
    </span>
  );
}
export function PeoplePages(p: PanelProps & { embedded?: boolean }) {
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
    <div className="pgrid">
      {s.teams.map(team => {
        const links = s.teamMembers.filter(link => link.teamId === team.id);
        const projects = s.projects.filter(project => project.teamId === team.id && !project.archived);
        return (
          <article className="pcard team-card" key={team.id}>
            <button className="row team-card-title" onClick={() => p.go('team', { id: team.id })}>
              <TeamMark team={team} size={15} />
              <b>{team.name}</b>
            </button>
            <div className="desc">{team.description}</div>
            <div className="foot">
              <span className="row">
                <Users size={12} />
                {links.length} {t('membros', 'members')}
              </span>
              <span className="row">
                <Folder size={12} />
                {projects.length} {t('projetos', 'projects')}
              </span>
              <span className="sp" />
              <span className="avs">
                {links.slice(0, 4).map(link => (
                  <button
                    key={link.userId}
                    onClick={() => p.go('member', { id: link.userId })}
                    aria-label={s.members.find(member => member.user_id === link.userId)?.name}
                  >
                    <PersonAvatar member={s.members.find(member => member.user_id === link.userId)} />
                  </button>
                ))}
              </span>
            </div>
          </article>
        );
      })}
      {!s.teams.length && (
        <div className="panel empty-state">
          <div className="glyph">
            <Users size={20} />
          </div>
          <h2 className="es-h">{t('Nenhuma equipe. Crie a primeira equipe.', 'No teams. Create your first team.')}</h2>
        </div>
      )}
    </div>
  );
  const missing = (p.route === 'team' && !team) || (p.route === 'member' && !member);
  const notFound = (
    <div className="fullstate">
      <div className="box">
        <h1>{t('Página não encontrada', 'Page not found')}</h1>
        <Button onClick={() => p.go('home')}>{t('Ir para início', 'Go to Home')}</Button>
      </div>
    </div>
  );
  if (missing && !edit) return notFound;
  const assigned = member
    ? s.tasks.filter(task => !task.archived && task.assigneeUserId === member.user_id).sort((a, b) => (a.dueDate ?? 'z').localeCompare(b.dueDate ?? 'z'))
    : [];
  return (
    <section className={p.embedded ? 'embedded-people people-page' : 'page people-page' + (p.route === 'members' ? ' wide' : '')}>
      {error && !edit && <p role="alert">{error}</p>}
      {!p.embedded && (p.route === 'members' || p.route === 'teams') && (
        <div className="ph">
          <div>
            <h1>{p.route === 'members' ? t('Membros', 'Members') : t('Equipes', 'Teams')}</h1>
            <p>
              {p.route === 'members'
                ? `${s.members.length} ${t('pessoas em', 'people in')} ${p.workspace.name} · ${s.members.filter(member => member.status?.toLowerCase() === 'invited').length} ${t('pendentes', 'pending')}`
                : t('Grupos de pessoas que trabalham juntas nos projetos.', 'Groups of people who work on projects together.')}
            </p>
          </div>
          {(p.route === 'members' || p.route === 'teams') && (
            <div className="acts">
              {p.route === 'teams' && (
                <Button disabled={p.readOnly} onClick={() => editor()}>
                  <Plus size={14} />
                  {t('Criar equipe', 'Create team')}
                </Button>
              )}
              {p.route === 'members' && (
                <Button
                  onClick={() => {
                    opener.current = document.activeElement as HTMLElement;
                    setInvite(true);
                  }}
                >
                  {t('Convidar membro', 'Invite member')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {!p.embedded && p.route === 'members' && (
        <div className="tabs">
          {[
            ['members', t('Membros', 'Members')],
            ['teams', t('Equipes', 'Teams')],
            ['permissions', t('Papéis e permissões', 'Roles & permissions')],
          ].map(([id, label]) => (
            <Button key={id} variant="ghost" className={'tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>
              {label}
            </Button>
          ))}
        </div>
      )}
      {teamList && p.route === 'members' && !p.embedded && (
        <div className="row team-list-toolbar">
          <span className="muted">
            {s.teams.length} {t('equipes', 'teams')}
          </span>
          <span className="sp" />
          <Button className="btn-sm" variant="outline" disabled={p.readOnly} onClick={() => editor()}>
            <Plus size={13} />
            {t('Criar equipe', 'Create team')}
          </Button>
        </div>
      )}
      {missing ? (
        notFound
      ) : teamList ? (
        teamsUI
      ) : p.route === 'team' && team ? (
        <>
          <div className="ph">
            <div className="row">
              <TeamMark team={team} />
              <div>
                <h1>{team.name}</h1>
                <p>{team.description}</p>
              </div>
            </div>
            <div className="acts">
              <Button variant="outline" disabled={p.readOnly} onClick={() => editor(team)}>
                <Pencil size={14} />
                {t('Editar equipe', 'Edit team')}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  opener.current = document.activeElement as HTMLElement;
                  setInvite(true);
                }}
              >
                {t('Convidar membro', 'Invite member')}
              </Button>
            </div>
          </div>
          <div className="grid2">
            <div className="stack">
              <section className="panel">
                <div className="panel-h">
                  <h2>{t('Projetos', 'Projects')}</h2>
                  <span className="faint">{s.projects.filter(project => project.teamId === team.id && !project.archived).length}</span>
                </div>
                {s.projects
                  .filter(project => project.teamId === team.id && !project.archived)
                  .map(project => {
                    const tasks = s.tasks.filter(task => task.projectId === project.id && !task.archived);
                    return (
                      <div className="mini" key={project.id}>
                        <ProjectMark project={project} />
                        <button className="tt" onClick={() => p.openProject(project.id)}>
                          {project.name}
                        </button>
                        <ProjectState project={project} t={t} />
                        <span className="team-project-progress">
                          <ProgressBar
                            value={Math.round((tasks.filter(task => task.status === 'done').length / Math.max(tasks.length, 1)) * 100)}
                            name={project.name}
                          />
                        </span>
                      </div>
                    );
                  })}
                {!s.projects.some(project => project.teamId === team.id && !project.archived) && (
                  <div className="panel-b faint">{t('Nenhum projeto', 'No projects')}</div>
                )}
              </section>
              <section className="panel">
                <div className="panel-h">
                  <h2>{t('Tarefas abertas', 'Open tasks')}</h2>
                  <span className="faint">
                    {
                      s.tasks.filter(
                        task =>
                          !task.archived &&
                          task.status !== 'done' &&
                          s.teamMembers.some(link => link.teamId === team.id && link.userId === task.assigneeUserId),
                      ).length
                    }
                  </span>
                </div>
                <MiniTasks
                  tasks={s.tasks
                    .filter(
                      task =>
                        !task.archived && task.status !== 'done' && s.teamMembers.some(link => link.teamId === team.id && link.userId === task.assigneeUserId),
                    )
                    .sort((a, b) => (a.dueDate ?? 'z').localeCompare(b.dueDate ?? 'z'))
                    .slice(0, 8)}
                  p={p}
                />
              </section>
            </div>
            <section className="panel" style={{ alignSelf: 'start' }}>
              <div className="panel-h">
                <h2>{t('Membros', 'Members')}</h2>
                <span className="faint">{s.teamMembers.filter(link => link.teamId === team.id).length}</span>
              </div>
              {s.teamMembers
                .filter(link => link.teamId === team.id)
                .map(link => {
                  const person = s.members.find(member => member.user_id === link.userId);
                  return (
                    <div className="mini team-person" key={link.userId}>
                      <PersonAvatar member={person} size="md" />
                      <button className="tt" onClick={() => p.go('member', { id: link.userId })}>
                        <span>{person?.name ?? link.userId}</span>
                        <small className="faint">{person?.title}</small>
                      </button>
                      <span className="badge">{person?.role}</span>
                    </div>
                  );
                })}
            </section>
          </div>
        </>
      ) : p.route === 'member' && member ? (
        <>
          <div className="member-profile">
            <PersonAvatar member={member} size="xl" />
            <div className="grow">
              <div className="row">
                <h1>{member.name}</h1>
                <span className="badge">{member.role}</span>
              </div>
              <div className="muted">
                {member.title}
                {s.teamMembers
                  .filter(link => link.userId === member.user_id)
                  .map(link => (
                    <Button key={link.teamId} variant="ghost" onClick={() => p.go('team', { id: link.teamId })}>
                      {s.teams.find(team => team.id === link.teamId)?.name}
                    </Button>
                  ))}
              </div>
              <div className="row faint member-contact">
                <span className="row">
                  <Mail size={13} />
                  {member.email}
                </span>
                <span className="row">
                  <MapPin size={13} />
                  {member.timezone || '—'}
                </span>
                <span className="row">
                  <Clock size={13} />—
                </span>
              </div>
            </div>
            <div className="acts">
              <Button variant="outline" onClick={() => void action(() => navigator.clipboard.writeText(member.email))}>
                <Copy size={14} />
                {t('Copiar email', 'Copy email')}
              </Button>
              <Button disabled={p.readOnly} onClick={() => p.createTask(member.user_id)}>
                <Plus size={14} />
                {t('Atribuir tarefa', 'Assign task')}
              </Button>
            </div>
          </div>
          <div className="stats member-stats">
            {[
              [
                t('Projetos ativos', 'Active projects'),
                s.projects.filter(
                  project =>
                    !project.archived &&
                    project.status !== 'complete' &&
                    s.projectMembers.some(link => link.projectId === project.id && link.userId === member.user_id),
                ).length,
              ],
              [t('Tarefas atribuídas', 'Assigned tasks'), assigned.filter(task => task.status !== 'done').length],
              [t('Tarefas concluídas', 'Completed tasks'), assigned.filter(task => task.status === 'done').length],
              [
                t('Atrasadas', 'Overdue'),
                assigned.filter(task => task.status !== 'done' && task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10)).length,
              ],
            ].map(([label, value]) => (
              <div className="stat" key={label}>
                <span className="k">{label}</span>
                <span className="v" style={label === t('Atrasadas', 'Overdue') && Number(value) > 0 ? { color: 'var(--red)' } : undefined}>
                  {value}
                </span>
              </div>
            ))}
          </div>
          <div className="grid2">
            <section className="panel member-assigned-panel">
              <div className="tabs">
                <Button variant="ghost" className={'tab' + (tab !== 'completed' ? ' on' : '')} onClick={() => setTab('assigned')}>
                  {t('Atribuídas', 'Assigned')} · {assigned.filter(task => task.status !== 'done').length}
                </Button>
                <Button variant="ghost" className={'tab' + (tab === 'completed' ? ' on' : '')} onClick={() => setTab('completed')}>
                  {t('Concluídas', 'Completed')} · {assigned.filter(task => task.status === 'done').length}
                </Button>
              </div>
              <MiniTasks tasks={assigned.filter(task => (task.status === 'done') === (tab === 'completed'))} p={p} avatars={false} />
            </section>
            <div className="stack">
              <section className="panel">
                <div className="panel-h">
                  <h2>{t('Projetos ativos', 'Active projects')}</h2>
                </div>
                {s.projects
                  .filter(
                    project =>
                      !project.archived &&
                      project.status !== 'complete' &&
                      s.projectMembers.some(link => link.projectId === project.id && link.userId === member.user_id),
                  )
                  .map(project => (
                    <div className="mini" key={project.id}>
                      <ProjectMark project={project} />
                      <button className="tt" onClick={() => p.openProject(project.id)}>
                        {project.name}
                      </button>
                      <span className="faint">{project.leadUserId === member.user_id ? t('Líder', 'Lead') : t('Membro', 'Member')}</span>
                    </div>
                  ))}
              </section>
              <section className="panel">
                <div className="panel-h">
                  <h2>{t('Atividade recente', 'Recent activity')}</h2>
                </div>
                <div className="panel-b feed">
                  <ContextHistory key={member.user_id} snapshot={s} repo={p.repo} actorId={member.user_id} limit={8} openTask={p.openTask} t={t} />
                </div>
              </section>
            </div>
          </div>
        </>
      ) : p.embedded && p.route === 'members' ? (
        <>
          <div className="row settings-member-actions">
            <Button
              onClick={() => {
                opener.current = document.activeElement as HTMLElement;
                setInvite(true);
              }}
            >
              <Users size={14} />
              {t('Convidar membro', 'Invite member')}
            </Button>
            <Button variant="outline" onClick={() => p.go('members')}>
              {t('Abrir diretório de membros', 'Open member directory')}
            </Button>
          </div>
          <div className="panel">
            {s.members.map(member => (
              <div className="mini settings-member-row" key={member.user_id}>
                <PersonAvatar member={member} size="md" />
                <button className="grow member-name" onClick={() => p.go('member', { id: member.user_id })}>
                  <span>{member.name}</span>
                  <small className="faint">{member.email}</small>
                </button>
                {member.status?.toLowerCase() === 'invited' && <span className="badge amber">{t('Convidado', 'Invited')}</span>}
                {member.role === 'owner' ? (
                  <span className="pillbtn">
                    <Crown size={13} />
                    {t('Proprietário', 'Owner')}
                  </span>
                ) : (
                  <select
                    className="pillbtn bordered settings-member-role"
                    aria-label={t('Papel local: ', 'Local role: ') + member.name}
                    disabled={p.readOnly || busy || p.repo.mode !== 'local' || member.user_id === s.actorId}
                    value={member.role === 'admin' ? 'Admin' : member.role === 'guest' ? 'Guest' : 'Member'}
                    onChange={event =>
                      void action(() => p.execute('local_workspace_member', { action: 'role', userId: member.user_id, role: event.target.value }))
                    }
                  >
                    {['Admin', 'Member', 'Guest'].map(value => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                )}
                <Button
                  variant="ghost"
                  className="ibtn ibtn-sm"
                  aria-label={t('Opções do membro', 'Member options')}
                  onClick={() => p.go('member', { id: member.user_id })}
                >
                  <MoreHorizontal size={14} />
                </Button>
              </div>
            ))}
          </div>
        </>
      ) : tab === 'permissions' ? (
        <>
          <p className="hint">
            {p.repo.mode === 'local'
              ? t('Capacidades deste painel local. Nenhum acesso remoto é concedido.', 'Capabilities of this local panel. No remote access is granted.')
              : t('Capacidades disponíveis neste painel.', 'Capabilities available in this panel.')}
          </p>
          <PermissionMatrix t={t} repo={p.repo} />
        </>
      ) : (
        <>
          <div className="panel-toolbar people-toolbar">
            <label className="people-search">
              <span className="sr-only">{t('Buscar pessoas', 'Search people')}</span>
              <Search size={13} />
              <Input
                className="search-sm"
                placeholder={t('Buscar por nome ou email', 'Search by name or email')}
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </label>
            <div className="seg" role="group" aria-label={t('Papel', 'Role')}>
              {[
                ['', t('Todos', 'All')],
                ['owner', t('Proprietário', 'Owner')],
                ['admin', t('Admin', 'Admin')],
                ['member', t('Membro', 'Member')],
                ['guest', t('Convidado', 'Guest')],
              ].map(([value, label]) => (
                <Button variant="ghost" className={role === value ? 'on' : ''} key={value} onClick={() => setRole(value)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="panel people-table">
            <table className="perm-t">
              <thead>
                <tr>
                  <th>{t('Membro', 'Member')}</th>
                  <th>{t('Papel', 'Role')}</th>
                  <th>{t('Equipe', 'Team')}</th>
                  <th>{t('Projetos ativos', 'Active projects')}</th>
                  <th>{t('Tarefas', 'Tasks')}</th>
                  <th>{t('Última atividade', 'Last active')}</th>
                  <th>{t('Status', 'Status')}</th>
                  <th>{t('Ações', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.user_id}>
                    <td>
                      <button className="row member-name" onClick={() => p.go('member', { id: m.user_id })}>
                        <PersonAvatar member={m} size="md" />
                        <span className="col">
                          <b>
                            {m.name}
                            {m.user_id === s.actorId && <span className="faint"> {t('(você)', '(you)')}</span>}
                          </b>
                          <span className="faint">{m.email}</span>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className="pillbtn">
                        {m.role === 'owner' && <Crown size={13} />}
                        {{ owner: t('Proprietário', 'Owner'), admin: 'Admin', member: t('Membro', 'Member'), guest: t('Visitante', 'Guest') }[m.role] ?? m.role}
                      </span>
                    </td>
                    <td>
                      {s.teamMembers
                        .filter(link => link.userId === m.user_id)
                        .map(link => {
                          const team = s.teams.find(team => team.id === link.teamId);
                          return team ? (
                            <span className="row directory-team" key={team.id}>
                              <TeamMark team={team} size={13} />
                              {team.name}
                            </span>
                          ) : null;
                        })}
                    </td>
                    <td className="num">
                      {
                        s.projects.filter(
                          project =>
                            !project.archived &&
                            project.status !== 'complete' &&
                            s.projectMembers.some(link => link.projectId === project.id && link.userId === m.user_id),
                        ).length
                      }
                    </td>
                    <td className="num">{s.tasks.filter(task => !task.archived && task.assigneeUserId === m.user_id && task.status !== 'done').length}</td>
                    <td className="muted">—</td>
                    <td>
                      <span
                        className={'badge ' + (m.status?.toLowerCase() === 'invited' ? 'amber' : m.status?.toLowerCase() === 'deactivated' ? 'gray' : 'green')}
                      >
                        {m.status?.toLowerCase() !== 'deactivated' && <span className="dot" />}
                        {m.status}
                      </span>
                    </td>
                    <td>
                      <details className="member-options">
                        <summary aria-label={t('Opções do membro', 'Member options')}>
                          <MoreHorizontal size={14} />
                        </summary>
                        <div className="member-actions">
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
                                  onChange={e =>
                                    void action(() => p.execute('local_workspace_member', { action: 'role', userId: m.user_id, role: e.target.value }))
                                  }
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
                                <Button
                                  variant="ghost"
                                  onClick={() => void action(() => p.execute('local_workspace_member', { action: 'resend', userId: m.user_id }))}
                                >
                                  {t('Reenviar convite local', 'Resend local invitation')}
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!members.length && <p>{t('Nenhuma pessoa encontrada.', 'No people found.')}</p>}
        </>
      )}
      <Sheet
        open={!!edit}
        onOpenChange={open => {
          if (!open && !busy && !submission && !removed) setEdit(null);
        }}
      >
        <SheetContent className="panel-modal team-editor" onCloseAutoFocus={restore} closeLabel={t('Fechar', 'Close')}>
          <div className="modal-h">
            <SheetTitle>{originalTeam.current ? t('Editar equipe', 'Edit team') : t('Nova equipe', 'New team')}</SheetTitle>
          </div>
          <SheetDescription className="panel-modal-description">{t('Organize pessoas e projetos.', 'Organize people and projects.')}</SheetDescription>
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
              <fieldset className="modal-b team-editor-fields" disabled={busy || !!submission || conflict || removed}>
                <div className="row team-editor-name">
                  <span className="picon lg" style={{ '--c': colorToken(edit.color) } as CSSProperties}>
                    {(() => {
                      const Icon = teamIcon(edit.icon);
                      return <Icon size={18} />;
                    })()}
                  </span>
                  <label className="field grow">
                    {t('Nome', 'Name')}
                    <Input
                      required
                      autoFocus
                      placeholder={t('Ex.: Produto', 'e.g. Growth')}
                      value={edit.name}
                      onChange={e => setEdit({ ...edit, name: e.target.value })}
                    />
                  </label>
                </div>
                <label className="field">
                  {t('Descrição', 'Description')}
                  <Input value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} />
                </label>
                <div className="row team-editor-choices">
                  <div className="field grow">
                    <span className="label" id="team-icon-label">
                      {t('Ícone', 'Icon')}
                    </span>
                    <div className="iconpick" role="radiogroup" aria-labelledby="team-icon-label" onKeyDown={radioKeys}>
                      {Object.entries(teamIcons).map(([name, Icon]) => (
                        <button
                          type="button"
                          role="radio"
                          key={name}
                          aria-label={name}
                          aria-checked={edit.icon === name}
                          tabIndex={edit.icon === name || (!Object.hasOwn(teamIcons, edit.icon) && name === 'users') ? 0 : -1}
                          className={edit.icon === name ? 'on' : ''}
                          onClick={() => setEdit({ ...edit, icon: name })}
                        >
                          <Icon size={15} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <span className="label" id="team-color-label">
                      {t('Cor', 'Color')}
                    </span>
                    <div className="swatches" role="radiogroup" aria-labelledby="team-color-label" onKeyDown={radioKeys}>
                      {teamColors.map(color => (
                        <button
                          type="button"
                          className={'sw' + (edit.color === color ? ' on' : '')}
                          style={{ '--c': colorToken(color) } as CSSProperties}
                          role="radio"
                          key={color}
                          aria-label={color}
                          aria-checked={edit.color === color}
                          tabIndex={edit.color === color || (!teamColors.includes(edit.color) && color === teamColors[0]) ? 0 : -1}
                          onClick={() => setEdit({ ...edit, color })}
                        >
                          {edit.color === color && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                    <label className="field team-custom-color">
                      {t('Valor da cor', 'Color value')}
                      <Input value={edit.color} onChange={e => setEdit({ ...edit, color: e.target.value })} />
                    </label>
                  </div>
                </div>
                <fieldset className="field team-member-selection">
                  <legend>
                    {t('Membros', 'Members')}{' '}
                    <span className="faint">
                      · {edit.members.length} {t('selecionados', 'selected')}
                    </span>
                  </legend>
                  <div className="panel team-member-scroll">
                    {s.members.map(m => (
                      <label className="mi panel-check" key={m.user_id}>
                        <input
                          className="check"
                          type="checkbox"
                          checked={edit.members.includes(m.user_id)}
                          onChange={e =>
                            setEdit({ ...edit, members: e.target.checked ? [...edit.members, m.user_id] : edit.members.filter(id => id !== m.user_id) })
                          }
                        />
                        <PersonAvatar member={m} />
                        <span className="grow trunc">{m.name}</span>
                        <span className="faint">
                          {s.teamMembers
                            .filter(link => link.userId === m.user_id && link.teamId !== edit.id)
                            .map(link => s.teams.find(team => team.id === link.teamId)?.name)
                            .join(', ')}
                        </span>
                      </label>
                    ))}
                  </div>
                  <span className="hint">
                    {t(
                      'Cada pessoa tem uma equipe principal. Adicionar aqui move a pessoa da equipe atual.',
                      'Everyone belongs to one primary team. Adding someone here moves them from their current team.',
                    )}
                  </span>
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
              <div className="modal-f">
                <span className="sp" />
                <Button variant="outline" type="button" disabled={busy || !!submission || removed} onClick={() => setEdit(null)}>
                  {t('Cancelar', 'Cancel')}
                </Button>
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
        <SheetContent className="panel-modal invite-editor" onCloseAutoFocus={restore} closeLabel={t('Fechar', 'Close')}>
          <div className="modal-h">
            <SheetTitle>
              {t('Convidar para', 'Invite to')} {p.workspace.name}
            </SheetTitle>
          </div>
          <SheetDescription>
            {p.repo.mode === 'local'
              ? t('Demonstração neste dispositivo. Nenhum email será enviado.', 'Demonstration on this device. No email will be sent.')
              : t('A pessoa recebe um e-mail com o link de acesso.', 'The person receives an email with the access link.')}
          </SheetDescription>
          {p.repo.mode === 'local' ? (
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
              <p className="hint">{t('Um email por convite.', 'One email per invitation.')}</p>
              {error && !edit && <p role="alert">{error}</p>}
              <div className="modal-f">
                <span className="sp" />
                <Button type="button" variant="outline" onClick={() => setInvite(false)}>
                  {t('Cancelar', 'Cancel')}
                </Button>
                <Button disabled={busy}>{t('Criar convite local', 'Create local invitation')}</Button>
              </div>
            </form>
          ) : (
            invite && <CloudInvitations p={p} close={() => setInvite(false)} />
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
