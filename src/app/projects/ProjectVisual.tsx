import type { CSSProperties } from 'react';
import { User } from 'lucide-react';
import type { Project } from '../../domain/contracts';
import type { Member } from '../../workspace/normalized';
import type { Translate } from '../auth/ConsentPage';
import { PCOLORS } from '../../core/constants.js';
import { projectStatusLabel } from './project-model';

export const projectTone = (project: Project) => {
  const color = String(project.legacyMetadata.color ?? 'blue');
  return (PCOLORS as Record<string, string>)[color] ?? 'var(--accent)';
};
export const taskKeyTone = (task: { projectId?: string | null }, projects: Project[]) => {
  const project = projects.find(item => item.id === task.projectId);
  return project ? projectTone(project) : 'var(--accent)';
};
export function ProjectStatus({ status, t }: { status: Project['status']; t: Translate }) {
  const tone = { planning: 'gray', active: 'blue', risk: 'red', hold: 'amber', complete: 'green' }[status];
  return (
    <span className="pstatus" style={{ '--c': `var(--${tone})` } as CSSProperties}>
      <i />
      {projectStatusLabel(status, t)}
    </span>
  );
}
const MEMBER_TONES: Record<string, string> = {
  indigo: 'var(--accent-indigo)',
  blue: 'var(--blue)',
  violet: 'var(--violet)',
  teal: 'var(--teal)',
  rose: 'var(--rose)',
  amber: 'var(--amber)',
  green: 'var(--green)',
};
// Cloud members carry no profile color, so derive a stable tone from the user id.
export const memberTone = (member?: Pick<Member, 'user_id' | 'color'>) => {
  if (!member) return 'var(--gray)';
  if (member.color) return member.color === 'slate' ? 'var(--gray)' : (MEMBER_TONES[member.color] ?? member.color);
  const tones = Object.values(MEMBER_TONES);
  let hash = 0;
  for (const char of member.user_id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return tones[hash % tones.length];
};
export function MemberAvatar({ member, size = 'sm' }: { member?: Member; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`av ${size}${member ? '' : ' empty'}`}
      style={{ '--c': memberTone(member) } as CSSProperties}
      aria-label={member?.name}
      title={member?.name}
    >
      {member ? (
        member.name
          .split(' ')
          .map(part => part[0])
          .join('')
          .slice(0, 2)
      ) : (
        <User size={11} />
      )}
    </span>
  );
}
export function MemberStack({ ids, members, max = 3, size = 'sm' }: { ids: string[]; members: Member[]; max?: number; size?: 'sm' | 'md' }) {
  return (
    <span className="avs avstack">
      {ids.slice(0, max).map(id => (
        <MemberAvatar key={id} member={members.find(m => m.user_id === id)} size={size} />
      ))}
      {ids.length > max && (
        <span className={`av ${size} more`} style={{ '--c': 'var(--gray)' } as CSSProperties}>
          +{ids.length - max}
        </span>
      )}
    </span>
  );
}
export function ProjectProgress({ value, name, tone = '' }: { value: number; name: string; tone?: string }) {
  return (
    <span className={`prog ${tone}`} role="progressbar" aria-label={name} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ '--p': value / 100 } as CSSProperties} />
    </span>
  );
}
