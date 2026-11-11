import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const owner = '00000000-0000-0000-0000-000000000001';
const uniqueNames = '0015_unique_label_names';
async function setup({ beforeUniqueNames = false, legacy = { projects: [], tasks: [] } } = {}) {
  const db = new PGlite();
  await db.exec(await readFile('supabase/tests/bootstrap.sql', 'utf8'));
  const files = (await readdir('supabase/migrations'))
    .filter(f => f.endsWith('.sql') && !f.includes('0004_webhook') && !(beforeUniqueNames && f.includes(uniqueNames)))
    .sort();
  for (const f of files) {
    if (f.includes('0003_integration'))
      await db.exec(
        `create table auth.oauth_clients(id uuid primary key,client_name text,deleted_at timestamptz);create table auth.oauth_authorizations(authorization_id text primary key,user_id uuid,client_id uuid,status text,expires_at timestamptz);create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);`,
      );
    if (f.includes('0010_organization'))
      await db.exec(
        `create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant all on storage.objects to anon,authenticated;`,
      );
    await db.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
  }
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.client_id','',false),set_config('request.jwt.claims','{}',false)",
    [owner],
  );
  await db.exec('set role authenticated');
  const ws = (await db.query('select public.create_workspace($1,$2,$3) result', ['Labels', 'labels', legacy])).rows[0].result;
  const migration = await db.query('select public.migrate_workspace($1,0) result', [ws]);
  const exec = (op, input, key = crypto.randomUUID(), version = null) =>
    db.query('select public.execute_operation($1,$2,$3,$4,$5) result', [ws, op, input, key, version]).then(r => r.rows[0].result);
  const rows = async sql => {
    await db.exec('reset role');
    const result = (await db.query(sql, [ws])).rows;
    await db.exec('set role authenticated');
    return result;
  };
  const labels = () => rows('select id,name from public.labels where workspace_id=$1 order by id');
  const links = () => rows('select task_id,label_id from public.task_labels where workspace_id=$1 order by task_id,label_id');
  return { db, ws, migration, exec, rows, labels, links };
}
const reject = (p, code) => assert.rejects(p, e => e.code === code);

test('label names are stored trimmed and unique per workspace regardless of case, on create and rename', async () => {
  const h = await setup();
  try {
    const created = await h.exec('create_label', { id: 'l1', name: '\tCockpit  ' });
    assert.equal(created.data.name, 'Cockpit');
    await reject(h.exec('create_label', { id: 'l2', name: 'cockpit' }), 'PT422');
    // Vertical tab and no-break space are trimmed too, so they cannot smuggle in a duplicate or a blank name.
    await reject(h.exec('create_label', { id: 'l4', name: 'cockpit\v' }), 'PT422');
    await reject(h.exec('create_label', { id: 'l5', name: '\u00a0cockpit' }), 'PT422');
    await reject(h.exec('create_label', { id: 'l6', name: '\t' }), 'PT422');
    const ops = await h.exec('create_label', { id: 'l3', name: 'Ops' });
    await reject(h.exec('update_label', { id: 'l3', name: ' COCKPIT' }, crypto.randomUUID(), ops.data.version), 'PT422');
    assert.deepEqual(await h.labels(), [
      { id: 'l1', name: 'Cockpit' },
      { id: 'l3', name: 'Ops' },
    ]);
  } finally {
    await h.db.close();
  }
});

test('legacy import merges labels that differ only by case instead of aborting the cutover', async () => {
  const task = (id, labels) => ({ id, key: `WEB-${id}`, project: 'p1', title: id, status: 'todo', priority: 'medium', labels });
  const h = await setup({
    legacy: {
      ws: {},
      projects: [{ id: 'p1', key: 'WEB', name: 'Project', status: 'active' }],
      tasks: [task('t1', ['Bug', 'bug']), task('t2', ['bug'])],
    },
  });
  try {
    assert.ok(h.migration.rows[0].result);
    assert.deepEqual(await h.labels(), [{ id: 'Bug', name: 'Bug' }]);
    assert.deepEqual(await h.links(), [
      { task_id: 't1', label_id: 'Bug' },
      { task_id: 't2', label_id: 'Bug' },
    ]);
  } finally {
    await h.db.close();
  }
});

test('upgrading a workspace that already holds duplicate names merges them and keeps every task link', async () => {
  const h = await setup({ beforeUniqueNames: true });
  try {
    await h.exec('create_project', { id: 'p1', key: 'DUP', name: 'Dup' }, 'project');
    for (const id of ['t1', 't2']) await h.exec('create_task', { id, projectId: 'p1', title: id });
    await h.rows(
      "insert into public.labels(workspace_id,id,name) select $1,v.id,v.name from (values('a','Ops'),('b','ops '),('c',E'\\tOPS'),('d','Design')) v(id,name)",
    );
    await h.rows("insert into public.task_labels select $1,v.t,v.l from (values('t1','a'),('t1','b'),('t2','c'),('t2','d')) v(t,l)");
    await h.db.exec('reset role');
    await h.db.exec(await readFile(`supabase/migrations/202611110015_unique_label_names.sql`, 'utf8'));
    await h.db.exec('set role authenticated');
    assert.deepEqual(await h.labels(), [
      { id: 'a', name: 'Ops' },
      { id: 'd', name: 'Design' },
    ]);
    assert.deepEqual(await h.links(), [
      { task_id: 't1', label_id: 'a' },
      { task_id: 't2', label_id: 'a' },
      { task_id: 't2', label_id: 'd' },
    ]);
    await reject(h.exec('create_label', { name: 'design' }), 'PT422');
  } finally {
    await h.db.close();
  }
});
