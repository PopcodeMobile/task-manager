import {
  Sun,
  Moon,
  Monitor,
  Check,
  Building2,
  Palette,
  Languages,
  Clock,
  Users,
  UsersRound,
  FolderKanban,
  Shield,
  Mail,
  Smartphone,
  AtSign,
  UserCheck,
  User,
  SlidersHorizontal,
  Keyboard,
  KeyRound,
  MonitorSmartphone,
  ShieldCheck,
  Gem,
  CreditCard,
  Receipt,
  Pencil,
  ShieldAlert,
  CircleCheck,
} from 'lucide-react';
import { Fragment, useEffect, useState, type CSSProperties } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '../../components/ui/alert-dialog';
import { changeAccountPassword } from './password-model';
import { supabase, passwordVerifier } from '../integrations/client';
import { useAuth } from '../auth/AuthProvider';
import { errorMessage } from '../shell/messages';
import { preferredDate } from './panel-model';
import { radioKeys } from './choice-navigation';
import { PersonAvatar, ProjectMark } from './PanelVisual';
import { PeoplePages } from './PeoplePages';
import { PermissionMatrix } from './PermissionMatrix';
import type { PanelProps } from './types';
import type { Project } from '../../domain/contracts';
import { KairosMark } from '../design/KairosMark';
export function SettingsPage(p: PanelProps) {
  const { t, snapshot: s, prefs } = p,
    sec = p.params.get('sec') ?? 'appearance',
    me = s.members.find(m => m.user_id === s.actorId),
    { session } = useAuth();
  const [error, setError] = useState(''),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [removeProject, setRemoveProject] = useState<Project | null>(null),
    [reset, setReset] = useState(false),
    [resetName, setResetName] = useState(''),
    [workspaceVersion, setWorkspaceVersion] = useState(p.workspace.version),
    [workspace, setWorkspace] = useState({ name: p.workspace.name, slug: p.workspace.slug, color: p.workspace.color }),
    [profile, setProfile] = useState({ name: me?.name ?? '', title: me?.title ?? '', avatar: me?.avatar ?? '', color: String(me?.color ?? 'indigo') }),
    [password, setPassword] = useState({ current: '', next: '', confirm: '' }),
    [demo, setDemo] = useState<{
      notifPrefs: Record<string, boolean>;
      sessions: { id: string; cur?: boolean; device?: string; name?: string; dev?: string; loc?: string; at?: string }[];
      tfa: boolean;
      plan: string;
      invoices?: { id: string; date: string; amt: string; st: string }[];
    }>({ notifPrefs: {}, sessions: [], tfa: false, plan: 'Free' }),
    [code, setCode] = useState('');
  const [setup2fa, setSetup2fa] = useState(false);
  const workspaceColors = ['#2F2E2A', '#5A67D8', '#3B82C4', '#23918A', '#C54B78', '#C48A1E'];
  const avatarColors = ['#5A67D8', '#C54B78', '#3B82C4', '#23918A', '#C48A1E', '#8662C9'];
  const modifier = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  useEffect(() => {
    if (p.repo.mode === 'local')
      void p.repo
        .rpc<typeof demo>('get_local_settings')
        .then(setDemo)
        .catch(e => setError(errorMessage(e, t)));
  }, [p.repo, sec]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setSaved(false);
    setError('');
    try {
      await fn();
      if (!p.repo.controller.signal.aborted) setSaved(true);
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  const help: Record<string, string> = {
    lang: t('Idioma usado na interface.', 'The language used throughout the interface.'),
    spell: t('Confira descrições e comentários.', 'Check spelling in descriptions and comments.'),
    tz: t('Usado nos prazos e lembretes.', 'Used for due dates and reminders.'),
    dateFmt: t('Formato das datas mostradas no espaço.', 'How dates appear throughout the workspace.'),
    weekStart: t('Afeta calendários e cronograma.', 'Affects calendars and the timeline.'),
    home: t('Página mostrada quando o Kairos abre.', 'The page you see when Kairos opens.'),
    openTasks: t('O painel lateral mantém seu lugar na lista.', 'Side panel keeps your place in the list.'),
    defaultTab: t('A aba mostrada ao abrir um projeto.', 'The tab that opens when you open a project.'),
    permGuests: t('Convidados veem somente projetos permitidos.', 'Guests only see projects they are added to.'),
    permPublic: t('Serviço remoto indisponível neste painel.', 'Remote service unavailable in this panel.'),
    motion: t('Reduza animações dos painéis, modais e transições.', 'Reduce animations for drawers, modals, and transitions.'),
  };
  const leads: Record<string, string> = {
    workspace: t('Nome, endereço e identidade do seu espaço.', 'Your workspace name, address, and identity.'),
    appearance: t('Escolha como o Kairos aparece neste dispositivo.', 'Customize how Kairos looks on this device.'),
    language: t('Idioma e formatos regionais.', 'Language and regional formats.'),
    datetime: t('Como datas e horários aparecem no espaço.', 'How dates and times appear across the workspace.'),
    members: `${s.members.length} ${t('pessoas têm acesso a', 'people have access to')} ${p.workspace.name}.`,
    teams: t('Equipes agrupam pessoas e projetos.', 'Teams group people and projects.'),
    projects: t('Padrões de novos projetos e trabalhos arquivados.', 'Defaults for new projects and archived work.'),
    permissions: t('Veja o que cada papel pode fazer neste painel.', 'Control what each role can do.'),
    'notif-email': t('Escolha quais emails você recebe.', 'Choose which emails you receive.'),
    'notif-push': t('Notificações no computador e celular.', 'Notifications on desktop and mobile.'),
    'notif-mentions': t('Escolha quais menções chegam até você.', 'Decide which mentions reach you.'),
    'notif-assign': t('Atualizações das tarefas atribuídas a você.', 'Updates about tasks assigned to you.'),
    profile: t('Como você aparece para outras pessoas no espaço.', 'How you appear to others in the workspace.'),
    preferences: t('Preferências pessoais de trabalho.', 'Personal defaults for how you work.'),
    shortcuts: t('Trabalhe pelo teclado.', 'Move faster with the keyboard.'),
    password: t('Use uma senha longa que você não usa em outro lugar.', 'Use a long password you do not use anywhere else.'),
    sessions: t('Dispositivos com sessão na conta.', 'Devices currently signed in to your account.'),
    '2fa': t('Adicione uma segunda etapa ao entrar.', 'Add a second step when signing in.'),
    plan: t('Assinatura e uso.', 'Your subscription and usage.'),
    payment: t('Forma de pagamento e dados de cobrança.', 'Payment method and billing details.'),
    invoices: t('Faturas anteriores do espaço.', 'Past invoices for this workspace.'),
  };
  const save = (patch: Record<string, unknown>) => void action(() => p.savePrefs(patch));
  const select = (key: string, label: string, options: [string, string][], fallback: string) => (
    <label className="setting-row srow">
      <span>
        <span className="t">{label}</span>
        {key === 'dateFmt' ? (
          <span className="d">
            {t('Prévia:', 'Preview:')} <b>{preferredDate(new Date(Date.now() + 8 * 86400000).toISOString(), prefs, t('pt-BR', 'en'))}</b>
          </span>
        ) : (
          help[key] && <span className="d">{help[key]}</span>
        )}
      </span>
      <select
        className="select"
        disabled={busy}
        value={String(prefs[key] ?? fallback)}
        onChange={e => save({ [key]: key === 'weekStart' ? Number(e.target.value) : e.target.value })}
      >
        {!options.some(([value]) => value === String(prefs[key] ?? fallback)) && <option value={String(prefs[key])}>{String(prefs[key])}</option>}
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  const toggle = (key: string, label: string, fallback = true) => (
    <label className="setting-row srow">
      <span>
        <span className="t">{label}</span>
        {help[key] && <span className="d">{help[key]}</span>}
      </span>
      <input className="toggle" type="checkbox" disabled={busy} checked={Boolean(prefs[key] ?? fallback)} onChange={e => save({ [key]: e.target.checked })} />
    </label>
  );
  const nav = [
    ['workspace', t('Espaço', 'Workspace')],
    ['appearance', t('Aparência', 'Appearance')],
    ['language', t('Idioma', 'Language')],
    ['datetime', t('Data e hora', 'Date & time')],
    ['members', t('Membros', 'Members')],
    ['teams', t('Equipes', 'Teams')],
    ['projects', t('Projetos', 'Projects')],
    ['permissions', t('Permissões', 'Permissions')],
    ['notif-email', 'Email'],
    ['notif-push', 'Push'],
    ['notif-mentions', t('Menções', 'Mentions')],
    ['notif-assign', t('Atribuições de tarefas', 'Task assignments')],
    ['profile', t('Perfil', 'Profile')],
    ['preferences', t('Preferências', 'Preferences')],
    ['shortcuts', t('Atalhos do teclado', 'Keyboard shortcuts')],
    ['password', t('Senha', 'Password')],
    ['sessions', t('Sessões', 'Sessions')],
    ['2fa', t('Autenticação em duas etapas', 'Two-factor authentication')],
    ['plan', t('Plano', 'Plan')],
    ['payment', t('Pagamento', 'Payment')],
    ['invoices', t('Faturas', 'Invoices')],
  ];
  const unavailable =
    p.repo.mode === 'cloud' &&
    ['permissions', 'notif-email', 'notif-push', 'notif-mentions', 'notif-assign', 'sessions', '2fa', 'plan', 'payment', 'invoices'].includes(sec);
  async function demoChange(section: string, key: string, value: string | boolean) {
    if (p.repo.mode !== 'local') return;
    await p.execute('local_demo_setting', { section, key, value });
    setDemo(await p.repo.rpc<typeof demo>('get_local_settings'));
  }
  return (
    <div className="set settings-layout">
      <nav className="set-nav" aria-label={t('Seções de configurações', 'Settings sections')}>
        {nav.map(([key, label], index) => (
          <Fragment key={key}>
            {(
              {
                0: t('Geral', 'General'),
                4: t('Espaço', 'Workspace'),
                8: t('Notificações', 'Notifications'),
                12: t('Pessoal', 'Personal'),
                15: t('Segurança', 'Security'),
                18: t('Cobrança', 'Billing'),
              } as Record<number, string>
            )[index] && (
              <div className="gh">
                {
                  (
                    {
                      0: t('Geral', 'General'),
                      4: t('Espaço', 'Workspace'),
                      8: t('Notificações', 'Notifications'),
                      12: t('Pessoal', 'Personal'),
                      15: t('Segurança', 'Security'),
                      18: t('Cobrança', 'Billing'),
                    } as Record<number, string>
                  )[index]
                }
              </div>
            )}
            <Button className={'sitem' + (sec === key ? ' on' : '')} variant="ghost" onClick={() => p.go('settings', { sec: key })}>
              {(() => {
                const Icon = [
                  Building2,
                  Palette,
                  Languages,
                  Clock,
                  Users,
                  UsersRound,
                  FolderKanban,
                  Shield,
                  Mail,
                  Smartphone,
                  AtSign,
                  UserCheck,
                  User,
                  SlidersHorizontal,
                  Keyboard,
                  KeyRound,
                  MonitorSmartphone,
                  ShieldCheck,
                  Gem,
                  CreditCard,
                  Receipt,
                ][index];
                return <Icon size={15} />;
              })()}
              {label}
            </Button>
          </Fragment>
        ))}
      </nav>
      <div className="set-body">
        <section className="settings-content set-in">
          <h1>{nav.find(([key]) => key === sec)?.[1] ?? t('Página não encontrada', 'Page not found')}</h1>
          {error && <p role="alert">{error}</p>}
          {saved && <p role="status">{t('Salvo', 'Saved')}</p>}
          <p className="lead">
            {unavailable
              ? t(
                  'Indisponível para espaços na nuvem neste painel. Nenhuma alteração será feita.',
                  'Unavailable for cloud workspaces in this panel. No changes will be made.',
                )
              : sec === 'password' && p.repo.mode === 'local'
                ? t('Senhas exigem uma conta autenticada na nuvem.', 'Passwords require an authenticated cloud account.')
                : sec.startsWith('notif-')
                  ? t('Preferências de amostra local. Nenhuma notificação será enviada.', 'Local sample preferences. No notifications will be sent.')
                  : sec === 'permissions'
                    ? t(
                        'Capacidades do painel. As preferências locais não concedem acesso remoto.',
                        'Panel capabilities. Local preferences do not grant remote access.',
                      )
                    : sec === 'sessions'
                      ? t(
                          'Sessões de amostra local. Nenhuma sessão autenticada será encerrada.',
                          'Local sample sessions. No authenticated sessions will be ended.',
                        )
                      : sec === '2fa'
                        ? t('Demonstração local. Não protege uma conta real.', 'Local demonstration. Does not protect a real account.')
                        : ['plan', 'payment', 'invoices'].includes(sec)
                          ? t('Amostra local. Sem cobrança ou alteração de assinatura.', 'Local sample. No charge or subscription change.')
                          : leads[sec]}
          </p>
          <fieldset className="settings-capability" disabled={unavailable}>
            {sec === 'workspace' ? (
              <>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    void action(async () => {
                      const updated = await p.execute<{ version: number }>('update_workspace', workspace, workspaceVersion);
                      setWorkspaceVersion(updated.version);
                      await p.workspaceChanged();
                    });
                  }}
                >
                  <div className="row settings-identity">
                    <span className="workspace-identity" style={{ background: workspace.color }}>
                      {workspace.name === 'Kairos' ? <KairosMark /> : workspace.name.slice(0, 1)}
                    </span>
                    <div>
                      <div className="label">{t('Ícone do espaço', 'Workspace icon')}</div>
                      <div className="swatches">
                        {workspaceColors.map(color => (
                          <button
                            className={'sw' + (workspace.color.toLowerCase() === color.toLowerCase() ? ' on' : '')}
                            type="button"
                            key={color}
                            style={{ '--c': color } as CSSProperties}
                            aria-label={t('Cor', 'Color') + ' ' + color}
                            aria-pressed={workspace.color.toLowerCase() === color.toLowerCase()}
                            disabled={busy || !p.admin}
                            onClick={() => setWorkspace({ ...workspace, color })}
                          />
                        ))}
                        <details className="settings-custom-color">
                          <summary aria-label={t('Cor personalizada', 'Custom color')} title={workspace.color}>
                            <Pencil size={12} />
                          </summary>
                          <label className="form-field">
                            {t('Cor', 'Color')}
                            <Input disabled={busy} value={workspace.color} onChange={e => setWorkspace({ ...workspace, color: e.target.value })} />
                          </label>
                        </details>
                      </div>
                    </div>
                  </div>
                  <label className="form-field">
                    {t('Nome do espaço', 'Workspace name')}
                    <Input disabled={busy} required value={workspace.name} onChange={e => setWorkspace({ ...workspace, name: e.target.value })} />
                  </label>
                  <label className="form-field">
                    {t('Endereço do espaço', 'Workspace URL')}
                    <span className="row settings-address">
                      <span className="input settings-address-prefix">{location.host}/</span>
                      <Input disabled={busy} required value={workspace.slug} onChange={e => setWorkspace({ ...workspace, slug: e.target.value })} />
                    </span>
                    <span className="hint">{t('Alterar o endereço pode quebrar links existentes.', 'Changing the URL will break existing links.')}</span>
                  </label>
                  <Button disabled={!p.admin || busy}>{t('Salvar espaço', 'Save workspace')}</Button>
                </form>
                <div className="sblock settings-danger">
                  <h2>{t('Zona de perigo', 'Danger zone')}</h2>
                  <div className="srow">
                    <div>
                      <div className="t">{t('Excluir espaço', 'Delete workspace')}</div>
                      <div className="d">{t('Exclusão permanente indisponível neste painel.', 'Permanent deletion is unavailable in this panel.')}</div>
                    </div>
                    <Button disabled variant="outline" className="btn-danger-ghost">
                      {t('Excluir espaço', 'Delete workspace')}
                    </Button>
                  </div>
                </div>
                {p.repo.mode === 'local' && (
                  <Button className="settings-reset-action btn-sm" variant="ghost" onClick={() => setReset(true)}>
                    {t('Restaurar dados de demonstração', 'Reset demo data')}
                  </Button>
                )}
              </>
            ) : sec === 'appearance' ? (
              <>
                <div className="sblock" style={{ marginTop: 0 }}>
                  <h2>{t('Tema', 'Theme')}</h2>
                  <div className="themecards" role="radiogroup" aria-label={t('Tema', 'Theme')} onKeyDown={radioKeys}>
                    {[
                      ['light', t('Claro', 'Light')],
                      ['dark', t('Escuro', 'Dark')],
                      ['system', t('Sistema', 'System')],
                    ].map(([key, label]) => {
                      const Icon = key === 'light' ? Sun : key === 'dark' ? Moon : Monitor;
                      return (
                        <button
                          key={key}
                          className={'tcard' + (String(prefs.theme ?? 'light') === key ? ' on' : '')}
                          role="radio"
                          tabIndex={String(prefs.theme ?? 'light') === key ? 0 : -1}
                          aria-checked={String(prefs.theme ?? 'light') === key}
                          disabled={busy}
                          onClick={() => save({ theme: key })}
                        >
                          <div className={'tprev' + (key === 'system' ? ' system' : '')}>
                            {(key === 'system' ? ['light', 'dark'] : [key]).map(mode => (
                              <div className="theme-preview" data-mode={mode} key={mode}>
                                <div className="s">
                                  <i />
                                  <i />
                                  <i />
                                  <i />
                                </div>
                                <div className="m">
                                  <i />
                                  <i />
                                  <i />
                                  <i />
                                </div>
                              </div>
                            ))}
                          </div>
                          <span className="row">
                            <Icon size={14} />
                            {label}
                            {String(prefs.theme ?? 'light') === key && (
                              <>
                                <span className="sp" />
                                <CircleCheck className="theme-selected" size={15} />
                              </>
                            )}
                          </span>
                        </button>
                      );
                    })}
                    {!['light', 'dark', 'system'].includes(String(prefs.theme ?? 'light')) && (
                      <Button role="radio" aria-checked tabIndex={0} variant="outline" disabled={busy}>
                        {String(prefs.theme)}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="sblock">
                  <h2>{t('Cor de destaque', 'Accent color')}</h2>
                  <div className="srow">
                    <div>
                      <div className="t">{t('Destaque', 'Accent')}</div>
                      <div className="d">{t('Usada em botões, foco e seleção.', 'Used for primary buttons, focus rings, and selection.')}</div>
                    </div>
                    <div className="swatches" role="radiogroup" aria-label={t('Cor de destaque', 'Accent color')} onKeyDown={radioKeys}>
                      {['indigo', 'blue', 'violet', 'teal', 'rose', 'graphite', 'green', 'amber'].map(accent => (
                        <button
                          className={'sw' + (String(prefs.accent ?? 'indigo') === accent ? ' on' : '')}
                          key={accent}
                          role="radio"
                          tabIndex={String(prefs.accent ?? 'indigo') === accent ? 0 : -1}
                          aria-label={accent}
                          aria-checked={String(prefs.accent ?? 'indigo') === accent}
                          style={{ '--c': ['green', 'amber'].includes(accent) ? `var(--${accent})` : `var(--accent-${accent})` } as CSSProperties}
                          disabled={busy}
                          onClick={() => save({ accent })}
                        >
                          {String(prefs.accent ?? 'indigo') === accent && <Check size={13} />}
                        </button>
                      ))}
                      {!['indigo', 'blue', 'violet', 'teal', 'rose', 'graphite', 'green', 'amber'].includes(String(prefs.accent ?? 'indigo')) && (
                        <Button role="radio" aria-checked tabIndex={0} variant="outline" disabled={busy}>
                          {String(prefs.accent)}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="sblock">
                  <h2>{t('Densidade', 'Density')}</h2>
                  {[
                    [
                      'side',
                      t('Densidade da barra lateral', 'Sidebar density'),
                      t('Mais projetos na barra lateral compacta.', 'Compact fits more projects on screen.'),
                    ],
                    [
                      'density',
                      t('Exibição de tarefas', 'Task display'),
                      t('Altura das linhas e espaço nos cartões.', 'Row height in lists and card padding on boards.'),
                    ],
                  ].map(([key, label, description]) => (
                    <div className="srow" key={key}>
                      <div>
                        <div className="t">{label}</div>
                        <div className="d">{description}</div>
                      </div>
                      <div className="seg">
                        {!['comfortable', 'compact'].includes(String(prefs[key] ?? 'comfortable')) && <span className="badge">{String(prefs[key])}</span>}
                        {[
                          ['comfortable', t('Confortável', 'Comfortable')],
                          ['compact', t('Compacta', 'Compact')],
                        ].map(([value, text]) => (
                          <Button
                            className={String(prefs[key] ?? 'comfortable') === value ? 'on' : ''}
                            variant="ghost"
                            key={value}
                            disabled={busy}
                            onClick={() => save({ [key]: value })}
                          >
                            {text}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {select(
                    'motion',
                    t('Movimento', 'Motion'),
                    [
                      ['system', t('Sistema', 'System')],
                      ['reduce', t('Reduzido', 'Reduced')],
                    ],
                    'system',
                  )}
                </div>
              </>
            ) : sec === 'language' ? (
              <>
                {select(
                  'lang',
                  t('Idioma', 'Language'),
                  [
                    ['pt-BR', 'Português'],
                    ['en', 'English (US)'],
                  ],
                  'pt-BR',
                )}
                {toggle('spell', t('Correção ortográfica', 'Spellcheck'))}
              </>
            ) : sec === 'datetime' ? (
              <>
                {select(
                  'tz',
                  t('Fuso horário', 'Time zone'),
                  ['America/Maceio', 'America/Sao_Paulo', 'America/New_York', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo'].map(v => [v, v]),
                  'America/Maceio',
                )}
                {select(
                  'dateFmt',
                  t('Formato de data', 'Date format'),
                  [
                    ['locale', t('Formato local', 'Locale format')],
                    ['MMM d', t('1 de out', 'Oct 1')],
                    ['d/M', '1/10'],
                    ['M/d', '10/1'],
                    ['yyyy-MM-dd', '2026-10-01'],
                  ],
                  'locale',
                )}
                {select(
                  'weekStart',
                  t('Iniciar semana em', 'Start week on'),
                  [
                    ['1', t('Segunda', 'Monday')],
                    ['0', t('Domingo', 'Sunday')],
                    ['6', t('Sábado', 'Saturday')],
                  ],
                  '1',
                )}
                {select(
                  'timeFmt',
                  t('Formato de hora', 'Time format'),
                  [
                    ['12', t('12 horas (2:30 PM)', '12-hour (2:30 PM)')],
                    ['24', t('24 horas (14:30)', '24-hour (14:30)')],
                  ],
                  '12',
                )}
              </>
            ) : sec === 'members' || sec === 'teams' ? (
              <PeoplePages {...p} route={sec} embedded />
            ) : sec === 'projects' ? (
              <>
                {select(
                  'defaultTab',
                  t('Visualização padrão do projeto', 'Default project view'),
                  [
                    ['board', t('Quadro', 'Board')],
                    ['list', t('Lista', 'List')],
                    ['table', t('Tabela', 'Table')],
                    ['overview', t('Visão geral', 'Overview')],
                    ['timeline', t('Cronograma', 'Timeline')],
                  ],
                  'board',
                )}
                {toggle('showDoneBoard', t('Mostrar concluídas no quadro', 'Show completed on board'))}
                <div className="sblock">
                  <h2>{t('Projetos arquivados', 'Archived projects')}</h2>
                  {s.projects
                    .filter(project => project.archived)
                    .map(project => (
                      <div className="srow" key={project.id}>
                        <span className="row">
                          <ProjectMark project={project} />
                          {project.name}
                        </span>
                        <span className="row">
                          <Button
                            variant="outline"
                            className="btn-sm"
                            disabled={p.readOnly || busy}
                            onClick={() => void action(() => p.execute('restore_project', { id: project.id }, project.version))}
                          >
                            {t('Restaurar', 'Restore')}
                          </Button>
                          <Button
                            variant="ghost"
                            className="btn-danger-ghost btn-sm"
                            aria-label={t('Excluir permanentemente', 'Delete permanently') + ': ' + project.name}
                            disabled={p.readOnly || busy}
                            onClick={() => {
                              setError('');
                              setRemoveProject(project);
                            }}
                          >
                            {t('Excluir', 'Delete')}
                          </Button>
                        </span>
                      </div>
                    ))}
                  {!s.projects.some(project => project.archived) && (
                    <p className="faint settings-projects-empty">
                      {t(
                        'Nenhum projeto arquivado. Projetos arquivados mantêm todas as tarefas.',
                        'No archived projects. Archived projects are hidden from the sidebar but keep all their tasks.',
                      )}
                    </p>
                  )}
                </div>
                <Button className="settings-open-archive btn-sm" variant="outline" onClick={() => p.go('archive')}>
                  {t('Abrir arquivo', 'Open archive')}
                </Button>
              </>
            ) : sec === 'permissions' ? (
              <>
                {toggle('permCreate', t('Membros podem criar projetos', 'Members can create projects'))}
                {toggle('permGuests', t('Membros podem convidar visitantes', 'Members can invite guests'))}
                {toggle('permPublic', t('Permitir links públicos', 'Allow public links'), false)}
                <div className="sblock">
                  <h2>{t('Permissões por papel', 'Role permissions')}</h2>
                  <PermissionMatrix t={t} repo={p.repo} />
                </div>
              </>
            ) : sec.startsWith('notif-') ? (
              <>
                {(sec === 'notif-email'
                  ? ['email_mention', 'email_assign', 'email_comment', 'email_digest']
                  : sec === 'notif-push'
                    ? ['push_mention', 'push_assign', 'push_comment', 'push_due']
                    : sec === 'notif-mentions'
                      ? ['mention_all', 'mention_team', 'mention_ws']
                      : ['assign_self', 'assign_status', 'assign_over']
                ).map(key => (
                  <label className="setting-row srow" key={key}>
                    <span>
                      {
                        (
                          {
                            email_mention: t('Menções', 'Mentions'),
                            email_assign: t('Atribuições', 'Assignments'),
                            email_comment: t('Comentários', 'Comments'),
                            email_digest: t('Resumo diário', 'Daily digest'),
                            push_mention: t('Menções', 'Mentions'),
                            push_assign: t('Atribuições', 'Assignments'),
                            push_comment: t('Comentários', 'Comments'),
                            push_due: t('Lembretes de prazo', 'Due date reminders'),
                            mention_all: t('@menções em comentários e descrições', '@mentions in comments and descriptions'),
                            mention_team: t('Menções à @equipe', '@team mentions'),
                            mention_ws: t('Menções ao @espaço', '@workspace mentions'),
                            assign_self: t('Quando uma tarefa é atribuída a mim', "When I'm assigned a task"),
                            assign_status: t('Quando minha tarefa muda de status', 'When my task changes status'),
                            assign_over: t('Quando minha tarefa está atrasada', 'When my task is overdue'),
                          } as Record<string, string>
                        )[key]
                      }
                      <span className="d">
                        {
                          (
                            {
                              email_mention: t('Quando alguém @menciona você.', 'When someone @mentions you.'),
                              email_assign: t('Quando uma tarefa é atribuída a você.', 'When a task is assigned to you.'),
                              email_comment: t('Em tarefas que você criou ou acompanha.', 'On tasks you created or are assigned.'),
                              email_digest: t('Resumo das alterações, em dias úteis às 8:00.', 'A summary of what changed, every weekday at 8:00.'),
                              push_due: t('Um dia antes do prazo.', 'One day before a task is due.'),
                              mention_team: t('Quando sua equipe é mencionada, ex.: @Produto.', 'When your team is mentioned, e.g. @Product.'),
                              mention_ws: t('Avisos para todas as pessoas.', 'Announcements to everyone.'),
                            } as Record<string, string>
                          )[key]
                        }
                      </span>
                    </span>
                    <input
                      className="toggle"
                      type="checkbox"
                      disabled={busy}
                      checked={demo.notifPrefs[key] ?? ['mention_team', 'assign_status', 'assign_over'].includes(key)}
                      onChange={e => void action(() => demoChange('notifications', key, e.target.checked))}
                    />
                  </label>
                ))}
              </>
            ) : sec === 'profile' ? (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (p.repo.mode !== 'local') return;
                  void action(() => p.execute('local_update_profile', profile));
                }}
              >
                <div className="row settings-identity">
                  <PersonAvatar member={{ ...me!, name: profile.name, color: profile.color }} size="xl" />
                  <div>
                    <div className="label">{t('Cor do avatar', 'Avatar color')}</div>
                    <div className="swatches">
                      {avatarColors.map((color, index) => (
                        <button
                          type="button"
                          className={
                            'sw' +
                            (profile.color.toLowerCase() === color.toLowerCase() ||
                            profile.color === ['indigo', 'rose', 'blue', 'teal', 'amber', 'violet'][index]
                              ? ' on'
                              : '')
                          }
                          key={color}
                          disabled={busy || p.repo.mode === 'cloud'}
                          aria-label={color}
                          style={{ '--c': color } as CSSProperties}
                          onClick={() => setProfile({ ...profile, color })}
                        />
                      ))}
                      <details className="settings-custom-color">
                        <summary aria-label={t('Cor personalizada', 'Custom color')} title={profile.color}>
                          <Pencil size={12} />
                        </summary>
                        <label className="form-field">
                          {t('Cor do avatar', 'Avatar color')}
                          <Input disabled={p.repo.mode === 'cloud'} value={profile.color} onChange={e => setProfile({ ...profile, color: e.target.value })} />
                        </label>
                      </details>
                    </div>
                  </div>
                </div>
                <label className="form-field">
                  {t('Nome completo', 'Full name')}
                  <Input disabled={p.repo.mode === 'cloud'} required value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
                </label>
                <label className="form-field">
                  {t('Cargo', 'Title')}
                  <Input disabled={p.repo.mode === 'cloud'} value={profile.title} onChange={e => setProfile({ ...profile, title: e.target.value })} />
                </label>
                <label className="form-field">
                  Email
                  <Input disabled value={me?.email ?? session?.user.email ?? ''} />
                  <span className="hint">
                    {t('Peça ao proprietário do espaço para alterar seu email.', 'Contact a workspace owner to change your sign-in email.')}
                  </span>
                </label>
                {p.repo.mode === 'cloud' && (
                  <p className="hint">{t('O perfil da conta é somente leitura neste painel.', 'Account profile is read-only in this panel.')}</p>
                )}
                <Button disabled={busy || p.repo.mode === 'cloud'}>{t('Salvar perfil', 'Save profile')}</Button>
              </form>
            ) : sec === 'preferences' ? (
              <>
                {select(
                  'home',
                  t('Abrir ao iniciar', 'Open on launch'),
                  [
                    ['home', t('Início', 'Home')],
                    ['mytasks', t('Minhas tarefas', 'My tasks')],
                    ['inbox', t('Caixa de entrada', 'Inbox')],
                  ],
                  'home',
                )}
                {select(
                  'openTasks',
                  t('Abrir tarefas em', 'Open tasks in'),
                  [
                    ['drawer', t('Painel lateral', 'Side panel')],
                    ['full', t('Página completa', 'Full page')],
                  ],
                  'drawer',
                )}
                {toggle('confirmDel', t('Confirmar antes de excluir tarefas', 'Confirm before deleting tasks'))}
              </>
            ) : sec === 'shortcuts' ? (
              <>
                {[
                  [
                    t('Geral', 'General'),
                    [
                      [t('Comandos e busca', 'Command menu'), [modifier, 'K']],
                      [t('Buscar', 'Search'), ['/']],
                      [t('Atalhos', 'Keyboard shortcuts'), ['?']],
                      [t('Alternar barra lateral', 'Toggle sidebar'), ['[']],
                      [t('Alternar tema', 'Toggle dark mode'), [modifier, 'Shift', 'L']],
                      [t('Fechar painel ou diálogo', 'Close panel or dialog'), ['Esc']],
                    ],
                  ],
                  [
                    t('Criar', 'Create'),
                    [
                      [t('Nova tarefa', 'New task'), ['N']],
                      [t('Novo projeto', 'New project'), ['P']],
                      [t('Enviar formulário', 'Submit form'), [modifier, '↵']],
                      [t('Enviar comentário', 'Send comment'), [modifier, '↵']],
                    ],
                  ],
                  [
                    t('Navegar', 'Navigate'),
                    [
                      [t('Ir para início', 'Go to Home'), ['G', 'H']],
                      [t('Minhas tarefas', 'Go to My Tasks'), ['G', 'T']],
                      [t('Projetos', 'Go to Projects'), ['G', 'P']],
                      [t('Caixa de entrada', 'Go to Inbox'), ['G', 'I']],
                      [t('Calendário', 'Go to Calendar'), ['G', 'C']],
                      [t('Configurações', 'Go to Settings'), ['G', 'S']],
                    ],
                  ],
                  [
                    t('Menu de comandos', 'Command menu'),
                    [
                      [t('Mover seleção', 'Move selection'), ['↑', '↓']],
                      [t('Executar comando', 'Run command'), ['↵']],
                      [t('Modo de busca', 'Search mode'), ['Tab']],
                    ],
                  ],
                ].map(([title, rows]) => (
                  <div className="sblock shortcut-section" key={String(title)}>
                    <h2>{String(title)}</h2>
                    {(rows as [string, string[]][]).map(([label, keys]) => (
                      <div className="srow" key={label}>
                        <span>{label}</span>
                        <span className="row">
                          {keys.map((key, index) => (
                            <Fragment key={key + index}>
                              {index > 0 && keys[0] === 'G' && <small className="faint">{t('depois', 'then')}</small>}
                              <kbd>{key}</kbd>
                            </Fragment>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            ) : sec === 'password' ? (
              p.repo.mode === 'local' ? (
                <>
                  <fieldset className="settings-capability settings-password" disabled>
                    {[t('Senha atual', 'Current password'), t('Nova senha', 'New password'), t('Confirmar nova senha', 'Confirm new password')].map(
                      (label, index) => (
                        <label className="form-field" key={label}>
                          {label}
                          <Input type="password" autoComplete="off" />
                          {index === 1 && (
                            <span className="hint">{t('Use 10 caracteres com número ou símbolo.', 'At least 10 characters with a number or symbol.')}</span>
                          )}
                        </label>
                      ),
                    )}
                    <Button>{t('Atualizar senha', 'Update password')}</Button>
                  </fieldset>
                </>
              ) : (
                <form
                  className="settings-password"
                  onSubmit={e => {
                    e.preventDefault();
                    if (password.next !== password.confirm) {
                      setError(t('As senhas não coincidem.', 'Passwords do not match.'));
                      return;
                    }
                    if (password.next.length < 10 || !/[\d\W]/.test(password.next)) {
                      setError(t('Use 10 caracteres com número ou símbolo.', 'Use 10 characters including a number or symbol.'));
                      return;
                    }
                    void action(async () => {
                      if (!supabase || !session?.user.email) throw Error();
                      await changeAccountPassword(
                        supabase.auth,
                        passwordVerifier(),
                        p.repo.userId,
                        session.user.email,
                        password.current,
                        password.next,
                        p.repo.controller.signal,
                      );
                      setPassword({ current: '', next: '', confirm: '' });
                    });
                  }}
                >
                  {[
                    ['current', t('Senha atual', 'Current password')],
                    ['next', t('Nova senha', 'New password')],
                    ['confirm', t('Confirmar nova senha', 'Confirm new password')],
                  ].map(([key, label]) => (
                    <label className="form-field" key={key}>
                      {label}
                      <Input
                        type="password"
                        required
                        autoComplete={key === 'current' ? 'current-password' : 'new-password'}
                        value={password[key as keyof typeof password]}
                        onChange={e => setPassword({ ...password, [key]: e.target.value })}
                      />
                      {key === 'next' && (
                        <span className="hint">{t('Use 10 caracteres com número ou símbolo.', 'At least 10 characters with a number or symbol.')}</span>
                      )}
                    </label>
                  ))}
                  <Button disabled={busy}>{t('Atualizar senha', 'Update password')}</Button>
                </form>
              )
            ) : sec === 'sessions' ? (
              <>
                {demo.sessions.map(item => (
                  <div className="srow" key={item.id}>
                    <div>
                      <div className="row t">
                        {(item.device ?? item.name ?? item.dev ?? '').includes('iPhone') ? <Smartphone size={15} /> : <Monitor size={15} />}
                        {item.device ?? item.name ?? item.dev ?? item.id}
                        {item.cur && <span className="badge green">{t('Este dispositivo', 'This device')}</span>}
                      </div>
                      <div className="d">
                        {item.loc ?? '—'} · {item.at ?? '—'}
                      </div>
                    </div>
                    {item.cur ? (
                      <span aria-hidden="true" />
                    ) : (
                      <Button className="btn-sm" disabled={busy} variant="outline" onClick={() => void action(() => demoChange('sessions', item.id, true))}>
                        {t('Revogar sessão local', 'Revoke local session')}
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  className="btn-danger-ghost settings-session-revoke"
                  variant="ghost"
                  disabled={busy || demo.sessions.length < 2}
                  onClick={() => void action(() => demoChange('sessions', 'all', true))}
                >
                  {t('Revogar outras sessões locais', 'Revoke other local sessions')}
                </Button>
              </>
            ) : sec === '2fa' ? (
              <>
                <div className={demo.tfa ? 'alert ok settings-2fa' : 'panel settings-2fa'}>
                  <span className="settings-2fa-icon">{demo.tfa ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}</span>
                  <div>
                    <b>
                      {p.repo.mode === 'cloud'
                        ? t('Autenticação adicional indisponível neste painel', 'Two-factor authentication is unavailable in this panel')
                        : demo.tfa
                          ? t('Ativada na demonstração', 'Enabled in demo')
                          : t('Desativada na demonstração', 'Disabled in demo')}
                    </b>
                    <p className="muted">
                      {t('A configuração real da conta não muda nesta demonstração.', 'Real account protection does not change in this demonstration.')}
                    </p>
                    {!setup2fa && !demo.tfa && (
                      <Button disabled={busy} onClick={() => setSetup2fa(true)}>
                        {t('Configurar autenticação na demonstração', 'Set up demo two-factor authentication')}
                      </Button>
                    )}
                    {(setup2fa || demo.tfa) && (
                      <form
                        onSubmit={e => {
                          e.preventDefault();
                          void action(async () => {
                            await demoChange('2fa', 'enabled', !demo.tfa);
                            setSetup2fa(false);
                            setCode('');
                          });
                        }}
                      >
                        {!demo.tfa && (
                          <label className="form-field">
                            {t('Código de demonstração (6 dígitos)', 'Demo code (6 digits)')}
                            <Input required pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value)} />
                          </label>
                        )}
                        <Button disabled={busy}>{demo.tfa ? t('Desativar demonstração', 'Disable demo') : t('Ativar demonstração', 'Enable demo')}</Button>
                        {!demo.tfa && (
                          <Button type="button" variant="ghost" disabled={busy} onClick={() => setSetup2fa(false)}>
                            {t('Cancelar', 'Cancel')}
                          </Button>
                        )}
                      </form>
                    )}
                  </div>
                </div>
              </>
            ) : sec === 'plan' ? (
              <>
                <div className="panel current-plan">
                  <div className="row">
                    <div>
                      <div className="eyebrow">{t('Plano atual', 'Current plan')}</div>
                      <div className="plan-current-name">
                        {p.repo.mode === 'local' ? demo.plan : '—'} <span className="muted">· {t('Amostra local', 'Local sample')}</span>
                      </div>
                      <div className="muted">{t('Renovação e cobrança', 'Renewal and billing')}: —</div>
                    </div>
                    <span className="sp" />
                    <Button variant="outline" onClick={() => p.go('settings', { sec: 'invoices' })}>
                      {t('Ver faturas', 'View invoices')}
                    </Button>
                  </div>
                  <div className="settings-usage">
                    {[
                      [t('Membros', 'Members'), s.members.length],
                      [t('Armazenamento', 'Storage'), '—'],
                      [t('Projetos', 'Projects'), s.projects.length],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <div className="row">
                          <span className="muted">{label}</span>
                          <span className="sp" />
                          <span className="num">{value} / —</span>
                        </div>
                        <div className="meter">
                          <i style={{ width: 0 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="settings-plans">
                  {[
                    ['Free', '$0', [t('Até 3 membros', 'Up to 3 members'), t('Tarefas ilimitadas', 'Unlimited tasks'), '5 GB']],
                    [
                      'Team',
                      '$12',
                      [
                        t('Até 50 membros', 'Up to 50 members'),
                        t('Cronogramas e visualizações', 'Timelines & custom views'),
                        '100 GB',
                        t('Convidados', 'Guest access'),
                      ],
                    ],
                    ['Business', '$24', [t('Membros ilimitados', 'Unlimited members'), t('Permissões adicionais', 'Advanced permissions'), 'SAML SSO', '1 TB']],
                  ].map(([name, price, features]) => (
                    <div className={'plan' + (p.repo.mode === 'local' && demo.plan === name ? ' cur' : '')} key={String(name)}>
                      <div className="row">
                        <b>{String(name)}</b>
                        {p.repo.mode === 'local' && demo.plan === name && <span className="badge accent">{t('Atual', 'Current')}</span>}
                      </div>
                      <div className="pr">
                        {String(price)} <span className="muted plan-price-unit">/{t('membro/mês', 'member/mo')}</span>
                      </div>
                      <ul>
                        {(features as string[]).map(feature => (
                          <li key={feature}>
                            <Check size={13} />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      <Button
                        variant={name === 'Business' ? 'default' : 'outline'}
                        disabled={busy || demo.plan === name || p.repo.mode !== 'local'}
                        onClick={() => void action(() => demoChange('plan', 'plan', String(name)))}
                      >
                        {p.repo.mode === 'local' && demo.plan === name ? t('Plano atual', 'Current plan') : t('Selecionar amostra', 'Select sample')}{' '}
                        {p.repo.mode === 'local' && demo.plan !== name && String(name)}
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            ) : sec === 'payment' || sec === 'invoices' ? (
              <>
                {sec === 'payment' ? (
                  <>
                    <div className="setting-row srow">
                      <div>
                        <div className="row t">
                          <span className="settings-payment-icon">
                            <CreditCard size={14} />
                          </span>
                          {t('Cartão de exemplo: Visa final 4242', 'Sample card: Visa ending in 4242')}
                        </div>
                        <div className="d">{t('Validade e padrão: indisponíveis na amostra.', 'Expiry and default: unavailable in sample.')}</div>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setError(t('Atualização de cartão não está disponível na demonstração.', 'Card updates are unavailable in this demonstration.'))
                        }
                      >
                        {t('Atualizar', 'Update')}
                      </Button>
                    </div>
                    <div className="srow">
                      <div>
                        <div className="t">{t('Email de cobrança', 'Billing email')}</div>
                        <div className="d">{t('Faturas e recibos são enviados aqui.', 'Invoices and receipts are sent here.')}</div>
                      </div>
                      <span className="muted">—</span>
                    </div>
                    <div className="setting-row srow">
                      <div>
                        <div className="t">{t('Endereço de cobrança de exemplo', 'Sample billing address')}</div>
                        <div className="d">{t('Endereço indisponível na amostra.', 'Address unavailable in sample.')}</div>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setError(t('Edição de endereço não está disponível na demonstração.', 'Address editing is unavailable in this demonstration.'))
                        }
                      >
                        {t('Editar', 'Edit')}
                      </Button>
                    </div>
                    <div className="srow">
                      <div>
                        <div className="t">{t('Documento fiscal', 'Tax ID')}</div>
                        <div className="d">{t('Exibido nas faturas', 'Shown on invoices')}</div>
                      </div>
                      <span className="muted">—</span>
                    </div>
                  </>
                ) : (
                  <div className="panel settings-invoices">
                    <table className="perm-t">
                      <caption className="sr-only">{t('Faturas de exemplo', 'Sample invoices')}</caption>
                      <thead>
                        <tr>
                          <th>{t('Fatura', 'Invoice')}</th>
                          <th>{t('Data', 'Date')}</th>
                          <th>{t('Valor', 'Amount')}</th>
                          <th>{t('Status', 'Status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {demo.invoices?.map(invoice => (
                          <tr key={invoice.id}>
                            <td className="mono">{invoice.id}</td>
                            <td className="num">{preferredDate(invoice.date, prefs, t('pt-BR', 'en'), true)}</td>
                            <td className="num">{invoice.amt}</td>
                            <td>
                              <span className="badge green">
                                <Check size={11} />
                                {invoice.st}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </fieldset>
          <AlertDialog
            open={!!removeProject}
            onOpenChange={open => {
              if (!open && !busy) setRemoveProject(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogTitle>{t('Excluir permanentemente?', 'Delete permanently?')}</AlertDialogTitle>
              <AlertDialogDescription>
                {removeProject?.name} · {t('Esta ação não pode ser desfeita.', 'This cannot be undone.')}
              </AlertDialogDescription>
              {error && <p role="alert">{error}</p>}
              <div className="button-row">
                <AlertDialogCancel asChild>
                  <Button variant="outline" disabled={busy}>
                    {t('Cancelar', 'Cancel')}
                  </Button>
                </AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={p.readOnly || busy || !removeProject}
                  onClick={() => {
                    if (!removeProject || p.readOnly || busy) return;
                    const project = removeProject;
                    void action(async () => {
                      await p.execute('delete_project', { id: project.id }, project.version);
                      setRemoveProject(null);
                    });
                  }}
                >
                  {t('Confirmar exclusão', 'Confirm deletion')}
                </Button>
              </div>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog open={reset} onOpenChange={setReset}>
            <AlertDialogContent>
              <AlertDialogTitle>{t('Restaurar dados deste espaço?', 'Reset this workspace data?')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t(
                  'Substitui os dados locais deste espaço por amostras. Outros espaços não serão alterados. Digite o nome para confirmar.',
                  'Replaces local data in this workspace with samples. Other workspaces are unchanged. Type the name to confirm.',
                )}
              </AlertDialogDescription>
              <label className="form-field">
                {p.workspace.name}
                <Input value={resetName} onChange={e => setResetName(e.target.value)} />
              </label>
              <div className="button-row">
                <AlertDialogCancel asChild>
                  <Button variant="outline">{t('Cancelar', 'Cancel')}</Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button
                    variant="destructive"
                    disabled={resetName !== p.workspace.name || busy}
                    onClick={() =>
                      void action(async () => {
                        await p.execute('local_reset_demo', { confirmWorkspaceId: p.workspace.id });
                        await p.refresh();
                        const current = (await p.workspaceChanged()).find(workspace => workspace.id === p.workspace.id);
                        if (!current) throw { code: 'not_found' };
                        setWorkspace({ name: current.name, slug: current.slug, color: current.color });
                        setWorkspaceVersion(current.version);
                      })
                    }
                  >
                    {t('Restaurar demonstração', 'Reset demo')}
                  </Button>
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      </div>
    </div>
  );
}
