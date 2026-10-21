import process from 'node:process';
import console from 'node:console';
/** Fresh isolated PostgreSQL + real pgmq/Vault. No shared service, public port or delivery worker. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const container = `task-manager-final009-${process.pid}`;
function docker(args, input) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000, maxBuffer: 5 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
function sql(input, role = 'supabase_admin') {
  return docker(['exec', '-i', container, 'psql', '-XqAt', '-h', '127.0.0.1', '-U', role, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input);
}
try {
  docker([
    'run',
    '--detach',
    '--rm',
    '--name',
    container,
    '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    'public.ecr.aws/supabase/postgres:17.11.0.003',
    'postgres',
    '-c',
    'shared_preload_libraries=pgsodium,supabase_vault,pg_cron,pg_net,pg_stat_statements',
    '-c',
    'cron.database_name=postgres',
    '-c',
    'session_preload_libraries=supautils',
    '-c',
    'supautils.privileged_role=supabase_privileged_role',
    '-c',
    'supautils.superuser=supabase_admin',
    '-c',
    'supautils.privileged_extensions_superuser=supabase_admin',
    '-c',
    'supautils.privileged_extensions=pg_net,pg_cron,supabase_vault',
  ]);
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres'], { stdio: 'ignore' }).status === 0) {
      ready = true;
      break;
    }
    await delay(100);
  }
  assert.ok(ready);
  sql('drop schema auth cascade;');
  sql((await readFile('supabase/tests/bootstrap.sql', 'utf8')).replaceAll(/create role (anon|authenticated) nologin;/g, ''));
  sql(
    'create table auth.oauth_clients(id uuid primary key,client_name text,deleted_at timestamptz);create table auth.oauth_authorizations(authorization_id text primary key,user_id uuid,client_id uuid,status text,expires_at timestamptz);create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);grant usage on schema auth to postgres;grant all on all tables in schema auth to postgres;',
  );
  for (const name of [
    '202610160001_workspaces',
    '202610200001_normalized_work',
    '202610200002_agent_operations',
    '202610200003_integration_grants',
    '202610200004_webhook_delivery',
    '202610200005_ui_contracts',
    '202610200006_file_duplication',
    '202610200007_task_graph_copy',
    '202610200008_team_membership_baselines',
    '202610200009_task_context_execution',
  ])
    sql(await readFile(`supabase/migrations/${name}.sql`, 'utf8'), 'postgres');
  console.log(sql(await readFile('supabase/tests/final-integration.sql', 'utf8')));
  console.log(
    '009 fresh PostgreSQL 17: authority, task context paging, execution transitions, one durable pgmq blocked event, minimal body, replay and graph cascades passed.',
  );
} finally {
  spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
}
