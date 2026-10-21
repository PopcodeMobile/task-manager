import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Member } from '../../workspace/normalized';
import { useAuth } from '../auth/AuthProvider';
import type { Translate } from '../auth/ConsentPage';
import { errorMessage } from '../shell/messages';
import { issueAgentToken, listAgentTokens, revokeAgentToken, type AgentTokenConnection, type IssuedAgentToken, type TokenExpiry } from './agent-tokens';

type Props = { repo: WorkspaceRepository; admin: boolean; members?: Member[]; t: Translate };
export function AgentTokensPanel(props: Props) {
  const { sessionBoundary } = useAuth();
  if (!props.admin || props.repo.mode !== 'cloud')
    return (
      <section className="agent-tokens">
        <h2>{props.t('Tokens de agentes', 'Agent tokens')}</h2>
        <p className="permission-note">
          {props.repo.mode === 'local'
            ? props.t('Tokens exigem uma organização na nuvem.', 'Tokens require a cloud organization.')
            : props.t('Somente proprietários e administradores podem gerenciar tokens.', 'Only owners and administrators can manage tokens.')}
        </p>
      </section>
    );
  return <AdminAgentTokens key={`${props.repo.workspaceId}:${props.repo.userId}:${sessionBoundary}`} {...props} />;
}
function ExpiryOptions({ t }: { t: Translate }) {
  return (
    <>
      <option value="30">{t('30 dias', '30 days')}</option>
      <option value="90">{t('90 dias', '90 days')}</option>
      <option value="365">{t('365 dias', '365 days')}</option>
      <option value="none">{t('Sem expiração', 'Never expires')}</option>
    </>
  );
}
function AdminAgentTokens({ repo, members = [], t }: Props) {
  const id = useId();
  const [rows, setRows] = useState<AgentTokenConnection[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false);
  const [name, setName] = useState(''),
    [capability, setCapability] = useState<'read' | 'write'>('read'),
    [expiry, setExpiry] = useState<TokenExpiry>('90');
  const [issued, setIssued] = useState<IssuedAgentToken | null>(null),
    [copied, setCopied] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ mode: 'rotate' | 'revoke'; row: AgentTokenConnection } | null>(null),
    [rotationExpiry, setRotationExpiry] = useState<TokenExpiry>('90');
  const epoch = useRef(0);
  const endpoint = import.meta.env.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/mcp` : '';
  useEffect(() => {
    const generation = ++epoch.current;
    listAgentTokens(repo, null)
      .then(page => {
        if (epoch.current === generation && !repo.controller.signal.aborted) {
          setRows(page.items);
          setCursor(page.nextCursor);
          setLoaded(true);
        }
      })
      .catch(e => {
        if (epoch.current === generation && !repo.controller.signal.aborted) setError(errorMessage(e, t));
      });
    return () => {
      ++epoch.current;
    };
  }, [repo, t]);
  function updateRow(row: AgentTokenConnection) {
    setRows(previous => [row, ...previous.filter(old => old.id !== row.id)]);
  }
  async function action(run: (current: () => boolean) => Promise<void>) {
    if (busy) return;
    const generation = epoch.current;
    const current = () => epoch.current === generation && !repo.controller.signal.aborted;
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      await run(current);
    } catch (e) {
      if (current())
        setError(
          e && typeof e === 'object' && 'code' in e && e.code === 'validation_error'
            ? t('Confira o nome, a permissão e a validade do token.', 'Check the token name, permission and expiry.')
            : errorMessage(e, t),
        );
    } finally {
      if (current()) setBusy(false);
    }
  }
  function date(value: string | null, fallback: string) {
    return value ? new Date(value).toLocaleString(t('pt-BR', 'en')) : fallback;
  }
  async function copy() {
    if (!issued) return;
    const generation = epoch.current;
    try {
      await navigator.clipboard.writeText(issued.token);
      if (epoch.current === generation) setCopied(true);
    } catch {
      if (epoch.current === generation)
        setError(t('Não foi possível copiar. Selecione e copie o token manualmente.', 'Could not copy. Select and copy the token manually.'));
    }
  }
  return (
    <section className="agent-tokens" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{t('Tokens de agentes', 'Agent tokens')}</h2>
      <p className="permission-note">
        {t(
          'Conecte agentes desta organização sem login interativo. Cada token tem uma identidade própria e pode ser revogado aqui.',
          'Connect agents to this organization without an interactive sign-in. Each token has its own identity and can be revoked here.',
        )}
      </p>
      {!confirm && error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!loaded && !error && <p role="status">{t('Carregando tokens...', 'Loading tokens...')}</p>}
      {issued && (
        <div className="agent-token-secret" role="region" aria-label={t('Guarde seu token', 'Save your token')}>
          <strong>{t('Copie agora. Este token não será exibido novamente.', 'Copy it now. This token will not be shown again.')}</strong>
          <label className="form-field">
            {t('Token gerado', 'Generated token')}
            <textarea
              aria-label={t('Token gerado', 'Generated token')}
              className="input"
              readOnly
              rows={3}
              value={issued.token}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="button-row">
            <Button type="button" onClick={() => void copy()}>
              {copied ? t('Copiado', 'Copied') : t('Copiar token', 'Copy token')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIssued(null);
                setCopied(false);
                setError('');
              }}
            >
              {t('Já guardei, fechar', 'Saved it, close')}
            </Button>
          </div>
          <p className="permission-note">
            {t(
              'No cliente MCP, use o token no header Authorization: Bearer. Guarde o valor nos segredos ou no ambiente da VPS.',
              'In the MCP client, send the token in the Authorization: Bearer header. Keep its value in your VPS secrets or environment.',
            )}
          </p>
          <label className="form-field">
            {t('Endpoint MCP', 'MCP endpoint')}
            <Input readOnly value={endpoint} />
          </label>
          <pre className="agent-token-config">
            {'mcp_servers:\n  kairos:\n    url: ' + endpoint + '\n    headers:\n      Authorization: "Bearer ${KAIROS_AGENT_TOKEN}"'}
          </pre>
        </div>
      )}
      <form
        className="agent-token-form"
        noValidate
        onSubmit={event => {
          event.preventDefault();
          if (busy || issued) return;
          if (!name.trim() || name.trim().length > 100) {
            setError(t('Informe um nome de 1 a 100 caracteres para o token.', 'Enter a token name with 1 to 100 characters.'));
            return;
          }
          void action(async current => {
            const result = await issueAgentToken(repo, name, capability, expiry);
            if (current()) {
              setIssued(result);
              updateRow(result.connection);
              setName('');
            }
          });
        }}
      >
        <fieldset disabled={busy || !!issued}>
          <label className="form-field">
            {t('Nome do token', 'Token name')}
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('Ex.: Hermes VPS', 'E.g. Hermes VPS')}
              maxLength={100}
              autoComplete="off"
            />
          </label>
          <label className="form-field">
            {t('Permissão do token', 'Token permission')}
            <select
              aria-label={t('Permissão do token', 'Token permission')}
              className="input"
              value={capability}
              onChange={e => setCapability(e.target.value as 'read' | 'write')}
            >
              <option value="read">{t('Somente leitura', 'Read only')}</option>
              <option value="write">{t('Leitura e escrita', 'Read and write')}</option>
            </select>
          </label>
          <label className="form-field">
            {t('Validade do token', 'Token expiry')}
            <select
              aria-label={t('Validade do token', 'Token expiry')}
              className="input"
              value={expiry}
              onChange={e => setExpiry(e.target.value as TokenExpiry)}
            >
              <ExpiryOptions t={t} />
            </select>
          </label>
          {expiry === 'none' && (
            <p className="permission-note">
              {t('O token continuará válido até você rotacionar ou revogar o acesso.', 'This token stays valid until you rotate or revoke its access.')}
            </p>
          )}
          <Button type="submit" disabled={busy || !loaded || !!issued}>
            {busy ? t('Aguarde...', 'Please wait...') : t('Gerar token', 'Generate token')}
          </Button>
        </fieldset>
      </form>
      {rows.map(row => (
        <article className="connection-row agent-token-row" key={row.id}>
          <div className="connection-heading">
            <strong>{row.name}</strong>
            <span>{row.status === 'active' ? t('Ativo', 'Active') : row.status === 'expired' ? t('Expirado', 'Expired') : t('Revogado', 'Revoked')}</span>
          </div>
          <p>
            <code>{row.prefix}</code> · {row.capability === 'write' ? t('Leitura e escrita', 'Read and write') : t('Somente leitura', 'Read only')}
          </p>
          <dl className="agent-token-details">
            <dt>{t('Criado por', 'Created by')}</dt>
            <dd>{members.find(member => member.user_id === row.createdByUserId)?.name ?? t('Administrador anterior', 'Former administrator')}</dd>
            <dt>{t('Criado em', 'Created')}</dt>
            <dd>{date(row.createdAt, '')}</dd>
            <dt>{t('Validade', 'Expiry')}</dt>
            <dd>{date(row.expiresAt, t('Sem expiração', 'Never expires'))}</dd>
            <dt>{t('Último uso', 'Last used')}</dt>
            <dd>{date(row.lastUsedAt, t('Ainda não usado', 'Not used yet'))}</dd>
          </dl>
          {row.status !== 'revoked' && (
            <div className="button-row">
              <Button
                type="button"
                variant="outline"
                disabled={busy || !!issued}
                aria-label={t('Rotacionar token ', 'Rotate token ') + row.name}
                onClick={() => {
                  setError('');
                  setRotationExpiry('90');
                  setConfirm({ mode: 'rotate', row });
                }}
              >
                {t('Rotacionar', 'Rotate')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !!issued}
                aria-label={t('Revogar token ', 'Revoke token ') + row.name}
                onClick={() => {
                  setError('');
                  setConfirm({ mode: 'revoke', row });
                }}
              >
                {t('Revogar', 'Revoke')}
              </Button>
            </div>
          )}
        </article>
      ))}
      {loaded && !rows.length && <p className="permission-note">{t('Nenhum token criado nesta organização.', 'No tokens created in this organization.')}</p>}
      {cursor && (
        <Button
          type="button"
          variant="outline"
          disabled={busy || !!issued}
          onClick={() =>
            void action(async current => {
              const page = await listAgentTokens(repo, cursor);
              if (current()) {
                setRows(previous => [...previous, ...page.items.filter(row => !previous.some(old => old.id === row.id))]);
                setCursor(page.nextCursor);
              }
            })
          }
        >
          {t('Carregar mais tokens', 'Load more tokens')}
        </Button>
      )}
      <AlertDialog
        open={!!confirm}
        onOpenChange={open => {
          if (!open && !busy) {
            setConfirm(null);
            setError('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{confirm?.mode === 'rotate' ? t('Rotacionar token?', 'Rotate token?') : t('Revogar token?', 'Revoke token?')}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirm?.mode === 'rotate'
              ? t(
                  'O token anterior deixará de funcionar imediatamente. Copie o novo token ao concluir.',
                  'The previous token will stop working immediately. Copy the new token when done.',
                )
              : t(
                  'O agente perderá acesso a esta organização. Tarefas e histórico serão mantidos.',
                  'The agent will lose access to this organization. Tasks and history are preserved.',
                )}
          </AlertDialogDescription>
          {confirm?.mode === 'rotate' && (
            <label className="form-field">
              {t('Validade do novo token', 'New token expiry')}
              <select
                aria-label={t('Validade do novo token', 'New token expiry')}
                className="input"
                value={rotationExpiry}
                disabled={busy}
                onChange={e => setRotationExpiry(e.target.value as TokenExpiry)}
              >
                <ExpiryOptions t={t} />
              </select>
            </label>
          )}
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
            <AlertDialogAction asChild>
              <Button
                disabled={busy}
                onClick={event => {
                  event.preventDefault();
                  if (!confirm) return;
                  const chosen = confirm;
                  void action(async current => {
                    if (chosen.mode === 'rotate') {
                      const result = await issueAgentToken(repo, chosen.row.name, chosen.row.capability, rotationExpiry, chosen.row.id);
                      if (current()) {
                        setIssued(result);
                        updateRow(result.connection);
                        setConfirm(null);
                      }
                    } else {
                      const result = await revokeAgentToken(repo, chosen.row.id);
                      if (current()) {
                        updateRow(result);
                        setConfirm(null);
                      }
                    }
                  });
                }}
              >
                {confirm?.mode === 'rotate' ? t('Rotacionar token', 'Rotate token') : t('Revogar token', 'Revoke token')}
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
