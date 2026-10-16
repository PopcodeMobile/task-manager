import { t } from './i18n.js';
/* ---------- vocab ---------- */
export const STATUSES = [
  {
    id: 'backlog',
    get name() {
      return t('Backlog');
    },
  },
  {
    id: 'todo',
    get name() {
      return t('To Do');
    },
  },
  {
    id: 'progress',
    get name() {
      return t('In Progress');
    },
  },
  {
    id: 'review',
    get name() {
      return t('Review');
    },
  },
  {
    id: 'done',
    get name() {
      return t('Done');
    },
  },
];
export const ST = Object.fromEntries(STATUSES.map(s => [s.id, s]));
export const PRIOS = [
  {
    id: 'urgent',
    get name() {
      return t('Urgent');
    },
    w: 4,
  },
  {
    id: 'high',
    get name() {
      return t('High');
    },
    w: 3,
  },
  {
    id: 'medium',
    get name() {
      return t('Medium');
    },
    w: 2,
  },
  {
    id: 'low',
    get name() {
      return t('Low');
    },
    w: 1,
  },
  {
    id: 'none',
    get name() {
      return t('No priority');
    },
    w: 0,
  },
];
export const PR = Object.fromEntries(PRIOS.map(p => [p.id, p]));
export const LABELS = [
  {
    id: 'design',
    get name() {
      return t('Design');
    },
    c: 'var(--violet)',
  },
  {
    id: 'frontend',
    get name() {
      return t('Frontend');
    },
    c: 'var(--blue)',
  },
  {
    id: 'backend',
    get name() {
      return t('Backend');
    },
    c: 'var(--teal)',
  },
  {
    id: 'research',
    get name() {
      return t('Research');
    },
    c: 'var(--amber)',
  },
  {
    id: 'content',
    get name() {
      return t('Content');
    },
    c: 'var(--rose)',
  },
  {
    id: 'bug',
    get name() {
      return t('Bug');
    },
    c: 'var(--red)',
  },
  {
    id: 'qa',
    get name() {
      return t('QA');
    },
    c: 'var(--green)',
  },
  {
    id: 'growth',
    get name() {
      return t('Growth');
    },
    c: 'var(--orange)',
  },
];
export const LB = Object.fromEntries(LABELS.map(l => [l.id, l]));
export const PSTAT = {
  planning: {
    get name() {
      return t('Planning');
    },
    c: 'var(--gray)',
  },
  active: {
    get name() {
      return t('In Progress');
    },
    c: 'var(--blue)',
  },
  risk: {
    get name() {
      return t('At Risk');
    },
    c: 'var(--red)',
  },
  hold: {
    get name() {
      return t('On Hold');
    },
    c: 'var(--amber)',
  },
  complete: {
    get name() {
      return t('Completed');
    },
    c: 'var(--green)',
  },
};
export const PCOLORS = {
  indigo: '#5A67D8',
  blue: '#3B82C4',
  violet: '#8662C9',
  teal: '#23918A',
  rose: '#C54B78',
  amber: '#C48A1E',
  green: '#3D8E5F',
  slate: '#6B7280',
};
export const PICONS = [
  'globe',
  'smartphone',
  'megaphone',
  'rocket',
  'component',
  'building-2',
  'layout-grid',
  'palette',
  'code',
  'briefcase',
  'target',
  'layers',
  'zap',
  'heart',
  'folder',
  'sparkles',
];
export const ROLES = ['Owner', 'Admin', 'Member', 'Guest'];
export const TEAMS_SEED = [
  { id: 'design', name: 'Design', icon: 'palette', c: '#8662C9', desc: 'Product design, brand, and research' },
  { id: 'eng', name: 'Engineering', icon: 'code', c: '#3B82C4', desc: 'Web, mobile, and platform engineering' },
  { id: 'mkt', name: 'Marketing', icon: 'megaphone', c: '#C54B78', desc: 'Campaigns, content, and growth' },
  { id: 'product', name: 'Product', icon: 'target', c: '#C48A1E', desc: 'Roadmap, planning, and QA' },
];
