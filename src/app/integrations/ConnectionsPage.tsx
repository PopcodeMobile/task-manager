import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import { rpc, supabase, type Connection } from './client';
import type { Translate } from '../auth/ConsentPage';
export function ConnectionsPage({ t }: { t: Translate }) {
  const [connections, setConnections] = useState<Connection[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    rpc<{ items: Connection[] }>('list_integration_connections')
      .then(data => {
        if (alive) setConnections(data.items);
      })
      .catch(() => {
        if (alive) setError(t('Não foi possível carregar as conexões. Recarregue a página.', 'Could not load connections. Reload the page.'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [t]);
  async function revoke(id: string) {
    setBusy(id);
    setError('');
    try {
      await rpc('revoke_integration_connection', { p_connection_id: id });
      const connection = connections.find(c => c.id === id);
      if (connection) await supabase?.auth.oauth.revokeGrant({ clientId: connection.clientId });
      setConnections(rows => rows.map(c => (c.id === id ? { ...c, status: 'revoked' } : c)));
    } catch {
      setError(t('Não foi possível revogar. Tente novamente.', 'Could not revoke access. Try again.'));
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <h1>{t('Suas conexões', 'Your connections')}</h1>
      <p className="intro">
        {t(
          'Veja o acesso dos aplicativos aos seus workspaces. Revogar uma conexão bloqueia novas consultas e alterações.',
          'Review app access to your workspaces. Revoking a connection blocks new reads and changes.',
        )}
      </p>
      {loading && <p role="status">{t('Carregando conexões...', 'Loading connections...')}</p>}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!loading && !error && !connections.length && (
        <div className="empty-state">
          <h2>{t('Nenhum aplicativo conectado', 'No connected apps')}</h2>
          <p>
            {t(
              'Inicie uma conexão pelo aplicativo que você quer usar. O pedido de acesso aparece aqui no Gr8r.',
              'Start a connection from the app you want to use. Its access request will appear here in Gr8r.',
            )}
          </p>
        </div>
      )}
      <div className="connections">
        {connections.map(c => (
          <article key={c.id} className="connection-row">
            <div className="connection-heading">
              <h2>{c.clientName}</h2>
              <span className="connection-status">
                {c.status === 'active' ? t('Conectado', 'Connected') : c.status === 'pending' ? t('Pendente', 'Pending') : t('Revogado', 'Revoked')}
              </span>
            </div>
            <ul>
              {c.grants.map(g => (
                <li key={g.workspaceId}>
                  {g.workspaceName}
                  <span>{g.capability === 'write' ? t('Leitura e escrita', 'Read and write') : t('Somente leitura', 'Read only')}</span>
                </li>
              ))}
            </ul>
            {c.status !== 'revoked' && (
              <Button variant="outline" disabled={busy === c.id} onClick={() => void revoke(c.id)}>
                {busy === c.id ? t('Revogando...', 'Revoking...') : t('Revogar acesso', 'Revoke access')}
              </Button>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
