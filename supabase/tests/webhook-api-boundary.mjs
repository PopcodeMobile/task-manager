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
    if (/\bexecute\s+/.test(source)) {
      // These reviewed domain dispatchers interpolate only fixed allowlisted entity tables/columns.
      assert.ok(['operation_graph', 'read_operation'].includes(object.name), `unreviewed dynamic SQL: ${object.name}`);
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
      /^(httprequestqueue|httpresponse|decryptedsecrets|webhooksubscriptions|webhookdeliveries|webhookdeliveryattempts|webhookmanualreplays|webhookdeliverysecret|configurewebhookscheduler|provisionwebhooksubscription)/.test(
        name.toLowerCase().replaceAll('_', ''),
      ),
    );
    assert.deepEqual(sensitiveNames, [], 'safe list RPCs may exist, sensitive table/types/worker RPCs must not');
    for (const field of ['httpRequestQueueCollection', 'decryptedSecretsCollection', 'webhookSubscriptionsCollection']) {
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
    for (const [name, body] of [
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
