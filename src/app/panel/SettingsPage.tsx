import { useEffect, useState } from 'react';
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
import { PeoplePages } from './PeoplePages';
import { ArchivePage } from './RemainingRoutes';
import type { PanelProps } from './types';
export function SettingsPage(p: PanelProps) {
  const { t, snapshot: s, prefs } = p,
    sec = p.params.get('sec') ?? 'workspace',
    me = s.members.find(m => m.user_id === s.actorId),
    { session } = useAuth();
  const [error, setError] = useState(''),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [reset, setReset] = useState(false),
    [resetName, setResetName] = useState(''),
    [workspaceVersion, setWorkspaceVersion] = useState(p.workspace.version),
    [workspace, setWorkspace] = useState({ name: p.workspace.name, slug: p.workspace.slug, color: p.workspace.color }),
    [profile, setProfile] = useState({ name: me?.name ?? '', title: me?.title ?? '', avatar: me?.avatar ?? '', color: String(me?.color ?? 'indigo') }),
    [password, setPassword] = useState({ current: '', next: '', confirm: '' }),
    [demo, setDemo] = useState<{
      notifPrefs: Record<string, boolean>;
      sessions: { id: string; cur?: boolean; device?: string; name?: string }[];
      tfa: boolean;
      plan: string;
      invoices?: { id: string; date: string; amt: string; st: string }[];
    }>({ notifPrefs: {}, sessions: [], tfa: false, plan: 'Free' }),
    [code, setCode] = useState('');
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
  const save = (patch: Record<string, unknown>) => void action(() => p.savePrefs(patch));
  const select = (key: string, label: string, options: [string, string][], fallback: string) => (
    <label className="setting-row">
      <span>{label}</span>
      <select
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
    <label className="setting-row">
      <span>{label}</span>
      <input type="checkbox" disabled={busy} checked={Boolean(prefs[key] ?? fallback)} onChange={e => save({ [key]: e.target.checked })} />
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
    ['notif-email', t('Notificações por email', 'Email notifications')],
    ['notif-push', 'Push'],
    ['notif-mentions', t('Menções', 'Mentions')],
    ['notif-assign', t('Atribuições', 'Assignments')],
    ['profile', t('Perfil', 'Profile')],
    ['preferences', t('Preferências', 'Preferences')],
    ['shortcuts', t('Atalhos', 'Shortcuts')],
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
    await p.execute('local_demo_setting', { section, key, value });
    setDemo(await p.repo.rpc<typeof demo>('get_local_settings'));
  }
  return (
    <div className="settings-layout">
      <nav aria-label={t('Seções de configurações', 'Settings sections')}>
        {nav.map(([key, label]) => (
          <Button key={key} variant={sec === key ? 'default' : 'ghost'} onClick={() => p.go('settings', { sec: key })}>
            {label}
          </Button>
        ))}
      </nav>
      <section className="panel-page settings-content">
        <h2>{nav.find(([key]) => key === sec)?.[1] ?? t('Página não encontrada', 'Page not found')}</h2>
        {error && <p role="alert">{error}</p>}
        {saved && <p role="status">{t('Salvo', 'Saved')}</p>}
        {unavailable ? (
          <p className="configuration-note">
            {t(
              'Esta função não está disponível para organizações na nuvem neste painel. Nenhuma alteração foi feita.',
              'This feature is unavailable for cloud workspaces in this panel. No changes were made.',
            )}
          </p>
        ) : sec === 'workspace' ? (
          <>
            <form
              onSubmit={e => {
                e.preventDefault();
                void action(async () => {
                  const updated = await p.execute<{ version: number }>('update_workspace', workspace, workspaceVersion);
                  setWorkspaceVersion(updated.version);
                  p.workspaceChanged();
                });
              }}
            >
              <label className="form-field">
                {t('Nome do espaço', 'Workspace name')}
                <Input required value={workspace.name} onChange={e => setWorkspace({ ...workspace, name: e.target.value })} />
              </label>
              <label className="form-field">
                {t('Endereço', 'Address')}
                <Input required value={workspace.slug} onChange={e => setWorkspace({ ...workspace, slug: e.target.value })} />
              </label>
              <label className="form-field">
                {t('Cor', 'Color')}
                <Input value={workspace.color} onChange={e => setWorkspace({ ...workspace, color: e.target.value })} />
              </label>
              <Button disabled={!p.admin || busy}>{t('Salvar espaço', 'Save workspace')}</Button>
            </form>
            <Button disabled variant="destructive">
              {t('Excluir espaço', 'Delete workspace')}
            </Button>
            {p.repo.mode === 'local' && (
              <Button variant="outline" onClick={() => setReset(true)}>
                {t('Restaurar dados de demonstração', 'Reset demo data')}
              </Button>
            )}
          </>
        ) : sec === 'appearance' ? (
          <>
            {select(
              'theme',
              t('Tema', 'Theme'),
              [
                ['system', t('Sistema', 'System')],
                ['light', t('Claro', 'Light')],
                ['dark', t('Escuro', 'Dark')],
              ],
              'light',
            )}
            {select(
              'accent',
              t('Cor de destaque', 'Accent color'),
              ['indigo', 'violet', 'blue', 'teal', 'green', 'amber', 'rose'].map(v => [v, v]),
              'indigo',
            )}
            {select(
              'side',
              t('Densidade da barra lateral', 'Sidebar density'),
              [
                ['comfortable', t('Confortável', 'Comfortable')],
                ['compact', t('Compacta', 'Compact')],
              ],
              'comfortable',
            )}
            {select(
              'density',
              t('Exibição de tarefas', 'Task display'),
              [
                ['comfortable', t('Confortável', 'Comfortable')],
                ['compact', t('Compacta', 'Compact')],
              ],
              'comfortable',
            )}
            {select(
              'motion',
              t('Movimento', 'Motion'),
              [
                ['system', t('Sistema', 'System')],
                ['reduce', t('Reduzido', 'Reduced')],
              ],
              'system',
            )}
          </>
        ) : sec === 'language' ? (
          <>
            {select(
              'lang',
              t('Idioma', 'Language'),
              [
                ['pt-BR', 'Português'],
                ['en', 'English'],
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
              ['locale', 'MMM d', 'd/M', 'M/d', 'yyyy-MM-dd'].map(v => [v, v]),
              'locale',
            )}
            {select(
              'weekStart',
              t('Início da semana', 'Week starts on'),
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
                ['12', t('12 horas', '12 hours')],
                ['24', t('24 horas', '24 hours')],
              ],
              '12',
            )}
          </>
        ) : sec === 'members' || sec === 'teams' ? (
          <PeoplePages {...p} route={sec} />
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
            <Button variant="outline" onClick={() => p.go('archive')}>
              {t('Abrir arquivo', 'Open archive')}
            </Button>
            <ArchivePage {...p} />
          </>
        ) : sec === 'permissions' ? (
          <>
            <p className="configuration-note">
              {t('Demonstração local. Estas opções não concedem acesso remoto.', 'Local demonstration. These options do not grant remote access.')}
            </p>
            {toggle('permCreate', t('Membros podem criar projetos', 'Members can create projects'))}
            {toggle('permGuests', t('Membros podem convidar visitantes', 'Members can invite guests'))}
            {toggle('permPublic', t('Permitir links públicos', 'Allow public links'), false)}
          </>
        ) : sec.startsWith('notif-') ? (
          <>
            <p className="configuration-note">
              {t('Preferências de demonstração local. Nenhuma notificação será enviada.', 'Local demonstration preferences. No notifications will be sent.')}
            </p>
            {(sec === 'notif-email'
              ? ['email_mention', 'email_assign', 'email_comment', 'email_digest']
              : sec === 'notif-push'
                ? ['push_mention', 'push_assign', 'push_comment', 'push_due']
                : sec === 'notif-mentions'
                  ? ['mention_all', 'mention_team', 'mention_ws']
                  : ['assign_self', 'assign_status', 'assign_over']
            ).map(key => (
              <label className="setting-row" key={key}>
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
                        mention_all: '@mentions',
                        mention_team: '@team',
                        mention_ws: '@workspace',
                        assign_self: t('Novas atribuições', 'New assignments'),
                        assign_status: t('Mudanças de status', 'Status changes'),
                        assign_over: t('Tarefas atrasadas', 'Overdue tasks'),
                      } as Record<string, string>
                    )[key]
                  }
                </span>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={!!demo.notifPrefs[key]}
                  onChange={e => void action(() => demoChange('notifications', key, e.target.checked))}
                />
              </label>
            ))}
          </>
        ) : sec === 'profile' ? (
          p.repo.mode === 'cloud' ? (
            <>
              <p>{me?.name ?? session?.user.user_metadata?.name}</p>
              <p>{me?.email ?? session?.user.email}</p>
              <p>{t('O perfil da conta é somente leitura neste painel.', 'Account profile is read-only in this panel.')}</p>
            </>
          ) : (
            <form
              onSubmit={e => {
                e.preventDefault();
                void action(() => p.execute('local_update_profile', profile));
              }}
            >
              <label className="form-field">
                {t('Nome', 'Name')}
                <Input required value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
              </label>
              <label className="form-field">
                {t('Cargo', 'Job title')}
                <Input value={profile.title} onChange={e => setProfile({ ...profile, title: e.target.value })} />
              </label>
              <label className="form-field">
                {t('Cor do avatar', 'Avatar color')}
                <Input value={profile.color} onChange={e => setProfile({ ...profile, color: e.target.value })} />
              </label>
              <Button disabled={busy}>{t('Salvar perfil', 'Save profile')}</Button>
            </form>
          )
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
                ['full', t('Painel ampliado', 'Full panel')],
              ],
              'drawer',
            )}
            {toggle('confirmDel', t('Confirmar antes de excluir tarefas', 'Confirm before deleting tasks'))}
          </>
        ) : sec === 'shortcuts' ? (
          <dl>
            <dt>⌘/Ctrl K</dt>
            <dd>{t('Abrir comandos e busca', 'Open commands and search')}</dd>
            <dt>G H / G T / G P / G I / G C / G S / G N / G A / G M</dt>
            <dd>
              {t(
                'Ir para início, minhas tarefas, projetos, caixa de entrada, calendário, configurações, notificações, atividade ou membros.',
                'Go to home, my tasks, projects, inbox, calendar, settings, notifications, activity or members.',
              )}
            </dd>
            <dt>N / P / /</dt>
            <dd>{t('Criar tarefa, criar projeto ou buscar.', 'Create task, create project or search.')}</dd>
            <dt>⌘/Ctrl Shift L / [ / ?</dt>
            <dd>{t('Alternar tema, barra lateral ou abrir atalhos.', 'Toggle theme, sidebar or open shortcuts.')}</dd>
            <dt>Esc</dt>
            <dd>{t('Fechar painel ou diálogo', 'Close panel or dialog')}</dd>
            <dt>Tab / Shift Tab</dt>
            <dd>{t('Navegar entre controles', 'Navigate controls')}</dd>
          </dl>
        ) : sec === 'password' ? (
          p.repo.mode === 'local' ? (
            <p>{t('Senhas exigem uma conta autenticada na nuvem.', 'Passwords require an authenticated cloud account.')}</p>
          ) : (
            <form
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
                </label>
              ))}
              <Button disabled={busy}>{t('Atualizar senha', 'Update password')}</Button>
            </form>
          )
        ) : sec === 'sessions' ? (
          <>
            <p className="configuration-note">
              {t(
                'Sessões de demonstração local. Nenhuma sessão autenticada será encerrada.',
                'Local demonstration sessions. No authenticated sessions will be ended.',
              )}
            </p>
            {demo.sessions.map(item => (
              <div className="panel-row" key={item.id}>
                <span>{item.device ?? item.name ?? item.id}</span>
                <Button disabled={busy || item.cur} variant="outline" onClick={() => void action(() => demoChange('sessions', item.id, true))}>
                  {t('Revogar sessão local', 'Revoke local session')}
                </Button>
              </div>
            ))}
            <Button disabled={busy || demo.sessions.length < 2} onClick={() => void action(() => demoChange('sessions', 'all', true))}>
              {t('Revogar outras sessões locais', 'Revoke other local sessions')}
            </Button>
          </>
        ) : sec === '2fa' ? (
          <>
            <p className="configuration-note">
              {t('Demonstração local. Não protege uma conta real.', 'Local demonstration. Does not protect a real account.')}
            </p>
            <p>{demo.tfa ? t('Ativada na demonstração', 'Enabled in demo') : t('Desativada na demonstração', 'Disabled in demo')}</p>
            <form
              onSubmit={e => {
                e.preventDefault();
                void action(() => demoChange('2fa', 'enabled', !demo.tfa));
              }}
            >
              {!demo.tfa && (
                <label className="form-field">
                  {t('Código de demonstração (6 dígitos)', 'Demo code (6 digits)')}
                  <Input required pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value)} />
                </label>
              )}
              <Button disabled={busy}>{demo.tfa ? t('Desativar demonstração', 'Disable demo') : t('Ativar demonstração', 'Enable demo')}</Button>
            </form>
          </>
        ) : sec === 'plan' ? (
          <>
            <p className="configuration-note">
              {t('Plano de demonstração local. Sem cobrança ou alteração de assinatura.', 'Local demonstration plan. No charge or subscription change.')}
            </p>
            <p>{demo.plan}</p>
            {['Free', 'Team', 'Business'].map(plan => (
              <Button key={plan} disabled={busy || demo.plan === plan} onClick={() => void action(() => demoChange('plan', 'plan', plan))}>
                {plan}
              </Button>
            ))}
          </>
        ) : sec === 'payment' || sec === 'invoices' ? (
          <>
            <p className="configuration-note">
              {t(
                'Demonstração local. Não há cobrança, cartão ou fatura real neste espaço.',
                'Local demonstration. There is no real charge, card or invoice in this workspace.',
              )}
            </p>
            {sec === 'payment' ? (
              <>
                <div className="setting-row">
                  <span>{t('Cartão de exemplo: Visa final 4242', 'Sample card: Visa ending in 4242')}</span>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setError(t('Atualização de cartão não está disponível na demonstração.', 'Card updates are unavailable in this demonstration.'))
                    }
                  >
                    {t('Atualizar', 'Update')}
                  </Button>
                </div>
                <div className="setting-row">
                  <span>{t('Endereço de cobrança de exemplo', 'Sample billing address')}</span>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setError(t('Edição de endereço não está disponível na demonstração.', 'Address editing is unavailable in this demonstration.'))
                    }
                  >
                    {t('Editar', 'Edit')}
                  </Button>
                </div>
              </>
            ) : (
              <table>
                <caption>{t('Faturas de exemplo', 'Sample invoices')}</caption>
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
                      <td>{invoice.id}</td>
                      <td>{preferredDate(invoice.date, prefs, t('pt-BR', 'en'), true)}</td>
                      <td>{invoice.amt}</td>
                      <td>{invoice.st}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : null}
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
  );
}
