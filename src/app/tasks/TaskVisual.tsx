import { LABELS } from '../../core/constants.js';
import type { Translate } from '../auth/ConsentPage';
import type { Label } from '../../domain/contracts';
import type { Task } from '../../domain/contracts';
export function TaskStatusIcon({ status, size = 14 }: { status: Task['status']; size?: number }) {
  const color = `var(--st-${status})`;
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" style={{ flexShrink: 0 }}>
      {status === 'done' ? (
        <>
          <circle cx="7" cy="7" r="6.2" fill={color} />
          <path d="M4.4 7.2 6.2 9 9.7 5.3" fill="none" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="7" cy="7" r="5.4" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray={status === 'backlog' ? '1.9 2.1' : undefined} />
          {status === 'progress' && <path d="M7 3.4A3.6 3.6 0 0 1 7 10.6Z" fill={color} />}
          {status === 'review' && <path d="M7 3.4A3.6 3.6 0 1 1 3.4 7L7 7Z" fill={color} />}
        </>
      )}
    </svg>
  );
}
export function TaskPriorityIcon({ priority, size = 14 }: { priority: Task['priority']; size?: number }) {
  const weight = { none: 0, low: 1, medium: 2, high: 3, urgent: 3 }[priority];
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" style={{ flexShrink: 0 }}>
      {priority === 'urgent' ? (
        <>
          <rect x="1" y="1" width="12" height="12" rx="3" fill="var(--red)" />
          <path d="M7 3.8v4" stroke="var(--on-accent)" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="7" cy="10.1" r=".95" fill="var(--on-accent)" />
        </>
      ) : priority === 'none' ? (
        <path d="M2.5 7h2M6 7h2M9.5 7h2" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        [4.5, 7.5, 10.5].map((height, i) => (
          <rect
            key={height}
            x={1.8 + i * 3.9}
            y={12 - height}
            width="2.6"
            height={height}
            rx="1"
            fill={weight > i ? 'var(--text-2)' : 'var(--border-strong)'}
          />
        ))
      )}
    </svg>
  );
}

/** Imported catalog IDs keep their original display names; custom labels retain authored names. */
export function labelVisual(label: Label, t: Translate) {
  const catalog = LABELS.find(item => item.id === label.id);
  const names: Record<string, string> = {
    design: t('Design', 'Design'),
    frontend: t('Frontend', 'Frontend'),
    backend: t('Backend', 'Backend'),
    research: t('Pesquisa', 'Research'),
    content: t('Conteúdo', 'Content'),
    bug: t('Bug', 'Bug'),
    qa: t('QA', 'QA'),
    growth: t('Crescimento', 'Growth'),
  };
  return {
    name: catalog && label.name === label.id ? (names[label.id] ?? label.name) : label.name,
    color: String(label.legacyMetadata.color ?? label.legacyMetadata.c ?? catalog?.c ?? 'var(--blue)'),
  };
}
