import { Buffer } from 'node:buffer';
import console from 'node:console';
/** Real extensions on an isolated, disposable official Supabase Postgres image. No shared reset. */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const container = `task-manager-webhooks-${process.pid}`;
const apiSchemas = ['public', 'graphql_public'],
  apiExtraSearchPath = ['public', 'extensions'];
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000, maxBuffer: 5 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  return result.stdout;
}
const network = `${container}-network`,
  rest = `${container}-rest`;
function sql(input, role = 'supabase_admin') {
  return docker(['exec', '-i', container, 'psql', '-XqAt', '-h', '127.0.0.1', '-U', role, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input);
}
try {
  docker(['network', 'create', network]);
  docker([
    'run',
    '--detach',
    '--rm',
    '--name',
    container,
    '--network',
    network,
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
    '-c',
    'listen_addresses=*',
  ]);
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres'], { stdio: 'ignore' }).status === 0) {
      ready = true;
      break;
    }
    await delay(100);
  }
  assert.ok(ready, 'disposable Postgres did not start');
  sql('drop schema auth cascade;');
  sql((await readFile('supabase/tests/bootstrap.sql', 'utf8')).replaceAll(/create role (anon|authenticated) nologin;/g, ''));
  sql(
    'create table auth.oauth_clients(id uuid primary key,client_name text,deleted_at timestamptz);create table auth.oauth_authorizations(authorization_id text primary key,user_id uuid,client_id uuid,status text,expires_at timestamptz);create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);',
  );
  // Match Supabase's real Auth table grants without elevating the application migration role.
  sql('grant usage on schema auth to postgres;grant all on all tables in schema auth to postgres;');
  sql(`create extension if not exists pg_graphql;comment on schema public is '@graphql({"introspection": true})';`);
  assert.equal(sql("select current_user='postgres' and not rolsuper from pg_roles where rolname=current_user;", 'postgres').trim(), 't');
  assert.equal(
    sql(
      "select count(*)>0 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='vault' and pg_get_userbyid(p.proowner)='supabase_admin' and not has_function_privilege('postgres',p.oid,'execute');",
    ).trim(),
    't',
    'fixture must retain vendor-owned crypto primitives inaccessible to the migration role',
  );
  const vendorAclQuery =
    "select jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='vault';";
  const vendorAcl = sql(vendorAclQuery).trim();
  for (const file of ['202610160001_workspaces', '202610200001_normalized_work', '202610200002_agent_operations', '202610200003_integration_grants'])
    sql(await readFile(`supabase/migrations/${file}.sql`, 'utf8'), 'postgres');
  const webhookMigration = await readFile('supabase/migrations/202610200004_webhook_delivery.sql', 'utf8');
  sql(webhookMigration, 'postgres');
  sql(await readFile('supabase/migrations/202610200005_ui_contracts.sql', 'utf8'), 'postgres');
  sql(await readFile('supabase/migrations/202610200006_file_duplication.sql', 'utf8'), 'postgres');
  assert.equal(sql(vendorAclQuery).trim(), vendorAcl, 'application migration must preserve all vendor Vault function owners and ACLs');
  console.log(sql(await readFile('supabase/tests/webhook-acl.sql', 'utf8')));
  const { auditWebhookApiSurface, verifyWebhookApiBoundary } = await import('./webhook-api-boundary.mjs');
  const productionSurface = auditWebhookApiSurface({ sql, exposedSchemas: apiSchemas, extraSearchPath: apiExtraSearchPath });
  assert.throws(() => auditWebhookApiSurface({ sql }), /unknown Data API/);
  assert.throws(() => auditWebhookApiSurface({ sql, exposedSchemas: ['public', 'net'] }), /unreviewed exposed schema/);
  assert.throws(() => auditWebhookApiSurface({ sql, exposedSchemas: ['public'] }), /unknown or unreviewed API/);
  assert.throws(() => auditWebhookApiSurface({ sql, exposedSchemas: ['public'], extraSearchPath: ['public', 'net'] }), /unknown or unreviewed API/);
  for (const [create, drop] of [
    [
      'create function public.test_unsafe_invoker() returns jsonb language sql as $$select jsonb_agg(headers) from net.http_request_queue$$;',
      'drop function public.test_unsafe_invoker();',
    ],
    [
      'create function public.test_unsafe_private() returns jsonb language sql as $$select jsonb_agg(headers) from net.http_request_queue$$;revoke all on function public.test_unsafe_private() from public;create function public.test_unsafe_chain() returns jsonb language sql security definer as $$select public.test_unsafe_private()$$;',
      'drop function public.test_unsafe_chain();drop function public.test_unsafe_private();',
    ],
    [
      'create view public.test_unsafe_view as select headers from net.http_request_queue;grant select on public.test_unsafe_view to authenticated;',
      'drop view public.test_unsafe_view;',
    ],
  ]) {
    sql(create);
    try {
      assert.throws(() => auditWebhookApiSurface({ sql, exposedSchemas: apiSchemas, extraSearchPath: apiExtraSearchPath }), /sensitive API bridge/);
    } finally {
      sql(drop);
    }
  }
  console.log('PASS boundary audit rejects unknown/exposed vendor schemas, INVOKER, indirect DEFINER helper and view bridges');

  console.log(
    sql(
      "select extname||':'||extversion from pg_extension where extname in ('pgmq','supabase_vault','pg_cron','pg_net','pg_graphql') order by extname;select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='pgmq' and p.proname in ('read','send','archive','set_vt');",
    ),
  );
  console.log(sql(await readFile('supabase/tests/ui-contracts.sql', 'utf8')));
  console.log(sql(await readFile('supabase/tests/webhook-delivery.sql', 'utf8')));
  // Independent SQL sessions: only one reservation is available while a live lease owns the message.
  const concurrent = await Promise.all(
    [1, 2].map(async () => {
      const { spawn } = await import('node:child_process');
      return new Promise((resolve, reject) => {
        const child = spawn('docker', [
          'exec',
          '-i',
          container,
          'psql',
          '-XqAt',
          '-h',
          '127.0.0.1',
          '-U',
          'supabase_admin',
          '-d',
          'postgres',
          '-v',
          'ON_ERROR_STOP=1',
        ]);
        let out = '',
          err = '';
        child.stdout.on('data', x => (out += x));
        child.stderr.on('data', x => (err += x));
        child.on('close', code => (code === 0 ? resolve(out.trim()) : reject(Error(err))));
        child.stdin.end('select jsonb_array_length(public.claim_webhook_batch(5));');
      });
    }),
  );
  assert.equal(
    concurrent.map(Number).reduce((a, b) => a + b, 0),
    1,
    'concurrent workers reserved more than one delivery',
  );
  console.log(sql(await readFile('supabase/tests/webhook-isolation.sql', 'utf8')));
  if (process.env.WEBHOOK_REVIEW_CASE) {
    const { verifyWebhookRecovery } = await import('./webhook-recovery.mjs');
    await verifyWebhookRecovery({ container, sql, scenario: process.env.WEBHOOK_REVIEW_CASE });
    console.log(`PASS production regression ${process.env.WEBHOOK_REVIEW_CASE}`);
  } else {
    const { verifyWebhookRecovery } = await import('./webhook-recovery.mjs');
    for (const scenario of ['secret-lock', 'completion-lock', 'crash-backoff']) {
      await verifyWebhookRecovery({ container, sql, scenario });
      console.log(`PASS production regression ${scenario}`);
    }
    sql(
      "select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);select public.retry_webhook_delivery(w,(select id from public.webhook_deliveries where state='failed' and last_category='lease_expired' order by created_at desc limit 1)) from public.webhook_fixture;",
    );
    sql(
      `create function public.test_advance_webhook() returns void language sql security definer set search_path='' as $$ update public.webhook_deliveries set next_attempt_at=clock_timestamp()-interval '1 second',lease_until=clock_timestamp()-interval '1 day' where state in ('pending','processing');update pgmq.q_webhook_delivery set vt=clock_timestamp()-interval '1 second';$$;revoke all on function public.test_advance_webhook() from public,anon,authenticated;grant execute on function public.test_advance_webhook() to service_role;`,
    );
    sql(`
 create function public.test_dns_delivery_result() returns jsonb language sql security definer set search_path='' as $$select jsonb_build_object('state',state,'category',last_category,'retryPersisted',next_attempt_at>clock_timestamp()+interval '25 seconds') from public.webhook_deliveries where subscription_id=(select s from public.webhook_fixture) order by created_at desc limit 1;$$;
 revoke all on function public.test_dns_delivery_result() from public,anon,authenticated;grant execute on function public.test_dns_delivery_result() to service_role;
 create table public.test_consumer_effects(event_id uuid primary key,applied_at timestamptz not null default clock_timestamp());
 create function public.test_consumer_accept(p_event_id uuid) returns boolean language plpgsql security definer set search_path='' as $$begin insert into public.test_consumer_effects(event_id) values(p_event_id) on conflict do nothing;return found;end$$;
 revoke all on public.test_consumer_effects from public,anon,authenticated;revoke all on function public.test_consumer_accept(uuid) from public,anon,authenticated;grant execute on function public.test_consumer_accept(uuid) to service_role;
 create function public.test_prepare_scheduler(p_url text) returns void language plpgsql security definer set search_path='' as $$declare job_command text;begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  update public.webhook_subscriptions set target_url='https://127.0.0.1/';
  perform public.execute_operation((select w from public.webhook_fixture),'update_task','{"id":"t1","title":"Scheduler recovery"}','scheduler-hook',5);
  perform public.configure_webhook_scheduler('https://fixture.supabase.co/functions/v1/webhook-dispatch',repeat('scheduler-fixture-',3));
  perform vault.update_secret((select id from vault.secrets where name='task_manager_webhook_dispatch_url'),p_url);
  select command into job_command from cron.job where jobname='task-manager-webhooks';
  perform cron.schedule('task-manager-webhooks','1 second',job_command);
 end$$;
 create function public.test_scheduler_result() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('missed',exists(select 1 from net._http_response where status_code=503),'recovered',exists(select 1 from net._http_response where status_code=200),'failedTarget',exists(select 1 from public.webhook_deliveries where state='failed' and last_category='target_rejected'),'runs',(select count(*) from cron.job_run_details where status='succeeded'));
 $$;
 create function public.test_stop_scheduler() returns void language sql security definer set search_path='' as $$select cron.unschedule('task-manager-webhooks');$$;
 alter function public.test_prepare_scheduler(text) owner to postgres;
 alter function public.test_stop_scheduler() owner to postgres;
 revoke all on function public.test_prepare_scheduler(text),public.test_scheduler_result(),public.test_stop_scheduler() from public,anon,authenticated;
 grant execute on function public.test_prepare_scheduler(text),public.test_scheduler_result(),public.test_stop_scheduler() to service_role;
 `);
    const jwtSecret = 'webhook-test-only-signing-key-32-characters-minimum';
    docker([
      'run',
      '--detach',
      '--rm',
      '--name',
      rest,
      '--network',
      network,
      '--publish',
      '127.0.0.1::3000',
      '-e',
      `PGRST_DB_URI=postgresql://supabase_admin@${container}:5432/postgres`,
      '-e',
      'PGRST_DB_ANON_ROLE=anon',
      '-e',
      `PGRST_DB_SCHEMAS=${apiSchemas.join(',')}`,
      '-e',
      `PGRST_DB_EXTRA_SEARCH_PATH=${apiExtraSearchPath.join(',')}`,
      '-e',
      'PGRST_DB_CONFIG=false',
      '-e',
      `PGRST_JWT_SECRET=${jwtSecret}`,
      'public.ecr.aws/supabase/postgrest:v14.18',
    ]);
    const port = docker(['port', rest, '3000/tcp']).trim().split(':').at(-1);
    const base = `http://127.0.0.1:${port}`;
    let restReady = false;
    for (let i = 0; i < 100; i++) {
      try {
        const response = await globalThis.fetch(base, { signal: globalThis.AbortSignal.timeout(1000) });
        await response.body?.cancel();
        if (response.ok) {
          restReady = true;
          break;
        }
      } catch {
        /* Connection may start before PostgREST finishes its schema cache. */
      }
      await delay(100);
    }
    assert.ok(restReady, 'disposable PostgREST schema cache did not become ready');
    const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = encoded({ alg: 'HS256', typ: 'JWT' }) + '.' + encoded({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 600 });
    const token = unsigned + '.' + createHmac('sha256', jwtSecret).update(unsigned).digest('base64url');
    const signToken = claims => {
      const value = encoded({ alg: 'HS256', typ: 'JWT' }) + '.' + encoded({ ...claims, exp: Math.floor(Date.now() / 1000) + 600 });
      return value + '.' + createHmac('sha256', jwtSecret).update(value).digest('base64url');
    };
    await verifyWebhookApiBoundary({ base, signToken, productionSurface });
    // Production store includes /rest/v1; this standalone PostgREST has no Kong prefix.
    const live = spawnSync(
      'deno',
      [
        'run',
        ...(process.env.TEST_WEBHOOK_COVERAGE_DIR ? [`--coverage=${process.env.TEST_WEBHOOK_COVERAGE_DIR}`] : []),
        '--config',
        'supabase/functions/deno.json',
        '--allow-env',
        '--allow-net',
        'supabase/tests/webhook-dispatch-live.ts',
      ],
      {
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, TEST_WEBHOOK_RPC_URL: base, TEST_WEBHOOK_SERVICE_TOKEN: token },
      },
    );
    assert.equal(live.status, 0, live.stdout + '\n' + live.stderr);
    console.log(live.stdout.trim());
    console.log(
      'PASS real extensions, transactional fanout/rollback, OAuth/admin/secret isolation, eight attempts, lease fencing, crash/replay, concurrent reservation, scheduler SQL',
    );
  }
} finally {
  spawnSync('docker', ['rm', '--force', rest, container], { stdio: 'ignore' });
  spawnSync('docker', ['network', 'rm', network], { stdio: 'ignore' });
}
