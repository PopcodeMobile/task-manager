import { authenticate } from '../_shared/auth.ts';
import { errorResponse, PublicError } from '../_shared/errors.ts';
import { executeCommand, executeQuery } from '../_shared/operations.ts';
import { object, uuid } from '../_shared/validation.ts';
const collections: Record<string, string> = {
  projects: 'projects',
  tasks: 'tasks',
  subtasks: 'subtasks',
  comments: 'comments',
  teams: 'teams',
  labels: 'labels',
  files: 'files',
  'calendar-events': 'calendar_events',
  views: 'views',
  agents: 'agents',
  notifications: 'notifications',
  activity: 'activity',
  'domain-events': 'domain_events',
  dependencies: 'dependencies',
  'task-labels': 'task_labels',
  reactions: 'reactions',
  'team-members': 'team_members',
  'project-members': 'project_members',
  members: 'members',
  attachments: 'attachments',
};
function cors(request: Request): Headers {
  const headers = new Headers({ Vary: 'Origin' });
  const origin = request.headers.get('origin');
  const allowed = (Deno.env.get('API_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (origin && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, idempotency-key');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    headers.set('Access-Control-Expose-Headers', 'X-Request-Id');
  }
  return headers;
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length')) > 270000) throw new PublicError('validation_error');
  const reader = request.body?.getReader();
  if (!reader) throw new PublicError('validation_error');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 270000) {
        await reader.cancel();
        throw new PublicError('validation_error');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!object(value)) throw new PublicError('validation_error');
    return value;
  } catch (error) {
    if (error instanceof PublicError) throw error;
    throw new PublicError('validation_error');
  }
}
/** REST and MCP call the same operation service; no transport can invent actor authority. */
export async function handleRequest(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID(),
    headers = cors(request);
  headers.set('X-Request-Id', requestId);
  headers.set('Cache-Control', 'no-store');
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const actor = await authenticate(request);
    const url = new URL(request.url);
    const path = url.pathname
      .replace(/^\/functions\/v1/, '')
      .replace(/^\/api/, '')
      .split('/')
      .filter(Boolean)
      .map(part => decodeURIComponent(part));
    if (path[0] !== 'v1' || path[1] !== 'workspaces') throw new PublicError('not_found');
    const workspaceId = path[2] ?? null;
    if (workspaceId && !uuid(workspaceId)) throw new PublicError('validation_error');
    if (request.method === 'GET') {
      const query: Record<string, unknown> = {};
      for (const [key, value] of url.searchParams) {
        if (Object.hasOwn(query, key)) throw new PublicError('validation_error');
        query[key] = key === 'limit' ? Number(value) : value;
      }
      let operation: string;
      if (path.length === 2) operation = 'list_workspaces';
      else if (path.length === 3) operation = 'get_workspace';
      else if (path[3] === 'preferences' && path.length === 4) operation = 'get_preferences';
      else if (path[3] === 'tasks' && path.length === 5) {
        operation = 'get_task';
        query.id = path[4];
      } else if (path[3] === 'tasks' && path[5] === 'activity' && path.length === 6) {
        operation = 'list_task_activity';
        query.taskId = path[4];
      } else if (path.length === 4 && Object.hasOwn(collections, path[3])) operation = `list_${collections[path[3]]}`;
      else throw new PublicError('not_found');
      return Response.json(await executeQuery(actor, operation, workspaceId, query), { headers });
    }
    if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) throw new PublicError('not_found');
    const body = await readBody(request);
    if (Object.keys(body).some(key => !['input', 'expectedVersion', 'idempotencyKey'].includes(key))) {
      throw new PublicError('validation_error');
    }
    if (!object(body.input)) throw new PublicError('validation_error');
    let operation: string;
    const input = { ...body.input };
    if (path.length === 2 && request.method === 'POST') operation = 'create_workspace';
    else if (path[3] === 'commands' && path.length === 5 && request.method === 'POST') operation = path[4];
    else if (path[3] === 'preferences' && path.length === 4 && request.method === 'PATCH') {
      operation = 'set_preferences';
    } else if (['tasks', 'projects'].includes(path[3]) && path.length >= 4) {
      const entity = path[3] === 'tasks' ? 'task' : 'project';
      if (path.length === 4 && request.method === 'POST') operation = `create_${entity}`;
      else if (path.length === 5 && ['PATCH', 'DELETE'].includes(request.method)) {
        operation = `${request.method === 'PATCH' ? 'update' : 'delete'}_${entity}`;
      } else if (path.length === 6 && request.method === 'POST') {
        const actions: Record<string, string> = {
          archive: `archive_${entity}`,
          restore: `restore_${entity}`,
          move: 'move_task',
          duplicate: 'duplicate_task',
          claim: 'claim_task',
          renew: 'renew_task_claim',
          release: 'release_task_claim',
          complete: 'complete_task',
          intervene: 'intervene_task',
          comments: 'add_task_comment',
        };
        if (!Object.hasOwn(actions, path[5]) || (entity === 'project' && !['archive', 'restore'].includes(path[5]))) {
          throw new PublicError('not_found');
        }
        operation = actions[path[5]];
      } else throw new PublicError('not_found');
      if (path[4]) {
        const key = operation === 'add_task_comment' ? 'taskId' : 'id';
        if (input[key] !== undefined && input[key] !== path[4]) throw new PublicError('validation_error');
        input[key] = path[4];
      }
    } else throw new PublicError('not_found');
    // Workspace creation has no target workspace yet; the field is a validation-only sentinel.
    const result = await executeCommand(actor, operation, {
      workspaceId: workspaceId ?? '00000000-0000-0000-0000-000000000000',
      idempotencyKey: (body.idempotencyKey ?? request.headers.get('idempotency-key')) as string,
      expectedVersion: body.expectedVersion as number | undefined,
      input,
    });
    return Response.json({ ...result, requestId }, { status: operation.startsWith('create_') ? 201 : 200, headers });
  } catch (error) {
    return errorResponse(error, requestId, headers);
  }
}
if (import.meta.main) Deno.serve(handleRequest);
