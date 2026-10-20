/** Disposable PostgreSQL concurrency proof. Synthetic Auth rows are SQL fixtures, not OAuth exchanges. */
import test from 'node:test';
import process from 'node:process';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const owner = '00000000-0000-0000-0000-000000000001';
const client = '10000000-0000-0000-0000-000000000001';
function session(container) {
  const child = spawn('docker', ['exec', '-i', container, 'psql', '-XqAt', '-h', '127.0.0.1', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1']);
  child.stdin.write('\\set VERBOSITY verbose\n');
  let output = '',
    errors = '',
    sequence = 0;
  child.stdout.on('data', value => {
    output += value;
  });
  child.stderr.on('data', value => {
    errors += value;
  });
  return {
    async query(sql) {
      const marker = `barrier_${++sequence}`;
      const start = output.length;
      child.stdin.write(`${sql}\n\\echo ${marker}\n`);
      const deadline = Date.now() + 8000;
      while (!output.slice(start).includes(marker)) {
        if (child.exitCode !== null) throw new Error(`PostgreSQL session exited: ${errors.trim()}`);
        if (Date.now() >= deadline) throw new Error(`PostgreSQL barrier timed out: ${errors.trim()}`);
        await delay(10);
      }
      return output.slice(start).split(marker)[0].trim();
    },
    close() {
      child.stdin.end();
      child.kill();
    },
  };
}
test('reconsent and an already-authorized OAuth write use compatible row-lock order', { timeout: 40000 }, async () => {
  const container = `task-manager-oauth-race-${process.pid}-${Date.now()}`;
  const sql = (source, failure = false) => {
    const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-XqAt', '-h', '127.0.0.1', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
      input: source,
      encoding: 'utf8',
      timeout: 10000,
    });
    if (!failure) assert.equal(result.status, 0, result.stderr);
    return result;
  };
  let writer, consent;
  try {
    const started = spawnSync('docker', ['run', '--rm', '-d', '--name', container, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine'], {
      encoding: 'utf8',
    });
    assert.equal(started.status, 0, started.stderr);
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (sql('select 1;', true).status === 0) {
        ready = true;
        break;
      }
      await delay(50);
    }
    assert(ready, 'Disposable PostgreSQL must become ready');
    for (const path of [
      'supabase/tests/bootstrap.sql',
      'supabase/migrations/202610160001_workspaces.sql',
      'supabase/migrations/202610200001_normalized_work.sql',
      'supabase/migrations/202610200002_agent_operations.sql',
    ])
      sql(await readFile(path, 'utf8'));
    sql(`create table auth.oauth_clients(id uuid primary key,client_name text,deleted_at timestamptz);
create table auth.oauth_authorizations(authorization_id text primary key,user_id uuid,client_id uuid,status text,expires_at timestamptz);
create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);`);
    sql(await readFile('supabase/migrations/202610200003_integration_grants.sql', 'utf8'));
    sql(`select set_config('request.jwt.claim.sub','${owner}',false);
create table public.oauth_race_fixture as select (public.create_workspace_v2('OAuth race','oauth-race','race-workspace')->'data'->>'id')::uuid workspace_id;
grant select on public.oauth_race_fixture to authenticated;
select public.execute_operation(workspace_id,'create_project','{"id":"p1","name":"Race project","key":"RACE"}','race-project') from public.oauth_race_fixture;
insert into auth.oauth_clients values('${client}','SQL race client',null);
insert into auth.oauth_authorizations values('initial','${owner}','${client}','pending',now()+interval '10 minutes'),('reconsent','${owner}','${client}','pending',now()+interval '10 minutes');
select public.prepare_integration_consent('initial',jsonb_build_array(jsonb_build_object('workspaceId',workspace_id,'capability','write'))) from public.oauth_race_fixture;
update auth.oauth_authorizations set status='approved' where authorization_id='initial';
insert into auth.oauth_consents values('${owner}','${client}',null);
select public.activate_integration_consent('initial',consent_attempt_id) from public.integration_connections;`);
    writer = session(container);
    consent = session(container);
    const writerPid = Number(
      await writer
        .query(
          `set deadlock_timeout='100ms';set statement_timeout='5s';begin;
select set_config('request.jwt.claim.sub','${owner}',true);
select set_config('request.jwt.claims','{"sub":"${owner}","client_id":"${client}"}',true);
-- Test-only superuser calls the private helper to pause precisely after real operation authorization.
select public.operation_authorize(workspace_id,true) is not null from public.oauth_race_fixture;
select pg_backend_pid();`,
        )
        .then(output => output.split('\n').at(-1)),
    );
    const consentPid = Number(
      await consent
        .query(
          `set deadlock_timeout='100ms';set statement_timeout='5s';begin;
select set_config('request.jwt.claim.sub','${owner}',true);set local role authenticated;select pg_backend_pid();`,
        )
        .then(output => output.split('\n').at(-1)),
    );
    const preparing = consent.query(
      `select public.prepare_integration_consent('reconsent',jsonb_build_array(jsonb_build_object('workspaceId',workspace_id,'capability','read'))) is not null from public.oauth_race_fixture;commit;`,
    );
    let blocked = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const waiting = sql(`select ${writerPid}=any(pg_blocking_pids(${consentPid}));`).stdout.trim();
      if (waiting === 't') {
        blocked = true;
        break;
      }
      await delay(10);
    }
    assert(blocked, 'Barrier must observe real preparation waiting on the authorized writer connection lock');
    const writing = writer.query(`set local role authenticated;
select public.execute_operation(workspace_id,'create_task','{"projectId":"p1","title":"Authorized race write"}','race-task') is not null from public.oauth_race_fixture;commit;`);
    const outcomes = await Promise.allSettled([writing, preparing]);
    for (const outcome of outcomes) assert.equal(outcome.status, 'fulfilled', outcome.status === 'rejected' ? outcome.reason.message : undefined);
    assert(!outcomes.some(outcome => outcome.status === 'rejected' && /40P01/.test(outcome.reason.message)), 'No PostgreSQL deadlock may occur');
    // The old grant authorized exactly one write before reconsent committed. Pending grants cannot authorize.
    assert.equal(sql(`select count(*) from public.tasks where title='Authorized race write';`).stdout.trim(), '1');
    assert.equal(sql(`select status||':'||authorization_id from public.integration_connections;`).stdout.trim(), 'pending:reconsent');
    const delegated = `select set_config('request.jwt.claim.sub','${owner}',false);select set_config('request.jwt.claims','{"sub":"${owner}","client_id":"${client}"}',false);set role authenticated;`;
    assert.match(sql(`${delegated} select public.read_operation(workspace_id,'list_tasks') from public.oauth_race_fixture;`, true).stderr, /forbidden/);
    sql(
      `select set_config('request.jwt.claim.sub','${owner}',false);update auth.oauth_authorizations set status='approved' where authorization_id='reconsent';select public.activate_integration_consent('reconsent',consent_attempt_id) from public.integration_connections;`,
    );
    assert.equal(
      sql(`${delegated} select jsonb_array_length(public.read_operation(workspace_id,'list_tasks')->'items') from public.oauth_race_fixture;`)
        .stdout.trim()
        .split('\n')
        .at(-1),
      '1',
    );
    assert.match(
      sql(
        `${delegated} select public.execute_operation(workspace_id,'create_task','{"projectId":"p1","title":"Forbidden read grant write"}','denied') from public.oauth_race_fixture;`,
        true,
      ).stderr,
      /forbidden/,
    );
    sql('update auth.oauth_consents set revoked_at=now();');
    assert.match(sql(`${delegated} select public.read_operation(workspace_id,'list_tasks') from public.oauth_race_fixture;`, true).stderr, /forbidden/);
  } finally {
    writer?.close();
    consent?.close();
    spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  }
});
