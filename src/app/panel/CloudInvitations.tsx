import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { errorMessage } from '../shell/messages';
import type { PanelProps } from './types';
import { inviteLink, listInvitations, revokeInvitation, sendInvitation, type Invitation, type InvitationRole } from './invitations';

/** Cloud invitations: the database decides who may invite which role; this form only mirrors it. */
export function CloudInvitations({ p, close }: { p: PanelProps; close: () => void }) {
  const { t } = p;
  const owner = p.workspace.role === 'owner';
  const [email, setEmail] = useState(''),
    [role, setRole] = useState<InvitationRole>('member'),
    [items, setItems] = useState<Invitation[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [copied, setCopied] = useState(false);
  const roleName = (value: string) => ({ admin: 'Admin', member: t('Membro', 'Member'), guest: t('Convidado', 'Guest') })[value] ?? value;
  useEffect(() => {
    if (!p.admin) return;
    let alive = true;
    listInvitations(p.repo)
      .then(rows => alive && setItems(rows))
      .catch(e => alive && setError(errorMessage(e, t)));
    return () => {
      alive = false;
    };
  }, [p.repo, p.admin, t]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    setCopied(false);
    try {
      await fn();
    } catch (e) {
      if (!p.repo.controller.signal.aborted) setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  if (!p.admin)
    return (
      <>
        <p className="hint">{t('Somente proprietários e administradores podem convidar pessoas.', 'Only owners and admins can invite people.')}</p>
        <div className="modal-f">
          <span className="sp" />
          <Button type="button" variant="outline" onClick={close}>
            {t('Fechar', 'Close')}
          </Button>
        </div>
      </>
    );
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        void run(async () => {
          const sent = await sendInvitation(p.repo, email, role);
          setItems(rows => [...rows.filter(row => row.id !== sent.invitation.id), sent.invitation]);
          setEmail('');
          setNotice(
            sent.emailSent
              ? t(`Convite enviado para ${sent.invitation.email}.`, `Invitation sent to ${sent.invitation.email}.`)
              : t(
                  'Convite criado, mas o e-mail não foi enviado. Copie o link e mande para a pessoa.',
                  'Invitation created, but the email was not sent. Copy the link and share it.',
                ),
          );
        });
      }}
    >
      <label className="form-field">
        Email
        <Input type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
      </label>
      <div className="row invitation-options">
        <label className="field grow">
          {t('Papel', 'Role')}
          <select className="select" value={role} onChange={e => setRole(e.target.value as InvitationRole)}>
            {owner && <option value="admin">Admin</option>}
            <option value="member">{t('Membro', 'Member')}</option>
            <option value="guest">{t('Convidado', 'Guest')}</option>
          </select>
        </label>
      </div>
      <p className="hint">
        {t(
          'A pessoa entra ou cria a conta com este e-mail e aceita o convite. Ele vale por 7 dias.',
          'The person signs in or signs up with this email and accepts. It is valid for 7 days.',
        )}
      </p>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {items.length > 0 && (
        <ul className="invitation-list" aria-label={t('Convites pendentes', 'Pending invitations')}>
          {items.map(item => (
            <li key={item.id} className="row">
              <span className="grow">
                {item.email} · {roleName(item.role)} ·{' '}
                {item.status === 'expired'
                  ? t('Expirado', 'Expired')
                  : t(`Até ${new Date(item.expiresAt).toLocaleDateString('pt-BR')}`, `Until ${new Date(item.expiresAt).toLocaleDateString('en-US')}`)}
              </span>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                aria-label={t(`Revogar convite de ${item.email}`, `Revoke invitation for ${item.email}`)}
                onClick={() =>
                  void run(async () => {
                    await revokeInvitation(p.repo, item.id);
                    setItems(rows => rows.filter(row => row.id !== item.id));
                  })
                }
              >
                {t('Revogar', 'Revoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="modal-f">
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            void navigator.clipboard
              .writeText(inviteLink())
              .then(() => setCopied(true))
              .catch(() => setError(t('Não foi possível copiar o link.', 'Could not copy the link.')))
          }
        >
          {copied ? t('Link copiado', 'Link copied') : t('Copiar link do convite', 'Copy invite link')}
        </Button>
        <span className="sp" />
        <Button type="button" variant="outline" onClick={close}>
          {t('Cancelar', 'Cancel')}
        </Button>
        <Button disabled={busy}>{t('Enviar convite', 'Send invitation')}</Button>
      </div>
    </form>
  );
}
