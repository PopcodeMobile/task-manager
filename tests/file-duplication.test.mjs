import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { seed } from '../src/data/seed.js';
import { emptyWorkspace } from '../src/data/workspace.js';
import { createLocalRepository } from '../src/workspace/local.js';
import { createLocalWorkspaceRepository } from '../src/workspace/local-panel-repository.ts';
const owner = '00000000-0000-0000-0000-000000000001';
const member = '00000000-0000-0000-0000-000000000003';
const historical = {
  id: 'source',
  name: 'archive.tar.gz',
  type: 'zip',
  size: '12 KB',
  by: 'historical',
  at: 1000,
  custom: { nested: ['kept', 42] },
  authorUserId: 'old',
  author_user_id: 'old',
  createdAt: 'old',
  created_at: 'old',
};
const invoke = (repo, input, expectedVersion = 1, idempotencyKey = crypto.randomUUID(), operation = 'duplicate_file') =>
  repo.command(operation, { input, expectedVersion, idempotencyKey });
async function local(embedded = false, explicitNull = false) {
  const data = seed();
  const source = {
    ...structuredClone(historical),
    ...(embedded ? {} : { project: data.tasks[0].project, task: data.tasks[0].id }),
    ...(explicitNull ? { task: null } : {}),
  };
  data.files = embedded ? [] : [source];
  data.tasks[0].attachments = [structuredClone(source)];
  const values = new Map([['gr8r.v2', JSON.stringify({ data })]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const persistence = createLocalRepository({ storage, seed, blank: emptyWorkspace });
  const options = { persistence, storage, identity: 'local', workspaceId: null };
  options.workspaceId = (await createLocalWorkspaceRepository(options).workspaces())[0].id;
  return { repo: createLocalWorkspaceRepository(options), reload: () => createLocalWorkspaceRepository(options), storage, persistence, data };
}
async function sql() {
  const db = new PGlite();
  for (const file of [
    'supabase/tests/bootstrap.sql',
    'supabase/migrations/202610160001_workspaces.sql',
    'supabase/migrations/202610200001_normalized_work.sql',
    'supabase/migrations/202610200002_agent_operations.sql',
  ])
    await db.exec(await readFile(file, 'utf8'));
  await db.exec(
    'create table auth.oauth_clients(id uuid primary key,client_name text,deleted_at timestamptz);create table auth.oauth_authorizations(authorization_id text primary key,user_id uuid,client_id uuid,status text,expires_at timestamptz);create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);',
  );
  await db.exec(await readFile('supabase/migrations/202610200003_integration_grants.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/202610200005_ui_contracts.sql', 'utf8'));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  const payload = {
    projects: [{ id: 'p1', name: 'Project', key: 'P' }],
    tasks: [{ id: 't1', project: 'p1', title: 'Task', attachments: [{ id: 'source', name: historical.name }] }],
    files: [{ ...historical, project: 'p1', task: 't1' }],
  };
  const ws = (await db.query('select public.create_workspace($1,$2,$3) id', ['Files', 'files', JSON.stringify(payload)])).rows[0].id;
  await db.query('select public.migrate_workspace($1,0)', [ws]);
  // Warm the actual 005 PL/pgSQL call plans before additive helper renames.
  // Roll back the ordinary update so the imported source and version stay intact.
  await db.exec('begin;set role authenticated');
  await db.query("select public.execute_operation($1,'update_file','{\"id\":\"source\"}','warm-005',1)", [ws]);
  await db.exec('rollback');
  await db.exec(await readFile('supabase/migrations/202610200006_file_duplication.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/202610200007_task_graph_copy.sql', 'utf8'));
  await db.query("insert into public.workspace_memberships values($1,$2,'member')", [ws, member]);
  await db.exec('set role authenticated');
  const command = async (operation, input, version = null, key = crypto.randomUUID(), workspace = ws) =>
    (await db.query('select public.execute_operation($1,$2,$3,$4,$5) result', [workspace, operation, JSON.stringify(input), key, version])).rows[0].result;
  const read = async operation => (await db.query('select public.read_operation($1,$2,$3) result', [ws, operation, '{}'])).rows[0].result;
  return { db, ws, command, read };
}
function renewed(copy, actor) {
  assert.equal(copy.name, 'archive.tar copy.gz');
  assert.equal(copy.authorUserId, actor);
  assert.ok(Date.parse(copy.createdAt) > 1000);
  assert.deepEqual(copy.legacyMetadata.custom, { nested: ['kept', 42] });
  assert.equal(copy.legacyMetadata.id, copy.id);
  assert.equal(copy.legacyMetadata.name, copy.name);
  assert.equal(copy.legacyMetadata.by, actor);
  assert.equal(copy.legacyMetadata.authorUserId, actor);
  assert.equal(copy.legacyMetadata.author_user_id, actor);
  assert.equal(copy.legacyMetadata.createdAt, copy.createdAt);
  assert.equal(copy.legacyMetadata.created_at, copy.createdAt);
  assert.equal(new Date(copy.legacyMetadata.at).toISOString(), new Date(copy.createdAt).toISOString());
  assert.equal(copy.version, 1);
}

for (const [embedded, explicitNull] of [
  [false, false],
  [true, false],
  [true, true],
])
  test(`local duplication preserves canonical ownership/unknown metadata and reload (${embedded}/${explicitNull})`, async () => {
    const { repo, reload, storage, data } = await local(embedded, explicitNull);
    const before = storage.getItem('gr8r.workspaces.v1');
    const source = (await repo.list('list_files')).find(f => f.id === 'source');
    assert.equal(source.createdAt, '1970-01-01T00:00:01.000Z');
    assert.equal(storage.getItem('gr8r.workspaces.v1'), before);
    const links = await repo.list('list_attachments');
    const result = await invoke(repo, { id: 'source', newId: 'copy' }, 1, 'receipt');
    renewed(result.data, data.me);
    assert.equal(result.data.projectId, data.tasks[0].project);
    assert.equal(result.data.taskId, explicitNull ? null : data.tasks[0].id);
    assert.equal(result.data.fileType, 'zip');
    assert.equal(result.data.sizeLabel, '12 KB');
    assert.deepEqual(
      (await reload().list('list_files')).find(f => f.id === 'source'),
      source,
    );
    assert.deepEqual(await reload().list('list_attachments'), links);
    assert.deepEqual(await invoke(reload(), { id: 'source', newId: 'copy' }, 1, 'receipt'), result);
    assert.deepEqual(
      (await reload().list('list_files')).find(f => f.id === 'copy'),
      result.data,
    );
    const event = (await repo.list('list_domain_events')).find(e => e.operation === 'duplicate_file');
    assert.equal(event.entityId, 'copy');
    assert.equal(event.actorUserId, data.me);
  });
test('local duplicate conflicts, batches, generated IDs and actor validation are atomic', async () => {
  const { repo, storage, persistence } = await local();
  const result = await invoke(repo, { id: 'source' }, 1, 'receipt');
  assert.notEqual(result.data.id, 'source');
  const before = storage.getItem('gr8r.workspaces.v1');
  for (const [input, version, key, code] of [
    [{ id: 'source' }, 2, 'stale', 'version_conflict'],
    [{ id: 'source', name: 'different' }, 1, 'receipt', 'idempotency_conflict'],
    [{ id: 'source', newId: 'source' }, 1, 'collision', 'validation_error'],
    [{ id: 'source', at: 1 }, 1, 'spoof', 'validation_error'],
  ])
    await assert.rejects(invoke(repo, input, version, key), { code });
  await assert.rejects(
    invoke(
      repo,
      {
        commands: [
          { operation: 'duplicate_file', input: { id: 'source', newId: 'rolled-back' }, expectedVersion: 1 },
          { operation: 'update_file', input: { id: 'source', name: 'stale' }, expectedVersion: 2 },
        ],
      },
      undefined,
      'batch',
      'batch',
    ),
    { code: 'version_conflict' },
  );
  assert.equal(storage.getItem('gr8r.workspaces.v1'), before);
  const batch = { commands: [{ operation: 'duplicate_file', input: { id: 'source', newId: 'batch-copy', name: 'custom' }, expectedVersion: 1 }] };
  const saved = await invoke(repo, batch, undefined, 'batch-ok', 'batch');
  assert.equal(saved.data.results[0].data.name, 'custom');
  assert.deepEqual(await invoke(repo, batch, undefined, 'batch-ok', 'batch'), saved);
  const loaded = await persistence.load(repo.workspaceId);
  loaded.data.me = 'absent-member';
  await persistence.save(repo.workspaceId, loaded.data, loaded.revision);
  await assert.rejects(invoke(repo, { id: 'source' }, 1, 'receipt'), { code: 'forbidden' });
  await assert.rejects(invoke(repo, { id: 'source' }), { code: 'forbidden' });
  await assert.rejects(invoke(repo, batch, undefined, 'batch-ok', 'batch'), { code: 'forbidden' });
});
test('SQL duplicate preserves source/joins and trusted metadata, replay/CAS/ID conflicts, atomic batch and private ACLs', async () => {
  const { db, ws, command, read } = await sql();
  try {
    const source = (await read('list_files')).items[0];
    const links = (await read('list_attachments')).items;
    const result = await command('duplicate_file', { id: 'source', newId: 'copy' }, 1, 'receipt');
    renewed(result.data, owner);
    assert.deepEqual([result.data.projectId, result.data.taskId, result.data.fileType, result.data.sizeLabel], ['p1', 't1', 'zip', '12 KB']);
    assert.deepEqual(
      (await read('list_files')).items.find(f => f.id === 'source'),
      source,
    );
    assert.deepEqual((await read('list_attachments')).items, links);
    assert.deepEqual(await command('duplicate_file', { id: 'source', newId: 'copy' }, 1, 'receipt'), result);
    const rejects = (promise, code) => assert.rejects(promise, e => e.message === code);
    await rejects(command('duplicate_file', { id: 'source', newId: 'copy' }, 1), 'validation_error');
    await rejects(command('duplicate_file', { id: 'source', newId: 'source' }, 1), 'validation_error');
    await rejects(command('duplicate_file', { id: 'source' }, 2), 'version_conflict');
    await rejects(command('duplicate_file', { id: 'source' }), 'version_conflict');
    await rejects(command('duplicate_file', { id: 'source', name: 'Changed' }, 1, 'receipt'), 'idempotency_conflict');
    for (const extra of [{ at: 1 }, { authorUserId: owner }, { metadata: {} }, { newId: null }, { newId: 1 }, { name: '' }])
      await rejects(command('duplicate_file', { id: 'source', ...extra }, 1), 'validation_error');
    const count = async table => (await db.query(`select count(*)::int n from public.${table} where workspace_id=$1`, [ws])).rows[0].n;
    const tables = ['files', 'domain_events', 'idempotency_requests'];
    await db.exec('reset role');
    const counts = await Promise.all(tables.map(count));
    await db.exec('set role authenticated');
    await rejects(
      command('batch', {
        commands: [
          { operation: 'duplicate_file', input: { id: 'source', newId: 'rollback' }, expectedVersion: 1 },
          { operation: 'update_file', input: { id: 'source', name: 'stale' }, expectedVersion: 2 },
        ],
      }),
      'version_conflict',
    );
    await db.exec('reset role');
    assert.deepEqual(await Promise.all(tables.map(count)), counts);
    const acl = await db.query(
      "select proname,prosecdef,has_function_privilege('anon',oid,'execute') a,has_function_privilege('authenticated',oid,'execute') b from pg_proc where pronamespace='public'::regnamespace and proname in ('operation_graph','operation_graph_before_file_duplication','operation_validate','operation_validate_before_file_duplication','operation_batch_allowed')",
    );
    assert.ok(acl.rows.length >= 3);
    for (const row of acl.rows) assert.deepEqual([row.prosecdef, row.a, row.b], [false, false, false], row.proname);
    await db.exec('set role authenticated');
    const input = { commands: [{ operation: 'duplicate_file', input: { id: 'source' }, expectedVersion: 1 }] };
    const batch = await command('batch', input, null, 'batch-ok');
    assert.deepEqual(await command('batch', input, null, 'batch-ok'), batch);
    assert.notEqual(batch.data.results[0].data.id, 'source');
    const event = (await read('list_domain_events')).items.find(e => e.id === result.eventId);
    assert.equal(event.entityId, 'copy');
    assert.equal(event.actorUserId, owner);
  } finally {
    await db.close();
  }
});
test('SQL duplicate keeps tenant, current membership and bound-agent ownership/attachment restrictions', async () => {
  const { db, ws, command } = await sql();
  try {
    const rejects = (promise, code) => assert.rejects(promise, e => e.message === code);
    await db.exec('reset role');
    await db.query("insert into public.agents(workspace_id,id,name,auth_user_id) values($1,'agent','Agent',$2)", [ws, member]);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [member]);
    await rejects(command('duplicate_file', { id: 'source' }, 1), 'forbidden');
    await rejects(command('batch', { commands: [{ operation: 'duplicate_file', input: { id: 'source' }, expectedVersion: 1 }] }), 'forbidden');
    await db.exec('reset role');
    await db.query('update public.files set task_id=null where workspace_id=$1', [ws]);
    await db.exec('set role authenticated');
    await rejects(command('duplicate_file', { id: 'source' }, 1), 'forbidden');
    await db.exec('reset role');
    await db.query('delete from public.task_attachments where workspace_id=$1', [ws]);
    await db.exec('set role authenticated');
    const result = await command('duplicate_file', { id: 'source' }, 1, 'agent-copy');
    assert.equal(result.data.authorUserId, member);
    await rejects(command('duplicate_file', { id: 'source' }, 1, 'tenant', crypto.randomUUID()), 'forbidden');
    await db.exec('reset role');
    await db.query('delete from public.workspace_memberships where workspace_id=$1 and user_id=$2', [ws, member]);
    await db.exec('set role authenticated');
    await rejects(command('duplicate_file', { id: 'source' }, 1, 'agent-copy'), 'forbidden');
  } finally {
    await db.close();
  }
});

test('extensionless, dotfile and trailing-dot names follow legacy default exactly on local and SQL', async () => {
  const { repo } = await local();
  const { db, command } = await sql();
  try {
    for (const [index, name, expected] of [
      [0, 'README', 'README'],
      [1, '.env', ' copy.env'],
      [2, 'file.', 'file.'],
    ]) {
      const id = `name-${index}`;
      await invoke(repo, { id, name }, undefined, `create-${index}`, 'create_file');
      await command('create_file', { id, name });
      assert.equal((await invoke(repo, { id })).data.name, expected);
      assert.equal((await command('duplicate_file', { id }, 1)).data.name, expected);
    }
  } finally {
    await db.close();
  }
});
test('local historical files without a date read honestly without materializing storage', async () => {
  const { repo, persistence, storage } = await local();
  const loaded = await persistence.load(repo.workspaceId);
  delete loaded.data.files[0].at;
  await persistence.save(repo.workspaceId, loaded.data, loaded.revision);
  const before = storage.getItem('gr8r.workspaces.v1');
  assert.equal((await repo.list('list_files')).find(f => f.id === 'source').createdAt, '');
  assert.equal(storage.getItem('gr8r.workspaces.v1'), before);
});

for (const field of ['id', 'newId'])
  test(`duplicate ${field} accepts cloud-compatible strings and rejects matching boundaries locally/SQL`, async () => {
    const { acceptedFileIds, rejectedFileIds, unrepresentableFileIds } = await import('./fixtures/file-duplication-ids.js');
    const { repo, persistence } = await local();
    const { db, ws, command } = await sql();
    try {
      if (field === 'id') {
        const loaded = await persistence.load(repo.workspaceId);
        loaded.data.files.push(...acceptedFileIds.map(id => ({ id, name: 'Boundary.pdf', type: 'pdf' })));
        await persistence.save(repo.workspaceId, loaded.data, loaded.revision);
        await db.exec('reset role');
        for (const id of acceptedFileIds) await db.query("insert into public.files(workspace_id,id,name) values($1,$2,'Boundary.pdf')", [ws, id]);
        await db.exec('set role authenticated');
      }
      for (const [index, value] of acceptedFileIds.entries()) {
        const input = field === 'id' ? { id: value, newId: `boundary-copy-${index}` } : { id: 'source', newId: value };
        const version = (await repo.list('list_files')).find(f => f.id === input.id).version;
        assert.equal((await invoke(repo, input, version)).data.id, input.newId);
        assert.equal((await command('duplicate_file', input, 1)).data.id, input.newId);
      }
      for (const value of rejectedFileIds) {
        const input = { id: 'source', [field]: value };
        await assert.rejects(invoke(repo, input), { code: 'validation_error' });
        await assert.rejects(command('duplicate_file', input, 1), e => e.message === 'validation_error');
      }
      for (const value of unrepresentableFileIds) {
        const input = { id: 'source', [field]: value };
        await assert.rejects(invoke(repo, input), { code: 'validation_error' });
        // PostgreSQL rejects invalid Unicode during JSONB decoding, before the RPC body.
        await assert.rejects(command('duplicate_file', input, 1), e => ['22P05', '22P02', '22021'].includes(e.code));
      }
    } finally {
      await db.close();
    }
  });

test('punctuated duplicate IDs compose atomically in local/SQL batches without normalizing strings', async () => {
  const { repo, storage } = await local();
  const { db, command, read } = await sql();
  const commands = [
    { operation: 'duplicate_file', input: { id: 'source', newId: ' .batch-copy ' }, expectedVersion: 1 },
    { operation: 'duplicate_file', input: { id: ' .batch-copy ', newId: '/next.copy' }, expectedVersion: 2 },
  ];
  try {
    const before = storage.getItem('gr8r.workspaces.v1');
    const source = (await read('list_files')).items;
    await assert.rejects(invoke(repo, { commands }, undefined, 'ids-rollback', 'batch'), { code: 'version_conflict' });
    assert.equal(storage.getItem('gr8r.workspaces.v1'), before);
    await assert.rejects(command('batch', { commands }), e => e.message === 'version_conflict');
    assert.deepEqual((await read('list_files')).items, source);
    commands[1].expectedVersion = 1;
    assert.equal((await invoke(repo, { commands }, undefined, 'ids-success', 'batch')).data.results[1].data.id, '/next.copy');
    assert.equal((await command('batch', { commands })).data.results[1].data.id, '/next.copy');
  } finally {
    await db.close();
  }
});

test('SQL duplicate ID validator matches UTF-16 length and ECMAScript whitespace boundaries', async () => {
  const { acceptedFileIds, rejectedFileIds } = await import('./fixtures/file-duplication-ids.js');
  const { db } = await sql();
  try {
    await db.exec('reset role');
    for (const field of ['id', 'newId']) {
      for (const value of acceptedFileIds)
        await db.query("select public.operation_validate('duplicate_file',$1)", [JSON.stringify({ id: 'source', [field]: value })]);
      for (const value of rejectedFileIds)
        await assert.rejects(
          db.query("select public.operation_validate('duplicate_file',$1)", [JSON.stringify({ id: 'source', [field]: value })]),
          e => e.message === 'validation_error',
        );
    }
  } finally {
    await db.close();
  }
});
