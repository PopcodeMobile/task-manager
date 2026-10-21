import { Check, Minus } from 'lucide-react';
import type { PanelProps } from './types';
/** Describes effective panel capabilities; unavailable remote services are never implied. */
export function PermissionMatrix({ t, repo }: Pick<PanelProps, 't' | 'repo'>) {
  const local = repo.mode === 'local';
  const rows: [string, boolean[] | null][] = [
    [t('Ver projetos e tarefas', 'View projects & tasks'), [true, true, true, true]],
    [t('Comentar nas tarefas', 'Comment on tasks'), [true, true, true, false]],
    [t('Criar e editar tarefas', 'Create and edit tasks'), [true, true, true, false]],
    [t('Criar projetos', 'Create projects'), [true, true, true, false]],
    [t('Convidar membros', 'Invite members'), local ? [true, true, true, false] : null],
    [t('Gerenciar papéis', 'Manage roles'), local ? [true, true, true, false] : null],
    [t('Configurações do espaço', 'Workspace settings'), [true, true, false, false]],
    [t('Gerenciar tokens de agentes', 'Manage agent tokens'), local ? null : [true, true, false, false]],
    [t('Cobrança', 'Billing'), null],
    [t('Excluir espaço', 'Delete workspace'), null],
  ];
  return (
    <div className="panel permission-table">
      <table className="perm-t">
        <thead>
          <tr>
            <th>{t('Permissão', 'Permission')}</th>
            {[t('Proprietário', 'Owner'), t('Admin', 'Admin'), t('Membro', 'Member'), t('Convidado', 'Guest')].map(role => (
              <th key={role}>{role}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, values]) => (
            <tr key={label}>
              <td>{label}</td>
              {[0, 1, 2, 3].map(index => (
                <td key={index}>
                  {values === null ? (
                    <span className="faint" aria-label={t('Indisponível neste painel', 'Unavailable in this panel')}>
                      —
                    </span>
                  ) : values[index] ? (
                    <span className="permission-allowed" aria-label={t('Permitido', 'Allowed')}>
                      <Check size={15} />
                    </span>
                  ) : (
                    <span className="faint" aria-label={t('Não permitido', 'Not allowed')}>
                      <Minus size={15} />
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
