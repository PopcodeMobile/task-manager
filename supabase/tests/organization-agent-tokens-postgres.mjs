/** Disposable PostgreSQL 17: real independent sessions, no ports or shared services. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { setTimeout as delay } from 'node:timers/promises';
import { auditWebhookApiSurface } from './webhook-api-boundary.mjs';
const container = `kairos-organization-tokens-${process.pid}`;
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const docker = (args, input) => {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000, maxBuffer: 5 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr?.split('\n')[0]);
  return r.stdout;
};
const sql = input => docker(['exec', '-i', container, 'psql', '-XqAt', '-h', '127.0.0.1', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], input).trim();
const human = "set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);";
const session = input => {
  const child = spawn('docker', ['exec', '-i', container, 'psql', '-XqAt', '-h', '127.0.0.1', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '',
    error = '';
  child.stdout.on('data', b => (output += b));
  child.stderr.on('data', b => (error += b));
  child.stdin.end(input);
  return new Promise(resolve => child.on('close', code => resolve({ code, output, error })));
};
try {
  docker(['run', '--detach', '--rm', '--name', container, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { stdio: 'ignore' }).status === 0) {
      ready = true;
      break;
    }
    await delay(200);
  }
  assert.equal(ready, true);
  sql(await readFile('supabase/tests/bootstrap.sql', 'utf8'));
  for (const f of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql') && !f.includes('0004_webhook')).sort()) {
    if (f.includes('0003_integration'))
      sql(
        `create table auth.oauth_clients(id uuid primary key,client_name text,deleted_at timestamptz);create table auth.oauth_authorizations(authorization_id text primary key,user_id uuid,client_id uuid,status text,expires_at timestamptz);create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);`,
      );
    if (f.includes('0010_organization'))
      sql(
        `create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant all on storage.objects to anon,authenticated;`,
      );
    sql(await readFile(`supabase/migrations/${f}`, 'utf8'));
  }
  const ws = sql(human + `select public.create_workspace('Concurrency','concurrency','{"projects":[],"tasks":[]}');`)
    .split('\n')
    .at(-1);
  sql(
    human +
      `select public.migrate_workspace(${quote(ws)},0);select public.execute_operation(${quote(ws)},'create_project','{"id":"p1","key":"CON","name":"Fixture"}','project',null);`,
  );
  const issue = () =>
    JSON.parse(
      sql(human + `select public.create_organization_agent_token(${quote(ws)},'Concurrent','write');`)
        .split('\n')
        .at(-1),
    );
  const issued = issue();
  const exec = (token, title, key) =>
    `select public.execute_organization_agent_operation(${quote(token)},${quote(ws)},'create_task',${quote(JSON.stringify({ projectId: 'p1', title }))},${quote(key)},null);`;
  const revoke = id => human + `select public.revoke_organization_agent_token(${quote(ws)},${quote(id)});`;
  const surface = auditWebhookApiSurface({ sql, exposedSchemas: ['public', 'graphql_public'], extraSearchPath: ['public', 'extensions'] });
  assert.ok(surface.some(o => o.name === 'organization_agent_verify'));
  // Actual in-flight command takes connection lock; management waits for commit.
  const first = session(`begin;set role anon;${exec(issued.token, 'Before revoke', 'in-flight')}select pg_sleep(1);commit;`);
  await delay(250);
  const start = Date.now();
  const revoked = await session(revoke(issued.connection.id));
  const completed = await first;
  assert.equal(completed.code, 0);
  assert.equal(revoked.code, 0);
  assert.ok(Date.now() - start > 500, 'revocation must wait for in-flight effect');
  assert.equal(sql(`select count(*) from public.tasks where workspace_id=${quote(ws)} and title='Before revoke';`), '1');
  const stale = await session('set role anon;' + exec(issued.token, 'Before revoke', 'in-flight'));
  assert.equal(stale.code, 3);
  assert.match(stale.error, /unauthorized/);
  // Reverse ordering: committed revocation prevents a queued command and replay.
  const second = issue();
  const revoking = session(`begin;${revoke(second.connection.id)}select pg_sleep(1);commit;`);
  await delay(250);
  const denied = await session('set role anon;' + exec(second.token, 'After revoke', 'never'));
  assert.equal((await revoking).code, 0);
  assert.equal(denied.code, 3);
  assert.match(denied.error, /unauthorized/);
  assert.equal(sql(`select count(*) from public.tasks where title='After revoke';`), '0');
  // Same-key races use the same connection namespace and produce one effect.
  const third = issue();
  const results = await Promise.all([
    session('set role anon;' + exec(third.token, 'Once', 'race')),
    session('set role anon;' + exec(third.token, 'Once', 'race')),
  ]);
  assert.ok(results.every(r => r.code === 0));
  assert.equal(results[0].output, results[1].output);
  assert.equal(sql("select count(*) from public.tasks where title='Once';"), '1');
  // Rotation waits for an active claim transaction and retains claim + receipts.
  const task = JSON.parse(results[0].output.trim()).data;
  const claimSession = session(
    `begin;set role anon;select public.execute_organization_agent_operation(${quote(third.token)},${quote(ws)},'claim_task',${quote(JSON.stringify({ id: task.id }))},'claim',1);select pg_sleep(1);commit;`,
  );
  await delay(250);
  const rotated = JSON.parse(
    sql(human + `select public.rotate_organization_agent_token(${quote(ws)},${quote(third.connection.id)});`)
      .split('\n')
      .at(-1),
  );
  const claimed = await claimSession;
  assert.equal(claimed.code, 0);
  const claim = JSON.parse(claimed.output.trim().split('\n')[0]);
  assert.equal(rotated.connection.id, third.connection.id);
  assert.equal(rotated.connection.agentId, third.connection.agentId);
  assert.equal(sql('set role anon;' + exec(rotated.token, 'Once', 'race')), results[0].output.trim());
  const renewed = JSON.parse(
    sql(
      `set role anon;select public.execute_organization_agent_operation(${quote(rotated.token)},${quote(ws)},'renew_task_claim',${quote(JSON.stringify({ id: task.id, claimToken: claim.data.claimToken }))},'renew',2);`,
    ),
  );
  assert.equal(renewed.data.task.version, 3);
  assert.equal((await session('set role anon;' + exec(third.token, 'Once', 'race'))).code, 3);
  console.log(
    `PASS PostgreSQL 17: four independent-session concurrency fences (effect/revoke, revoke/effect, same-key replay, active-claim rotation); ${surface.length} reachable catalog objects audited; disposable container removed.`,
  );
} finally {
  spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
}
