import { Check, ChevronsUpDown, Plus, Settings, UserPlus } from 'lucide-react';
import { OrganizationMark } from './OrganizationMark';
import { ShellPopover } from '../design/ShellPopover';
import type { Workspace } from '../../domain/contracts';
import type { Translate } from '../auth/ConsentPage';
export function WorkspacePicker({
  items,
  value,
  onChange,
  onCreate,
  onSettings,
  onInvite,
  t,
}: {
  items: Workspace[];
  value: string;
  onChange: (id: string) => void;
  onCreate: () => void;
  onSettings: () => void;
  onInvite: () => void;
  t: Translate;
}) {
  const current = items.find(item => item.id === value);
  return (
    <ShellPopover
      className="workspace-picker"
      label={t('Alternar organização', 'Switch workspace')}
      menu
      trigger={
        <>
          <span className="brand-symbol" aria-hidden="true" style={current?.id === items[0]?.id ? undefined : { background: current?.color }}>
            <OrganizationMark name={current?.name ?? ''} logoPath={current?.logoPath} brand={current?.id === items[0]?.id} />
          </span>
          <span className="workspace-name">{current?.name ?? t('Organização', 'Workspace')}</span>
          <ChevronsUpDown className="picker-chevrons" size={13} aria-hidden="true" />
        </>
      }
    >
      <div className="popup-heading">{t('Organizações', 'Workspaces')}</div>
      {items.map(workspace => (
        <button
          key={workspace.id}
          role="menuitemradio"
          aria-checked={workspace.id === value}
          aria-label={workspace.name}
          onClick={() => onChange(workspace.id)}
        >
          <span className="workspace-choice-mark" aria-hidden="true" style={workspace.id === items[0]?.id ? undefined : { background: workspace.color }}>
            <OrganizationMark name={workspace.name} logoPath={workspace.logoPath} brand={workspace.id === items[0]?.id} />
          </span>
          <span className="grow">{workspace.name}</span>
          {workspace.id === value && <Check size={14} />}
        </button>
      ))}
      <div className="popup-divider" />
      <button role="menuitem" onClick={onCreate}>
        <Plus size={15} />
        {t('Criar organização', 'Create workspace')}
      </button>
      <button role="menuitem" onClick={onSettings}>
        <Settings size={15} />
        {t('Configurações da organização', 'Workspace settings')}
      </button>
      <button role="menuitem" onClick={onInvite}>
        <UserPlus size={15} />
        {t('Convidar membros', 'Invite members')}
      </button>
    </ShellPopover>
  );
}
