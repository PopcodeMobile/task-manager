import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import type { Translate } from '../auth/ConsentPage';
import { errorMessage } from '../shell/messages';
import type { WorkspaceRepository } from '../../workspace/repository';
import { acceptInvitation, listReceivedInvitations, type ReceivedInvitation } from './invitations';

const dismissedKey = 'kairos-dismissed-invitations';
function dismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(dismissedKey) ?? '[]');
  } catch {
    return [];
  }
}

/** Invitations addressed to the signed-in confirmed email. Accepting is always an explicit click. */
export function PendingInvitations({ repo, t, accepted }: { repo: WorkspaceRepository; t: Translate; accepted: (workspaceId: string) => Promise<void> }) {
  const [items, setItems] = useState<ReceivedInvitation[]>([]),
    [hidden, setHidden] = useState(dismissed),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    listReceivedInvitations(repo)
      .then(rows => alive && setItems(rows))
      .catch(() => {
        /* Invitations are optional; the workspace keeps working without them. */
      });
    return () => {
      alive = false;
    };
  }, [repo]);
  const shown = items.filter(item => !hidden.includes(item.id));
  if (!shown.length) return null;
  const roleName = (value: string) => ({ admin: 'Admin', member: t('Membro', 'Member'), guest: t('Convidado', 'Guest') })[value] ?? value;
  return (
    <section className="invitation-banner" aria-label={t('Convites recebidos', 'Received invitations')}>
      {shown.map(item => (
        <div key={item.id} className="row">
          <p className="grow">
            {t(
              `${item.inviterName} convidou você para ${item.workspaceName} como ${roleName(item.role)}.`,
              `${item.inviterName} invited you to ${item.workspaceName} as ${roleName(item.role)}.`,
            )}
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              const next = [...hidden, item.id];
              setHidden(next);
              try {
                sessionStorage.setItem(dismissedKey, JSON.stringify(next));
              } catch {
                /* Dismissal is a per-tab convenience only. */
              }
            }}
          >
            {t('Agora não', 'Not now')}
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const workspaceId = await acceptInvitation(repo, item.id);
                setItems(rows => rows.filter(row => row.id !== item.id));
                await accepted(workspaceId);
              } catch (e) {
                setError(errorMessage(e, t));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t(`Aceitar convite para ${item.workspaceName}`, `Accept invitation to ${item.workspaceName}`)}
          </Button>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
