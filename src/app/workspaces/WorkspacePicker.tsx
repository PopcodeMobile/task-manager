import type { Workspace } from '../../domain/contracts';
import type { Translate } from '../auth/ConsentPage';
export function WorkspacePicker({ items, value, onChange, t }: { items: Workspace[]; value: string; onChange: (id: string) => void; t: Translate }) {
  return (
    <label className="workspace-picker">
      <span className="brand-symbol" aria-hidden="true">
        g.
      </span>
      <span className="sr-only">{t('Organização', 'Workspace')}</span>
      <select aria-label={t('Organização', 'Workspace')} value={value} onChange={e => onChange(e.target.value)}>
        {items.map(w => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}
