import { useRef, useState } from 'react';
import type { Project } from '../../domain/contracts';
import type { Snapshot } from '../shell/useWorkspaceData';
import type { Translate } from '../auth/ConsentPage';
import type { WorkspaceRepository } from '../../workspace/repository';
import type { Execute } from './ProjectsPage';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { projectError } from './ProjectEditor';
const permissions = ['Can view', 'Can comment', 'Can edit', 'Full access'];
export function ProjectSharing({
  project,
  snapshot,
  repo,
  execute,
  t,
  close,
  opener,
  readOnly,
}: {
  project: Project;
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
        closeLabel={t('Fechar painel', 'Close panel')}
        onCloseAutoFocus={e => {
          e.preventDefault();
          if (!repo.controller.signal.aborted && trigger.current?.isConnected) trigger.current.focus();
        }}
      >
        <SheetTitle>{t('Membros do projeto', 'Project members')}</SheetTitle>
        <SheetDescription>
          {repo.mode === 'local'
            ? t(
                'Demonstração local. Nenhum e-mail é enviado; permissões e acesso ficam neste dispositivo.',
                'Local demonstration. No email is sent; permissions and access stay on this device.',
              )
            : t(
                'Selecione pessoas que já pertencem à organização. Esta lista não altera permissões de acesso; convites e privacidade por projeto não estão disponíveis.',
                'Select existing workspace members. This list does not change access permissions; invitations and project privacy are unavailable.',
              )}
        </SheetDescription>
        <ul className="project-members-list">
          {snapshot.members
            .filter(m => members.includes(m.user_id))
            .map(member => (
              <li key={member.user_id}>
                <span>
                  {member.name}
                  <small>{member.email}</small>
                </span>
                {member.user_id === project.leadUserId ? (
                  <small>{t('Líder', 'Lead')}</small>
                ) : (
                  <>
                    {repo.mode === 'local' && (
                      <select
                        disabled={busy || readOnly}
                        aria-label={t('Permissão de ', 'Permission for ') + member.name}
                        value={String(
                          (project.legacyMetadata.perms as Record<string, string> | undefined)?.[member.user_id] ??
                            (member.role === 'guest' ? 'Can comment' : 'Can edit'),
                        )}
                        onChange={e => void run('local_project_sharing', { userId: member.user_id, permission: e.target.value })}
                      >
                        {permissions.map(p => (
                          <option key={p} value={p}>
                            {label(p)}
                          </option>
                        ))}
                      </select>
                    )}
                    <Button variant="ghost" disabled={busy || readOnly} onClick={() => void run('remove_project_member', { userId: member.user_id })}>
                      {t('Remover', 'Remove')}
                    </Button>
                  </>
                )}
              </li>
            ))}
        </ul>
        <label className="form-field">
          {t('Adicionar membro existente', 'Add existing member')}
          <select
            value=""
            disabled={busy || readOnly}
            onChange={e => {
              if (e.target.value) void run('set_project_member', { userId: e.target.value });
            }}
          >
            <option value="">{t('Selecionar pessoa', 'Select person')}</option>
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
          <>
            <form
              onSubmit={e => {
                e.preventDefault();
                void run('local_project_sharing', { email: email.trim(), permission });
              }}
            >
              <label className="form-field">
                {t('E-mail da demonstração', 'Demo email')}
                <Input type="email" required maxLength={254} value={email} disabled={busy || readOnly} onChange={e => setEmail(e.target.value)} />
              </label>
              <label className="form-field">
                {t('Permissão local', 'Local permission')}
                <select value={permission} onChange={e => setPermission(e.target.value)}>
                  {permissions.map(p => (
                    <option key={p} value={p}>
                      {label(p)}
                    </option>
                  ))}
                </select>
              </label>
              <Button disabled={busy || readOnly} type="submit">
                {t('Adicionar convite local', 'Add local invitation')}
              </Button>
            </form>
            <label className="form-field">
              {t('Acesso geral local', 'Local general access')}
              <select
                disabled={busy || readOnly}
                value={String(project.legacyMetadata.access ?? 'workspace')}
                onChange={e => void run('local_project_sharing', { access: e.target.value })}
              >
                <option value="workspace">{t('Toda a organização', 'Everyone in workspace')}</option>
                <option value="private">{t('Somente convidados', 'Only invited people')}</option>
              </select>
            </label>
          </>
        )}
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
