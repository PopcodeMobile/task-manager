/** Audit app-owned API bridges and exercise the real PostgREST boundary, never vendor SQL denial. */
import assert from 'node:assert/strict';
import console from 'node:console';
const sensitiveSchemas = ['net', 'vault', 'pgmq', 'cron'];
export function auditWebhookApiSurface({ sql, exposedSchemas, extraSearchPath }) {
  assert.ok(Array.isArray(exposedSchemas) && exposedSchemas.length, 'unknown Data API exposure must block activation');
  assert.ok(
    exposedSchemas.every(schema => ['public', 'graphql_public'].includes(schema)),
    'unreviewed exposed schema',
  );
  assert.deepEqual(extraSearchPath, ['public', 'extensions'], 'unknown or unreviewed API/GraphQL extra search path');
  const objects = JSON.parse(
    sql(`
 select coalesce(jsonb_agg(obj),'[]') from (
  select jsonb_build_object('name',p.proname,'kind','function','schema',n.nspname,'source',p.prosrc,'definer',p.prosecdef,
   'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute')) obj
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','graphql_public') and p.prokind='f' and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
  union all
  select jsonb_build_object('name',c.relname,'kind','view','schema',n.nspname,'source',pg_get_viewdef(c.oid),'definer',true,
   'anon',has_table_privilege('anon',c.oid,'select'),'authenticated',has_table_privilege('authenticated',c.oid,'select'))
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','graphql_public') and c.relkind in ('v','m')
 ) surface;
 `).trim(),
  );
  const predecessor = name => {
    const matches = objects.filter(object => object.name === name && object.schema === 'public' && object.kind === 'function');
    assert.equal(matches.length, 1, `missing or ambiguous reviewed predecessor: ${name}`);
    return matches[0];
  };
  const hasPredecessor = name => objects.some(object => object.name === name);
  // Deliberately includes INVOKER functions/views and private helper chains, not only DEFINER roots.
  const reachable = new Set();
  const visit = object => {
    if (reachable.has(object)) return;
    reachable.add(object);
    const source = object.source.replaceAll('"', '').toLowerCase();
    // The reviewed owner/admin replay sends only this delivery ID to the fixed application queue.
    // It does not expose a generic queue reader/sender or request headers.
    let checkedSource = source;
    if (object.name === 'retry_webhook_delivery') {
      assert.match(source, /public\.webhook_admin\(p_workspace_id\)/);
      assert.match(source, /public\.webhook_connection_allowed\(d\.subscription_id\)/);
      checkedSource = source.replace("pgmq.send('webhook_delivery',jsonb_build_object('delivery_id',d.id))", 'reviewed_fixed_delivery_replay()');
    }
    assert.doesNotMatch(checkedSource, /\b(?:net|vault|pgmq|cron)\s*\./, `sensitive API bridge: ${object.name}`);
    if (['operation_task', 'operation_task_before_execution'].includes(object.name)) {
      assert.equal(object.definer, false, 'reservation projection must retain the private invoker seam');
      assert.equal(object.anon || object.authenticated, false, 'reservation helper is never an RPC');
      assert.doesNotMatch(source, /claim_token|to_jsonb\(c/);
      if (object.name === 'operation_task' && (hasPredecessor('operation_task_before_execution') || source.includes('operation_task_before_execution'))) {
        predecessor('operation_task_before_execution');
        assert.match(source, /data\s*:=\s*public\.operation_task_before_execution\(p_row\);/, 'reviewed reservation delegation must preserve its row');
        assert.match(
          source,
          /return \(data-'executionstate'-'blockingreason'\)\|\|jsonb_build_object\('execution',/,
          'reviewed wrapper must preserve the reservation projection',
        );
      } else {
        // 009 renamed the reviewed projection; pre-009 catalogs still use the original name.
        assert.match(
          source,
          /jsonb_build_object\('agentid',c.agent_id,'claimedat',c.claimed_at,'expiresat',c.expires_at,'active',c.expires_at>clock_timestamp\(\)\)/,
        );
        assert.match(source, /c.workspace_id=\(p_row->>'workspace_id'\)::uuid and c.task_id=p_row->>'id'/);
      }
    }
    const brandingRead = hasPredecessor('read_operation_before_branding');
    if (object.name === 'read_operation' && (brandingRead || source.includes('read_operation_before_branding'))) {
      predecessor('read_operation_before_branding');
      assert.equal(object.definer, true, 'reviewed read entrypoint must retain its authorization boundary');
      assert.match(
        source,
        /result\s*:=\s*public\.read_operation_before_branding\(p_workspace_id,p_operation,p_query\);/,
        'reviewed branding read delegation must preserve workspace, operation and query',
      );
      assert.match(
        source,
        /if p_operation='get_workspace' and jsonb_typeof\(result->'data'\)='object' then/,
        'branding get projection requires its authorized result',
      );
      assert.match(
        source,
        /select logo_path from public\.workspaces where id=\(result->'data'->>'id'\)::uuid/,
        'branding get projection must retain its returned workspace ID',
      );
      assert.match(source, /elsif p_operation='list_workspaces' then/, 'branding list projection must retain its operation');
      assert.match(
        source,
        /from jsonb_array_elements\(result->'items'\) with ordinality as x\(item,ord\)\s+join public\.workspaces w on w.id=\(item->>'id'\)::uuid/,
        'branding list projection must retain only authorized returned IDs',
      );
    }
    if (object.name === 'read_operation_before_branding') {
      assert.equal(object.anon || object.authenticated, false, 'branding read predecessor must remain private, never an RPC');
      assert.equal(object.definer, true, 'branding read predecessor retains the reviewed authorization boundary');
      assert.match(
        predecessor('read_operation').source.toLowerCase(),
        /result\s*:=\s*public\.read_operation_before_branding\(p_workspace_id,p_operation,p_query\);/,
        'reviewed branding predecessor requires its scoped delegation',
      );
    }
    if (
      ['read_operation', 'read_operation_before_branding'].includes(object.name) &&
      !(object.name === 'read_operation' && brandingRead) &&
      (hasPredecessor('read_operation_before_context') || source.includes('read_operation_before_context'))
    ) {
      predecessor('read_operation_before_context');
      assert.equal(object.definer, true, 'reviewed read entrypoint must retain its authorization boundary');
      assert.match(
        source,
        /return public\.read_operation_before_context\(p_workspace_id,p_operation,p_query\);/,
        'reviewed read delegation must preserve workspace, operation and query',
      );
    }
    if (object.name === 'read_operation_before_context') {
      assert.equal(object.anon || object.authenticated, false, 'read predecessor must remain private, never an RPC');
      assert.equal(object.definer, true, 'read predecessor retains the reviewed authorization boundary');
      assert.match(
        predecessor(brandingRead ? 'read_operation_before_branding' : 'read_operation').source.toLowerCase(),
        /return public\.read_operation_before_context\(p_workspace_id,p_operation,p_query\);/,
        'reviewed read predecessor requires its scoped delegation',
      );
    }
    if (object.name === 'organization_logo_access') {
      assert.equal(object.definer, true, 'logo authority retains its security definer boundary');
      assert.equal(object.anon, false, 'logo authority is never an anonymous RPC');
      assert.match(
        source,
        /a\s*:=\s*public\.operation_authorize\(split_part\(p_name,'\/',1\)::uuid,false\);/,
        'logo authority must preserve exact workspace authorization',
      );
      const pathPattern =
        "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.webp$'";
      assert.ok(source.includes(`if p_name is null or p_name !~ ${pathPattern} then return false;end if;`), 'logo authority must reject arbitrary paths');
      assert.match(
        source,
        /return not p_write or \(a->>'role' in \('owner','admin'\) and a->>'clientid' is null and a->>'agentid' is null\);/,
        'logo authority permits writes only to owner/admin humans',
      );
    }
    if (
      [
        'operation_capability',
        'operation_batch_allowed',
        'operation_validate',
        'operation_validate_before_execution',
        'operation_validate_before_branding',
        'operation_validate_before_file_duplication',
        'operation_graph',
        'operation_graph_before_file_duplication',
        'operation_graph_before_task_graph_copy',
        'operation_validate_before_task_graph_copy',
        'operation_batch_allowed_before_task_graph_copy',
      ].includes(object.name)
    ) {
      assert.equal(object.definer || object.anon || object.authenticated, false, 'batch capability helpers must remain private invokers');
    }
    const tokenInvokers = [
      'organization_agent_actor',
      'organization_agent_metadata',
      'organization_agent_issue',
      'organization_agent_verify',
      'organization_agent_attribution',
    ];
    if (tokenInvokers.includes(object.name)) {
      assert.equal(object.definer || object.anon || object.authenticated, false, 'organization token helpers remain private invokers, never an RPC');
    }
    if (['organization_agent_admin', 'operation_authorize_before_organization_tokens'].includes(object.name)) {
      assert.equal(object.anon || object.authenticated, false, 'organization authority helpers remain private, never an RPC');
      assert.equal(object.definer, true, 'organization authority retains its definer boundary');
    }
    if (object.name === 'organization_agent_actor') {
      assert.match(
        source,
        /from public\.organization_agent_context where backend_pid=pg_backend_pid\(\) and transaction_id=txid_current\(\)/,
        'context must be bound to a private transaction row',
      );
      assert.doesNotMatch(source, /current_setting|set_config/, 'caller settings cannot authorize a token');
    }
    if (object.name === 'organization_agent_verify') {
      assert.match(source, /p_token !~ '\^krs_/, 'token verifier requires the credential format');
      assert.match(source, /for update of x/, 'token verifier locks the stable connection before effects');
      assert.match(source, /k\.secret_hash<>sha256\(convert_to\(substr\(p_token,38\),'utf8'\)\)/, 'token verifier requires secret hash validation');
      assert.match(source, /c\.revoked_at is not null/, 'token verifier must reject revoked connections');
      assert.match(source, /k\.revoked_at is not null or k\.expires_at<=clock_timestamp\(\)/, 'token verifier checks current credential authority');
    }
    if (['authenticate_organization_agent_token', 'read_organization_agent_operation', 'execute_organization_agent_operation'].includes(object.name)) {
      assert.equal(object.definer, true, 'token RPC retains its definer boundary');
      assert.match(source, /public\.organization_agent_verify\(p_token\)/, 'token RPC requires secret verification on every call');
      if (object.name !== 'authenticate_organization_agent_token') {
        assert.match(source, /p_workspace_id is distinct from \(a->>'workspaceid'\)::uuid/, 'token RPC requires exact organization scope');
        assert.match(
          source,
          /insert into public\.organization_agent_context values\(pg_backend_pid\(\),txid_current\(\),a\)/,
          'token context can only be installed after validation',
        );
        assert.match(
          source,
          /delete from public\.organization_agent_context where backend_pid=pg_backend_pid\(\) and transaction_id=txid_current\(\)/,
          'token context cannot persist beyond the operation',
        );
      }
      if (object.name === 'read_organization_agent_operation')
        assert.match(
          source,
          /p_operation not in \('list_workspaces','list_projects','list_tasks','get_task','list_task_activity'\)/,
          'token read allowlist must remain narrow',
        );
      if (object.name === 'execute_organization_agent_operation') {
        assert.match(
          source,
          /p_operation not in \('create_task','claim_task','renew_task_claim','release_task_claim','update_task','add_task_comment','complete_task'\)/,
          'token write allowlist must remain narrow',
        );
        assert.match(source, /a->>'capability'<>'write'/, 'read credentials cannot execute writes');
      }
    }
    if (
      ['create_organization_agent_token', 'list_organization_agent_tokens', 'rotate_organization_agent_token', 'revoke_organization_agent_token'].includes(
        object.name,
      )
    ) {
      assert.equal(object.anon, false, 'token management is never anonymous');
      assert.equal(object.definer, true, 'token management retains its definer boundary');
      assert.match(source, /public\.organization_agent_admin\(p_workspace_id\)/, 'token management requires current human administrator');
    }
    if (/\bexecute\s+/.test(source)) {
      // These reviewed domain dispatchers interpolate only fixed allowlisted entity tables/columns.
      assert.ok(
        ['operation_graph', 'operation_graph_before_file_duplication', 'read_operation', 'read_operation_before_context'].includes(object.name),
        `unreviewed dynamic SQL: ${object.name}`,
      );
    }
    for (const child of objects) {
      const reference = new RegExp(`\\b(?:public\\.)?${child.name}\\s*\\(|\\b(?:from|join)\\s+(?:public\\.)?${child.name}\\b`);
      if (reference.test(source)) visit(child);
    }
  };
  for (const object of objects) if (exposedSchemas.includes(object.schema) && (object.anon || object.authenticated)) visit(object);
  return [...reachable].map(({ name, kind, definer }) => ({ name, kind, definer }));
}
export async function verifyWebhookApiBoundary({ base, signToken, productionSurface }) {
  const principals = [
    ['anon', {}],
    ['human', { authorization: `Bearer ${signToken({ role: 'authenticated', sub: '00000000-0000-0000-0000-000000000001' })}` }],
    [
      'oauth',
      {
        authorization: `Bearer ${signToken({ role: 'authenticated', sub: '00000000-0000-0000-0000-000000000001', client_id: '10000000-0000-0000-0000-000000000001' })}`,
      },
    ],
  ];
  const denied = async (path, headers, body, code) => {
    const response = await globalThis.fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    assert.ok([401, 403, 404, 406].includes(response.status), `unexpected API boundary status ${response.status}/${payload.code} at ${path}`);
    assert.ok(payload.code && !Array.isArray(payload), 'expected a safe PostgREST error, never row data');
    if (code) assert.equal(payload.code, code);
    assert.equal(JSON.stringify(payload).includes('scheduler-fixture-'), false, 'credential echoed in error');
    assert.equal(JSON.stringify(payload).includes('fixture-key-'), false, 'signing secret echoed in error');
  };
  for (const [, headers] of principals) {
    const graphql = async query => {
      const response = await globalThis.fetch(base + '/rpc/graphql', {
        method: 'POST',
        headers: { ...headers, 'content-profile': 'graphql_public', 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      assert.equal(response.status, 200, 'enabled native GraphQL endpoint must answer');
      return response.json();
    };
    const schema = await graphql('{ __schema { types { name fields { name } } } }');
    assert.ok(schema.data?.__schema, 'native GraphQL introspection must be enabled in isolated fixture');
    const names = schema.data.__schema.types.flatMap(type => [type.name, ...(type.fields ?? []).map(field => field.name)]);
    const sensitiveNames = names.filter(name =>
      /^(httprequestqueue|httpresponse|decryptedsecrets|webhooksubscriptions|webhookdeliveries|webhookdeliveryattempts|webhookmanualreplays|webhookdeliverysecret|organizationagentcredentials|organizationagentconnections|organizationagentcontext|organizationagentaudit|configurewebhookscheduler|provisionwebhooksubscription)/.test(
        name.toLowerCase().replaceAll('_', ''),
      ),
    );
    assert.deepEqual(sensitiveNames, [], 'safe list RPCs may exist, sensitive table/types/worker RPCs must not');
    for (const field of [
      'httpRequestQueueCollection',
      'decryptedSecretsCollection',
      'webhookSubscriptionsCollection',
      'organizationAgentCredentialsCollection',
      'organizationAgentContextCollection',
    ]) {
      const result = await graphql(`{ ${field} { edges { node { id } } } }`);
      assert.ok(result.errors?.length && !result.data, 'GraphQL must reject sensitive fields, never return rows');
    }

    for (const schema of sensitiveSchemas) {
      await denied('/http_request_queue?select=*', { ...headers, 'accept-profile': schema }, undefined, 'PGRST106');
      await denied('/rpc/http_post', { ...headers, 'content-profile': schema }, { url: 'https://example.com/' }, 'PGRST106');
    }
    for (const alias of ['http_request_queue', '_http_response', 'decrypted_secrets', 'secrets', 'q_webhook_delivery', 'a_webhook_delivery', 'job']) {
      await denied(`/${alias}?select=*`, headers, undefined, 'PGRST205');
    }
    for (const alias of ['http_post', 'http_get', 'http_collect_response', 'create_secret', 'read', 'schedule']) {
      await denied(`/rpc/${alias}`, headers, {}, 'PGRST202');
    }
    if (productionSurface.some(object => object.name === 'organization_agent_verify')) {
      for (const relation of ['organization_agent_credentials', 'organization_agent_connections', 'organization_agent_context', 'organization_agent_audit'])
        await denied(`/${relation}?select=*`, headers);
      for (const [name, body] of [
        ['organization_agent_actor', {}],
        ['organization_agent_verify', { p_token: 'krs_invalid' }],
        ['organization_agent_issue', { p_connection_id: '00000000-0000-0000-0000-000000000000', p_expires_in_days: 90 }],
        ['organization_agent_admin', { p_workspace_id: '00000000-0000-0000-0000-000000000000' }],
      ])
        await denied(`/rpc/${name}`, headers, body);
    }
    for (const [name, body] of [
      ['operation_validate', { p_operation: 'duplicate_file', p_input: { id: 'source' } }],
      ['operation_validate_before_file_duplication', { p_operation: 'create_file', p_input: { name: 'forged' } }],
      ['operation_validate_before_task_graph_copy', { p_operation: 'duplicate_task_graph', p_input: { id: 'source', projectId: 'p1', mode: 'task' } }],
      ['operation_batch_allowed_before_task_graph_copy', { p_operation: 'duplicate_task_graph' }],
      ...['operation_graph', 'operation_graph_before_file_duplication', 'operation_graph_before_task_graph_copy'].map(name => [
        name,
        {
          p_workspace: '00000000-0000-0000-0000-000000000000',
          p_operation: 'duplicate_file',
          p_input: { id: 'source' },
          p_expected: 1,
          p_actor: { userId: '00000000-0000-0000-0000-000000000001' },
        },
      ]),
      ['claim_webhook_batch', {}],
      ['webhook_delivery_secret', { p_delivery_id: '00000000-0000-0000-0000-000000000000', p_lease_token: '00000000-0000-0000-0000-000000000000' }],
      [
        'complete_webhook_delivery',
        { p_delivery_id: '00000000-0000-0000-0000-000000000000', p_lease_token: '00000000-0000-0000-0000-000000000000', p_category: 'accepted', p_status: 200 },
      ],
      [
        'configure_webhook_scheduler',
        { p_dispatch_url: 'https://fixture.supabase.co/functions/v1/webhook-dispatch', p_worker_secret: 'must-not-provision'.repeat(3) },
      ],
      [
        'provision_webhook_subscription',
        {
          p_workspace_id: '00000000-0000-0000-0000-000000000000',
          p_connection_id: '00000000-0000-0000-0000-000000000000',
          p_admin_user_id: '00000000-0000-0000-0000-000000000001',
          p_target_url: 'https://example.com/',
          p_secret: 'must-not-provision'.repeat(3),
        },
      ],
    ])
      await denied(`/rpc/${name}`, headers, body);
  }
  console.log(
    `PASS real PostgREST anon/human/OAuth: four excluded schemas, relation/function aliases and five privileged RPCs denied; enabled native GraphQL sensitive types/fields absent; audited ${productionSurface.length} reachable production functions/views including INVOKER/helper chains`,
  );
}
