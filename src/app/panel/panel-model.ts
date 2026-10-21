import type { BatchCommand, Team } from '../../domain/contracts';
export type TeamRelation = { teamId: string; userId: string };
export type TeamDraft = { id: string; name: string; description: string; icon: string; color: string; members: string[] };
/** One atomic replacement, including removals from other teams. Versions advance per child. */
export function teamCommands(draft: TeamDraft, teams: Team[], relations: TeamRelation[]): BatchCommand[] {
  const existing = teams.find(t => t.id === draft.id);
  const versions = new Map(teams.map(t => [t.id, t.version]));
  const commands: BatchCommand[] = [];
  const add = (operation: string, input: BatchCommand['input'], id: string) => {
    commands.push({ operation, input, expectedVersion: versions.get(id) });
    versions.set(id, (versions.get(id) ?? 0) + 1);
  };
  const input = { id: draft.id, name: draft.name, description: draft.description, attributes: { icon: draft.icon, color: draft.color } };
  if (existing) add('update_team', input, draft.id);
  else {
    commands.push({ operation: 'create_team', input });
    versions.set(draft.id, 1);
  }
  for (const relation of relations)
    if ((relation.teamId === draft.id && !draft.members.includes(relation.userId)) || (relation.teamId !== draft.id && draft.members.includes(relation.userId)))
      add('remove_team_member', { id: relation.teamId, userId: relation.userId }, relation.teamId);
  for (const userId of new Set(draft.members))
    if (!relations.some(r => r.teamId === draft.id && r.userId === userId)) add('set_team_member', { id: draft.id, userId }, draft.id);
  if (commands.length > 100) throw Error('batch_limit');
  if (new TextEncoder().encode(JSON.stringify({ commands })).length > 262144) throw Error('payload_limit');
  return commands;
}
export const readStates = (existing: Record<string, boolean>, ids: string[], read: boolean) => ({
  ...existing,
  ...Object.fromEntries(ids.map(id => [id, read])),
});
export const weekStartsOn = (value: unknown) => ([0, 1, 6].includes(Number(value)) ? Number(value) : 1);
export const defaultProjectTab = (prefs: Record<string, unknown>) =>
  ['board', 'list', 'table', 'overview', 'timeline'].includes(String(prefs.defaultTab)) ? String(prefs.defaultTab) : 'board';
export function preferredDate(value: string | null, prefs: Record<string, unknown>, locale: string, long = false) {
  if (!value) return '';
  const date = new Date(value.length === 10 ? value + 'T12:00:00' : value);
  if (Number.isNaN(date.valueOf())) return value;
  const d = date.getDate(),
    m = date.getMonth() + 1,
    y = date.getFullYear();
  if (prefs.dateFmt === 'yyyy-MM-dd') return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (prefs.dateFmt === 'd/M') return `${d}/${m}${long ? '/' + y : ''}`;
  if (prefs.dateFmt === 'M/d') return `${m}/${d}${long ? '/' + y : ''}`;
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', ...(long ? { year: 'numeric' as const } : {}) }).format(date);
}
/** Reuse the local project visibility boundary for aggregate routes, including archived entities. */
export function visiblePanelSnapshot(s: import('../shell/useWorkspaceData').Snapshot, local: boolean) {
  const projects = s.projects.filter(
    project => !local || !project.legacyMetadata.private || s.projectMembers.some(link => link.projectId === project.id && link.userId === s.actorId),
  );
  const allowed = new Set(projects.map(project => project.id)),
    tasks = s.tasks.filter(task => allowed.has(task.projectId)),
    taskIds = new Set(tasks.map(task => task.id));
  const visible = (projectId: string | null, taskId: string | null) => (!projectId || allowed.has(projectId)) && (!taskId || taskIds.has(taskId));
  return {
    ...s,
    projects,
    tasks,
    files: s.files.filter(file => visible(file.projectId, file.taskId)),
    comments: s.comments.filter(comment => taskIds.has(comment.taskId)),
    notifications: s.notifications.filter(n => visible(n.projectId, n.taskId)),
    activity: s.activity.filter(entry => visible(entry.projectId, entry.taskId)),
    events: s.events.filter(event => {
      const hiddenProject = s.projects.some(project => project.id === event.entityId && !allowed.has(project.id)),
        hiddenTask = s.tasks.some(task => task.id === event.entityId && !taskIds.has(task.id));
      return !hiddenProject && !hiddenTask && visible(event.payload.projectId ?? null, event.payload.taskId ?? null);
    }),
  };
}

export function notificationDay(value: unknown) {
  const date = new Date(typeof value === 'number' ? value : String(value));
  return Number.isNaN(date.valueOf()) ? '' : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
