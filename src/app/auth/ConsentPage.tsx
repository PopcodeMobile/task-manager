import { useEffect, useState } from 'react';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { Button } from '../../components/ui/button';
import { authorizationDetails, decideConsent, safeOAuthRedirect, workspaces, type GrantChoice, type WorkspaceChoice } from '../integrations/client';
export type Translate = (pt: string, en: string) => string;
export function ConsentPage({ t }: { t: Translate }) {
  const authorizationId = new URLSearchParams(location.search).get('authorization_id') ?? '';
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null),
    [choices, setChoices] = useState<WorkspaceChoice[]>([]),
    [grants, setGrants] = useState<GrantChoice[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        if (!authorizationId) throw new Error();
        const [details, list] = await Promise.all([authorizationDetails(authorizationId), workspaces()]);
        if (!alive) return;
        if (!('authorization_id' in details)) {
          location.assign(safeOAuthRedirect(details.redirect_url));
          return;
        }
        setDetails(details);
        setChoices(list);
      } catch {
        if (alive)
          setError(
            t(
              'Este pedido expirou ou não é válido. Inicie a conexão novamente no aplicativo.',
              'This request expired or is invalid. Start the connection again in the app.',
            ),
          );
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [authorizationId, t]);
  async function decide(approve: boolean) {
    setBusy(true);
    setError('');
    try {
      const redirect = await decideConsent(authorizationId, grants, approve);
      location.assign(safeOAuthRedirect(redirect));
    } catch {
      setError(
        t('Não foi possível concluir a conexão. Inicie um novo pedido no aplicativo.', 'Could not finish the connection. Start a new request in the app.'),
      );
      setBusy(false);
    }
  }
  if (loading) return <p role="status">{t('Carregando pedido de acesso...', 'Loading access request...')}</p>;
  if (!details)
    return (
      <>
        <h1>{t('Pedido de acesso indisponível', 'Access request unavailable')}</h1>
        <p role="alert" className="error-message">
          {error}
        </p>
        <Button asChild variant="outline">
          <a href="/integrations">{t('Ver minhas conexões', 'View my connections')}</a>
        </Button>
      </>
    );
  const clientName = details.client.name || t('Aplicativo', 'App');
  const accountScopes = details.scope
    .split(/\s+/)
    .filter(Boolean)
    .map(
      scope =>
        ({
          openid: t('Identificar sua conta', 'Identify your account'),
          email: t('E-mail', 'Email'),
          profile: t('Perfil básico', 'Basic profile'),
          phone: t('Telefone', 'Phone'),
        })[scope] ?? scope,
    )
    .join(', ');
  return (
    <>
      <div className="client-mark" aria-hidden="true">
        {clientName.slice(0, 1) || 'C'}
      </div>
      <h1>
        {t('Conectar', 'Connect')} {clientName}
      </h1>
      <p className="intro">
        {t(
          'Escolha quais workspaces o aplicativo pode acessar em seu nome. Você pode revogar o acesso a qualquer momento.',
          'Choose the workspaces this app can access on your behalf. You can revoke access at any time.',
        )}
      </p>
      <div className="client-details">
        <span>{t('Aplicativo solicitante', 'Requesting app')}</span>
        <strong>{clientName}</strong>
        <span>{t('Dados da conta solicitados', 'Requested account details')}</span>
        <strong>{accountScopes || t('Nenhum', 'None')}</strong>
      </div>
      <fieldset disabled={busy}>
        <legend>{t('Acesso aos workspaces', 'Workspace access')}</legend>
        {!choices.length ? (
          <p>{t('Você ainda não tem workspaces disponíveis para conectar.', 'You have no available workspaces to connect yet.')}</p>
        ) : (
          choices.map(w => {
            const grant = grants.find(g => g.workspaceId === w.id);
            return (
              <div className="workspace-choice" key={w.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!grant}
                    onChange={e =>
                      setGrants(previous =>
                        e.target.checked ? [...previous, { workspaceId: w.id, capability: 'read' }] : previous.filter(g => g.workspaceId !== w.id),
                      )
                    }
                  />
                  <span>
                    <strong>{w.name}</strong>
                    <small>{w.role === 'guest' ? t('Convidado', 'Guest') : t('Membro', 'Member')}</small>
                  </span>
                </label>
                <select
                  aria-label={`${t('Acesso em', 'Access in')} ${w.name}`}
                  disabled={!grant}
                  value={grant?.capability ?? 'read'}
                  onChange={e =>
                    setGrants(previous => previous.map(g => (g.workspaceId === w.id ? { ...g, capability: e.target.value as 'read' | 'write' } : g)))
                  }
                >
                  <option value="read">{t('Somente leitura', 'Read only')}</option>
                  {w.role !== 'guest' && <option value="write">{t('Leitura e escrita', 'Read and write')}</option>}
                </select>
              </div>
            );
          })
        )}
      </fieldset>
      <p className="permission-note">
        {grants.some(g => g.capability === 'write')
          ? t(
              'Com escrita, o aplicativo pode criar, reservar, editar e concluir tarefas com a autoria desta conexão.',
              'With write access, the app can create, claim, edit and complete tasks as this connection.',
            )
          : t('Somente leitura permite consultar projetos, tarefas e atividades.', 'Read only allows viewing projects, tasks and activity.')}
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="actions">
        <Button variant="outline" disabled={busy} onClick={() => void decide(false)}>
          {t('Recusar', 'Deny')}
        </Button>
        <Button disabled={busy || !grants.length} onClick={() => void decide(true)}>
          {busy ? t('Conectando...', 'Connecting...') : t('Permitir acesso', 'Allow access')}
        </Button>
      </div>
      <p className="footnote">{t('O acesso respeita suas permissões em cada workspace.', 'Access respects your permissions in each workspace.')}</p>
    </>
  );
}
