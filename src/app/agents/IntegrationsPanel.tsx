import { AgentTokensPanel } from './AgentTokensPanel';
import type { Member } from '../../workspace/normalized';
import type { WorkspaceRepository } from '../../workspace/repository';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import type { Connection } from '../integrations/client';
import type { Translate } from '../auth/ConsentPage';
import { errorMessage } from '../shell/messages';
type Subscription = {
  id: string;
  connectionId: string;
  agentId: string;
  targetUrl: string;
  eventTypes: string[];
  filterExecutor: boolean;
  enabled: boolean;
  active: boolean;
};
type Delivery = { id: string; state: string; attempt: number; lastCategory: string; lastStatus: number | null; createdAt: string };
export function IntegrationsPanel({ repo, t, admin, members }: { repo: WorkspaceRepository; t: Translate; admin: boolean; members?: Member[] }) {
  const [connections, setConnections] = useState<Connection[]>([]),
    [subscriptions, setSubscriptions] = useState<Subscription[]>([]),
    [deliveries, setDeliveries] = useState<Delivery[]>([]),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all([
      repo.rpc<{ items: Connection[] }>('list_integration_connections'),
      admin ? repo.rpc<Subscription[]>('list_webhook_subscriptions', { p_workspace_id: repo.workspaceId }) : Promise.resolve([]),
    ])
      .then(([c, s]) => {
        if (alive) {
          setConnections(c.items.filter(item => item.grants.some(g => g.workspaceId === repo.workspaceId)));
          setSubscriptions(s);
          setLoaded(true);
        }
      })
      .catch(err => {
        if (alive) setError(errorMessage(err, t));
      });
    return () => {
      alive = false;
    };
  }, [repo, t, admin]);
  async function action(run: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await run();
    } catch (err) {
      if (!repo.controller.signal.aborted) setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }
  async function deliveryList(id: string) {
    const rows = await repo.rpc<Delivery[]>('list_webhook_deliveries', { p_workspace_id: repo.workspaceId, p_subscription_id: id, p_limit: 100 });
    setDeliveries(rows);
    setSelected(id);
  }
  return (
    <>
      <AgentTokensPanel repo={repo} t={t} admin={admin} members={members} />
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!loaded && !error && <p role="status">{t('Carregando conexões...', 'Loading connections...')}</p>}
      <h2>{t('Aplicativos desta organização', 'Apps in this workspace')}</h2>
      <p className="permission-note">
        {t(
          'Revogar uma conexão encerra o acesso desse aplicativo a todas as suas organizações.',
          'Revoking a connection ends this app’s access to all your workspaces.',
        )}
      </p>
      {connections.map(connection => (
        <article className="connection-row" key={connection.id}>
          <div className="connection-heading">
            <strong>{connection.clientName}</strong>
            <span>
              {connection.status === 'active'
                ? t('Conectado', 'Connected')
                : connection.status === 'revoked'
                  ? t('Revogado', 'Revoked')
                  : t('Pendente', 'Pending')}
            </span>
          </div>
          <p>
            {connection.grants
              .filter(g => g.workspaceId === repo.workspaceId)
              .map(g => (g.capability === 'write' ? t('Leitura e escrita', 'Read and write') : t('Somente leitura', 'Read only')))
              .join(', ')}
          </p>
          {connection.status !== 'revoked' && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await repo.rpc('revoke_integration_connection', { p_connection_id: connection.id });
                  setConnections(rows => rows.map(c => (c.id === connection.id ? { ...c, status: 'revoked' } : c)));
                  setSubscriptions(rows => rows.map(s => (s.connectionId === connection.id ? { ...s, active: false } : s)));
                })
              }
            >
              {t('Revogar acesso', 'Revoke access')}
            </Button>
          )}
        </article>
      ))}
      {loaded && !connections.length && (
        <p className="permission-note">{t('Nenhum aplicativo conectado a esta organização.', 'No apps connected to this workspace.')}</p>
      )}
      {admin && (
        <>
          <h2>{t('Entrega de eventos', 'Event delivery')}</h2>
          {subscriptions.map(sub => (
            <article className="connection-row" key={sub.id}>
              <div className="connection-heading">
                <strong>{new URL(sub.targetUrl).hostname}</strong>
                <span>{sub.active && sub.enabled ? t('Ativo', 'Active') : t('Pausado', 'Paused')}</span>
              </div>
              <p>{sub.eventTypes.join(', ')}</p>
              <div className="button-row">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await repo.rpc('configure_webhook_subscription', {
                        p_workspace_id: repo.workspaceId,
                        p_subscription_id: sub.id,
                        p_enabled: !sub.enabled,
                        p_event_types: sub.eventTypes,
                        p_filter_executor: sub.filterExecutor,
                      });
                      setSubscriptions(rows => rows.map(s => (s.id === sub.id ? { ...s, enabled: !s.enabled } : s)));
                    })
                  }
                >
                  {sub.enabled ? t('Pausar entregas', 'Pause deliveries') : t('Ativar entregas', 'Enable deliveries')}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => void action(() => deliveryList(sub.id))}>
                  {t('Ver entregas', 'View deliveries')}
                </Button>
              </div>
            </article>
          ))}
          {loaded && !subscriptions.length && (
            <p className="permission-note">
              {t(
                'Nenhuma entrega configurada. O destino e o segredo são provisionados fora do navegador.',
                'No deliveries configured. Targets and secrets are provisioned outside the browser.',
              )}
            </p>
          )}
          {selected && (
            <div className="delivery-list">
              <h3>{t('Últimas 100 entregas', 'Latest 100 deliveries')}</h3>
              {deliveries.map(d => (
                <article key={d.id}>
                  <span>
                    {d.state} · {d.lastCategory ?? t('Aguardando', 'Waiting')} · {d.attempt}
                  </span>
                  {['failed'].includes(d.state) && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await repo.rpc('retry_webhook_delivery', { p_workspace_id: repo.workspaceId, p_delivery_id: d.id });
                          await deliveryList(selected);
                        })
                      }
                    >
                      {t('Reenviar evento', 'Retry event')}
                    </Button>
                  )}
                </article>
              ))}
              {!deliveries.length && <p>{t('Nenhuma entrega registrada.', 'No recorded deliveries.')}</p>}
            </div>
          )}
        </>
      )}
    </>
  );
}
