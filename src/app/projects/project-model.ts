import type { BatchCommand, Project, Task } from '../../domain/contracts.ts';
import { iso, addD, parse } from '../../core/calendar.js';
export type ProjectDraft = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  teamId: string | null;
  leadUserId: string | null;
  dueDate: string | null;
  template: string;
};
type Translate = (pt: string, en: string) => string;
export const projectStatuses = ['planning', 'active', 'risk', 'hold', 'complete'] as const;
export const projectTemplates = [
  { id: 'blank', name: ['Projeto em branco', 'Blank project'], icon: 'folder', tasks: [] },
  {
    id: 'product',
    name: ['Desenvolvimento de produto', 'Product Development'],
    icon: 'target',
    tasks: [
      ['Definir o problema', 'Define problem statement'],
      ['Plano de pesquisa com usuários', 'User research plan'],
      ['Escrever PRD', 'Write PRD'],
      ['Exploração de design', 'Design exploration'],
      ['Construir MVP', 'Build MVP'],
      ['Lançamento beta', 'Beta launch'],
    ],
  },
  {
    id: 'web',
    name: ['Website', 'Website'],
    icon: 'globe',
    tasks: [
      ['Mapa do site e arquitetura da informação', 'Sitemap & information architecture'],
      ['Wireframes', 'Wireframes'],
      ['Design visual', 'Visual design'],
      ['Construir templates de páginas', 'Build page templates'],
      ['Migração de conteúdo', 'Content migration'],
      ['QA e lançamento', 'QA & launch'],
    ],
  },
  {
    id: 'mkt',
    name: ['Campanha de marketing', 'Marketing Campaign'],
    icon: 'megaphone',
    tasks: [
      ['Briefing da campanha', 'Campaign brief'],
      ['Pesquisa de público', 'Audience research'],
      ['Peças criativas', 'Creative assets'],
      ['Plano de canais', 'Channel plan'],
      ['Lançar campanha', 'Launch campaign'],
      ['Relatório de desempenho', 'Performance report'],
    ],
  },
  {
    id: 'design',
    name: ['Projeto de design', 'Design Project'],
    icon: 'palette',
    tasks: [
      ['Workshop de descoberta', 'Discovery workshop'],
      ['Painel de referências', 'Moodboard'],
      ['Direções de conceito', 'Concept directions'],
      ['Refinamento', 'Refinement'],
      ['Entrega para desenvolvimento', 'Developer handoff'],
    ],
  },
  {
    id: 'software',
    name: ['Desenvolvimento de software', 'Software Development'],
    icon: 'code',
    tasks: [
      ['Especificação técnica', 'Technical spec'],
      ['Configurar repositório e CI', 'Set up repo & CI'],
      ['Implementar API principal', 'Implement core API'],
      ['Escrever testes', 'Write tests'],
      ['Revisão de código', 'Code review'],
      ['Publicar em staging', 'Deploy to staging'],
    ],
  },
  {
    id: 'personal',
    name: ['Projeto pessoal', 'Personal Project'],
    icon: 'heart',
    tasks: [
      ['Listar ideias', 'Brain dump ideas'],
      ['Escolher as 3 prioridades', 'Pick top 3 priorities'],
      ['Agendar tempo de foco', 'Schedule focus time'],
      ['Revisão semanal', 'Weekly review'],
    ],
  },
];
export function projectStatusLabel(status: string, t: Translate) {
  return (
    (
      {
        planning: t('Planejamento', 'Planning'),
        active: t('Em andamento', 'In progress'),
        risk: t('Em risco', 'At risk'),
        hold: t('Em pausa', 'On hold'),
        complete: t('Concluído', 'Complete'),
      } as Record<string, string>
    )[status] ?? status
  );
}
export function makeProjectKey(name: string, projects: Project[]) {
  let key = name
    .split(/\s+/)
    .map(w => w[0] || '')
    .join('')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
  if (key.length < 2)
    key =
      name
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase() || 'PRJ';
  while (projects.some(p => p.key === key)) key += 'X';
  return key;
}
export function assertProjectBatch(commands: BatchCommand[]) {
  if (!commands.length || commands.length > 100) throw Error('batch_limit');
  if (JSON.stringify({ commands }).length > 262144 || new TextEncoder().encode(JSON.stringify({ commands })).length > 262144) throw Error('payload_limit');
  return commands;
}
export function projectPlan(
  draft: ProjectDraft,
  projects: Project[],
  actor: string,
  tasks: Task[],
  copy: Project | undefined,
  today = iso(new Date()),
  t: Translate = (_pt, en) => en,
): BatchCommand[] {
  const commands: BatchCommand[] = [
    {
      operation: 'create_project',
      input: {
        id: draft.id,
        name: draft.name.trim(),
        description: draft.description,
        key: makeProjectKey(draft.name, projects),
        status: 'planning',
        teamId: draft.teamId,
        leadUserId: draft.leadUserId,
        startDate: today,
        dueDate: draft.dueDate || iso(addD(parse(today), 30)),
        sortOrder: Math.min(0, ...projects.map(project => project.sortOrder)) - 1,
        attributes: { icon: draft.icon, color: draft.color, milestones: [] },
      },
    },
  ];
  [...new Set([actor, draft.leadUserId].filter((id): id is string => !!id))].forEach((userId, i) =>
    commands.push({ operation: 'set_project_member', input: { id: draft.id, userId }, expectedVersion: 1 + i }),
  );
  if (copy)
    tasks
      .filter(task => task.projectId === copy.id && !task.archived)
      .forEach(task => {
        if (task.reservation?.active && Date.parse(task.reservation.expiresAt) > Date.now()) throw Error('already_claimed');
        commands.push({ operation: 'duplicate_task_graph', input: { id: task.id, projectId: draft.id, mode: 'project' }, expectedVersion: task.version });
      });
  else
    (projectTemplates.find(x => x.id === draft.template)?.tasks ?? []).forEach(([pt, en], i) =>
      commands.push({
        operation: 'create_task',
        input: {
          id: crypto.randomUUID(),
          projectId: draft.id,
          title: t(pt, en),
          status: i === 0 ? 'todo' : 'backlog',
          priority: i === 0 ? 'high' : 'medium',
          assigneeUserId: i === 0 ? actor : null,
          startDate: iso(addD(parse(today), i * 5)),
          dueDate: iso(addD(parse(today), 5 + i * 5)),
        },
      }),
    );
  return assertProjectBatch(commands);
}
export function editProjectPlan(draft: ProjectDraft, project: Project, members: string[]): BatchCommand[] {
  const commands: BatchCommand[] = [
    {
      operation: 'update_project',
      input: {
        id: project.id,
        name: draft.name.trim(),
        description: draft.description,
        teamId: draft.teamId,
        leadUserId: draft.leadUserId,
        dueDate: draft.dueDate || null,
        attributes: { icon: draft.icon, color: draft.color },
      },
      expectedVersion: project.version,
    },
  ];
  if (draft.leadUserId && !members.includes(draft.leadUserId))
    commands.push({ operation: 'set_project_member', input: { id: project.id, userId: draft.leadUserId }, expectedVersion: project.version + 1 });
  return assertProjectBatch(commands);
}
export function reorderProjects(all: Project[], visibleIds: string[], id: string, direction: number): BatchCommand[] {
  const ordered = [...all].sort((a, b) => a.sortOrder - b.sortOrder),
    visible = ordered.filter(p => visibleIds.includes(p.id)),
    index = visible.findIndex(p => p.id === id),
    other = visible[index + direction];
  if (index < 0 || !other) return [];
  const first = visible[index];
  return assertProjectBatch([
    { operation: 'update_project', input: { id: first.id, sortOrder: other.sortOrder }, expectedVersion: first.version },
    { operation: 'update_project', input: { id: other.id, sortOrder: first.sortOrder }, expectedVersion: other.version },
  ]);
}
