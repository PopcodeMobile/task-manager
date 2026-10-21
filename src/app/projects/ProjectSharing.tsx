import { useRef, useState } from 'react';
import type { Project } from '../../domain/contracts';
import type { Snapshot } from '../shell/useWorkspaceData';
import type { Translate } from '../auth/ConsentPage';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Execute } from './ProjectsPage';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { MemberAvatar } from './ProjectVisual';
import { projectError } from './ProjectEditor';
import { Building2, Link2, Lock } from 'lucide-react';
const permissions = ['Can view', 'Can comment', 'Can edit', 'Full access'];
export function ProjectSharing({
  project,
  projectUrl,
  snapshot,
  repo,
  execute,
  t,
  close,
  opener,
  readOnly,
}: {
  project: Project;
  projectUrl: string;
  snapshot: Snapshot;
  repo: WorkspaceRepository;
  execute: Execute;
  t: Translate;
  close: () => void;
  opener: HTMLElement | null;
  readOnly: boolean;
}) {
  const trigger = useRef(opener),
    [email, setEmail] = useState(''),
    [permission, setPermission] = useState('Can edit'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const members = snapshot.projectMembers.filter(m => m.projectId === project.id).map(m => m.userId);
  async function run(operation: string, input: Record<string, unknown>) {
    if (busy || readOnly) return;
    setBusy(true);
    setError('');
    try {
      await execute(operation, { id: project.id, ...input }, project.version);
      if (!repo.controller.signal.aborted) {
        setEmail('');
        setNotice(
          repo.mode === 'local'
            ? t('Alteração salva apenas neste dispositivo.', 'Change saved only on this device.')
            : t('Membros do projeto atualizados.', 'Project members updated.'),
        );
      }
    } catch (err) {
      if (!repo.controller.signal.aborted) setError(projectError(err, t));
    } finally {
      setBusy(false);
    }
  }
  const label = (permission: string) =>
    ({
      'Can view': t('Pode visualizar', 'Can view'),
      'Can comment': t('Pode comentar', 'Can comment'),
      'Can edit': t('Pode editar', 'Can edit'),
      'Full access': t('Acesso total', 'Full access'),
    })[permission] ?? permission;
  return (
    <Sheet
      open
      onOpenChange={open => {
        if (!open && !busy) close();
      }}
    >
      <SheetContent
        className="project-modal project-sharing-modal"
        closeLabel={t('Fechar painel', 'Close panel')}
        onCloseAutoFocus={e => {
          e.preventDefault();
          if (!repo.controller.signal.aborted && trigger.current?.isConnected) trigger.current.focus();
        }}
      >
        <div className="modal-h">
          <SheetTitle className="sr-only">{t('Membros do projeto', 'Project members')}</SheetTitle>
          <div className="sharing-title" aria-hidden="true">
            {t('Compartilhar', 'Share')} “{project.name}”
          </div>
        </div>
        <div className="modal-b">
          {repo.mode === 'local' && (
            <form
              className="sharing-invite"
              onSubmit={e => {
                e.preventDefault();
                void run('local_project_sharing', { email: email.trim(), permission });
              }}
            >
              <label className="sharing-email">
                <span className="sr-only">{t('E-mail da demonstração', 'Demo email')}</span>
                <Input
                  type="email"
                  placeholder={t('Adicionar pessoa por e-mail', 'Add people by email')}
                  required
                  maxLength={254}
                  value={email}
                  disabled={busy || readOnly}
                  onChange={e => setEmail(e.target.value)}
                />
              </label>
              <select
                aria-label={t('Permissão local', 'Local permission')}
                value={permission}
                disabled={busy || readOnly}
                onChange={e => setPermission(e.target.value)}
              >
                {permissions.map(p => (
                  <option key={p} value={p}>
                    {label(p)}
                  </option>
                ))}
              </select>
              <Button aria-label={t('Adicionar convite local', 'Add local invitation')} disabled={busy || readOnly} type="submit">
                {t('Convidar', 'Invite')}
              </Button>
            </form>
          )}
          <SheetDescription className="sharing-scope">
            {repo.mode === 'local'
              ? t(
                  'Demonstração local. Nenhum e-mail é enviado; permissões e acesso ficam neste dispositivo.',
                  'Local demonstration. No email is sent; permissions and access stay on this device.',
                )
              : t(
                  'Selecione membros existentes. Esta lista não altera permissões; convites e privacidade por projeto não estão disponíveis.',
                  'Select existing members. This list does not change permissions; invitations and project privacy are unavailable.',
                )}
          </SheetDescription>
          <div>
            <div className="sharing-eyebrow">{t('Pessoas com acesso', 'People with access')}</div>
            <ul className="project-members-list">
              {snapshot.members
                .filter(m => members.includes(m.user_id))
                .map(member => (
                  <li key={member.user_id}>
                    <MemberAvatar member={member} size="md" />
                    <span className="sharing-person">
                      <span>
                        {member.name}
                        {member.user_id === snapshot.actorId && <span className="sharing-you"> {t('(você)', '(you)')}</span>}
                      </span>
                      <small>
                        {member.email}
                        {member.user_id === project.leadUserId && ' · ' + t('Líder do projeto', 'Project lead')}
                      </small>
                    </span>
                    {member.user_id === project.leadUserId ? (
                      <small className="sharing-lead">{t('Acesso total', 'Full access')}</small>
                    ) : repo.mode === 'local' ? (
                      <select
                        disabled={busy || readOnly}
                        aria-label={t('Permissão de ', 'Permission for ') + member.name}
                        value={String(
                          (project.legacyMetadata.perms as Record<string, string> | undefined)?.[member.user_id] ??
                            (member.role === 'guest' ? 'Can comment' : 'Can edit'),
                        )}
                        onChange={e =>
                          void run(e.target.value === '__remove' ? 'remove_project_member' : 'local_project_sharing', {
                            userId: member.user_id,
                            ...(e.target.value === '__remove' ? {} : { permission: e.target.value }),
                          })
                        }
                      >
                        {permissions.map(p => (
                          <option key={p} value={p}>
                            {label(p)}
                          </option>
                        ))}
                        <option value="__remove">{t('Remover acesso', 'Remove access')}</option>
                      </select>
                    ) : (
                      <Button variant="ghost" disabled={busy || readOnly} onClick={() => void run('remove_project_member', { userId: member.user_id })}>
                        {t('Remover', 'Remove')}
                      </Button>
                    )}
                  </li>
                ))}
            </ul>
          </div>
          <label className="sharing-existing form-field">
            <span className="sr-only">{t('Adicionar membro existente', 'Add existing member')}</span>
            <select
              value=""
              disabled={busy || readOnly}
              onChange={e => {
                if (e.target.value) void run('set_project_member', { userId: e.target.value });
              }}
            >
              <option value="">{t('Adicionar membro existente', 'Add existing member')}</option>
              {snapshot.members
                .filter(m => !members.includes(m.user_id))
                .map(m => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          {repo.mode === 'local' && (
            <div className="sharing-general">
              <div className="sharing-eyebrow">{t('Acesso geral', 'General access')}</div>
              <div className="sharing-access-row">
                <span className="sharing-access-icon">{project.legacyMetadata.access === 'private' ? <Lock size={14} /> : <Building2 size={14} />}</span>
                <div>
                  <select
                    aria-label={t('Acesso geral local', 'Local general access')}
                    disabled={busy || readOnly}
                    value={String(project.legacyMetadata.access ?? 'workspace')}
                    onChange={e => void run('local_project_sharing', { access: e.target.value })}
                  >
                    <option value="workspace">
                      {t('Todos em', 'Everyone at')} {t('esta organização', 'this workspace')}
                    </option>
                    <option value="private">{t('Somente convidados', 'Only people invited')}</option>
                  </select>
                  <p>
                    {project.legacyMetadata.access === 'private'
                      ? t('Somente as pessoas acima podem abrir este projeto local.', 'Only people listed above can open this local project.')
                      : t('Qualquer pessoa deste espaço local pode visualizar e comentar.', 'Anyone in this local workspace can view and comment.')}
                  </p>
                </div>
              </div>
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </div>
        <div className="modal-f">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                .writeText(projectUrl)
                .then(() => setNotice(t('Link copiado', 'Link copied')))
                .catch(() => setError(t('Não foi possível copiar o link.', 'Could not copy the link.')));
            }}
          >
            <Link2 size={14} aria-hidden="true" />
            {t('Copiar link', 'Copy link')}
          </Button>
          <span className="sp" />
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!busy) close();
            }}
          >
            {t('Concluir', 'Done')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
