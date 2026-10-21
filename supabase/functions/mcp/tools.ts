import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Actor } from '../../../src/domain/contracts.ts';
import { executeCommand, executeQuery } from '../_shared/operations.ts';
import { publicError } from '../_shared/errors.ts';
const workspace = z.string().uuid();
const id = z.string().min(1).max(128);
const paging = { limit: z.number().int().min(1).max(100).optional(), cursor: z.string().max(2000).optional() };
const projectName = z.string().trim().min(1).max(500);
const projectDetails = {
  key: z.string().trim().min(1).max(128).optional(),
  description: z.string().max(100000).optional(),
  status: z.enum(['planning', 'active', 'risk', 'hold', 'complete']).optional(),
  teamId: id.nullable().optional(),
  leadUserId: z.string().uuid().nullable().optional(),
  dueDate: z.string().max(128).nullable().optional(),
  startDate: z.string().max(128).nullable().optional(),
  sortOrder: z.number().optional(),
  attributes: z
    .object({
      icon: z.string().max(128).nullable().optional(),
      color: z.string().max(128).nullable().optional(),
      milestones: z
        .array(z.object({ name: z.string().max(500), date: z.string().max(128) }).strict())
        .max(100)
        .optional(),
    })
    .strict()
    .optional(),
};
const writes = {
  create_project: z.object({ id: id.optional(), name: projectName, ...projectDetails }).strict(),
  update_project: z.object({ id, name: projectName.optional(), ...projectDetails, archived: z.boolean().optional() }).strict(),
  archive_project: z.object({ id }).strict(),
  create_task: z
    .object({
      id: id.optional(),
      projectId: id,
      title: z.string().min(1).max(10000),
      description: z.string().max(100000).optional(),
      priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).optional(),
      dueDate: z.string().optional(),
    })
    .strict(),
  update_task: z
    .object({
      id,
      title: z.string().min(1).max(10000).optional(),
      description: z.string().max(100000).optional(),
      status: z.enum(['backlog', 'todo', 'progress', 'review']).optional(),
      priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).optional(),
      dueDate: z.string().nullable().optional(),
      claimToken: z.string().uuid(),
    })
    .strict(),
  claim_task: z.object({ id }).strict(),
  renew_task_claim: z
    .object({
      id,
      claimToken: z.string().uuid(),
      executionState: z.enum(['running', 'blocked']).optional(),
      blockingReason: z.string().trim().min(1).max(2000).optional(),
    })
    .strict(),
  release_task_claim: z.object({ id, claimToken: z.string().uuid() }).strict(),
  add_task_comment: z.object({ taskId: id, body: z.string().min(1).max(100000) }).strict(),
  complete_task: z.object({ id, claimToken: z.string().uuid() }).strict(),
};
/** Every tool closes over a server-authenticated actor. No actor or executor is accepted as input. */
export function taskServer(actor: Actor): McpServer {
  const server = new McpServer({ name: 'gr8r-tasks', version: '1.0.0' });
  const result = async (run: () => Promise<unknown>) => {
    try {
      const data = await run();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
        structuredContent: data as Record<string, unknown>,
      };
    } catch (error) {
      const safe = publicError(error);
      return {
        isError: true,
        content: [{ type: 'text' as const, text: safe.message }],
        structuredContent: { error: { code: safe.code, message: safe.message, requestId: crypto.randomUUID() } },
      };
    }
  };
  server.registerTool(
    'list_workspaces',
    {
      description: 'List only workspaces currently granted to this connection.',
      inputSchema: z.object(paging).strict(),
      annotations: { readOnlyHint: true },
    },
    args => result(() => executeQuery(actor, 'list_workspaces', null, args)),
  );
  for (const operation of ['list_projects', 'list_tasks'] as const) {
    server.registerTool(
      operation,
      {
        description: `${operation.replaceAll('_', ' ')} in an explicitly granted workspace. Use nextCursor for another page.`,
        inputSchema: z
          .object({
            workspace_id: workspace,
            ...paging,
            projectId: id.optional(),
            status: z.enum(['backlog', 'todo', 'progress', 'review', 'done']).optional(),
          })
          .strict(),
        annotations: { readOnlyHint: true },
      },
      ({ workspace_id, ...query }) => result(() => executeQuery(actor, operation, workspace_id, query)),
    );
  }
  server.registerTool(
    'get_task',
    {
      description:
        'Read current task/version/execution. Optionally page current comments (exact body and nullable authorUserId), subtasks, dependencies, files or attachments with context and nextCursor; deleted rows are absent. Cursors are bound to workspace, task and context.',
      inputSchema: z
        .object({ workspace_id: workspace, id, context: z.enum(['comments', 'subtasks', 'dependencies', 'files', 'attachments']).optional(), ...paging })
        .strict(),
      annotations: { readOnlyHint: true },
    },
    ({ workspace_id, ...query }) => result(() => executeQuery(actor, 'get_task', workspace_id, query)),
  );
  server.registerTool(
    'list_task_activity',
    {
      description: 'Read paginated task activity.',
      inputSchema: z.object({ workspace_id: workspace, taskId: id, ...paging }).strict(),
      annotations: { readOnlyHint: true },
    },
    ({ workspace_id, ...query }) => result(() => executeQuery(actor, 'list_task_activity', workspace_id, query)),
  );
  for (const [operation, input] of Object.entries(writes)) {
    const cas = !['create_task', 'add_task_comment', 'create_project'].includes(operation);
    server.registerTool(
      operation,
      {
        description: `${operation.replaceAll('_', ' ')}. Supply a unique idempotency_key; reuse it only for an identical retry.${
          cas ? ' expected_version is required. Refresh after version_conflict.' : ''
        }${
          ['update_task', 'renew_task_claim', 'release_task_claim', 'complete_task'].includes(operation)
            ? ' Supply the live claimToken returned by claim_task.'
            : ''
        }`,
        inputSchema: z
          .object({
            workspace_id: workspace,
            idempotency_key: z.string().min(1).max(200),
            expected_version: cas ? z.number().int().positive() : z.number().int().positive().optional(),
            input,
          })
          .strict(),
        annotations: { readOnlyHint: false, destructiveHint: operation === 'archive_project', idempotentHint: true },
      },
      args =>
        result(() =>
          executeCommand(actor, operation, {
            workspaceId: args.workspace_id,
            idempotencyKey: args.idempotency_key,
            expectedVersion: args.expected_version,
            input: args.input,
          }),
        ),
    );
  }
  return server;
}
