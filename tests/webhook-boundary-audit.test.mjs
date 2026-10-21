import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditWebhookApiSurface } from '../supabase/tests/webhook-api-boundary.mjs';

const migration = name => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const before = migration('202610200005_ui_contracts');
const after = migration('202610200009_task_context_execution');
function definition(sql, name, overrides = {}) {
  const match = sql.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([^]*? as \\$\\$([^]*?)\\$\\$;`, 'i'));
  assert.ok(match, `fixture definition missing: ${name}`);
  return {
    name,
    schema: 'public',
    kind: 'function',
    source: match[1],
    definer: /security definer/i.test(match[0]),
    anon: false,
    authenticated: false,
    ...overrides,
  };
}
function catalog(wrapped = true) {
  const task = definition(before, 'operation_task');
  const read = definition(before, 'read_operation', { authenticated: true });
  if (!wrapped) return [read, task];
  return [
    definition(after, 'read_operation', { authenticated: true }),
    { ...read, name: 'read_operation_before_context', authenticated: false },
    definition(after, 'operation_task'),
    { ...task, name: 'operation_task_before_execution' },
    {
      name: 'execute_operation',
      schema: 'public',
      kind: 'function',
      source: 'perform public.operation_validate(p_operation,p_input);',
      definer: true,
      anon: false,
      authenticated: true,
    },
    definition(after, 'operation_validate'),
    definition(before, 'operation_validate', { name: 'operation_validate_before_execution' }),
  ];
}
const audit = (objects, overrides = {}) =>
  auditWebhookApiSurface({
    sql: () => JSON.stringify(objects),
    exposedSchemas: ['public', 'graphql_public'],
    extraSearchPath: ['public', 'extensions'],
    ...overrides,
  });
function change(objects, name, patch) {
  const object = objects.find(object => object.name === name);
  assert.ok(object, `fixture object missing: ${name}`);
  Object.assign(object, typeof patch === 'function' ? patch(object) : patch);
  return objects;
}

test('pre-009 inline reservation projection and reviewed dynamic read remain auditable', () => {
  assert.deepEqual(
    audit(catalog(false))
      .map(object => object.name)
      .sort(),
    ['operation_task', 'read_operation'],
  );
});
test('009 delegates remain reachable through actual reviewed wrapper definitions', () => {
  assert.deepEqual(
    audit(catalog())
      .map(object => object.name)
      .sort(),
    catalog()
      .map(object => object.name)
      .sort(),
  );
});
for (const wrapped of [false, true]) {
  const projection = wrapped ? 'operation_task_before_execution' : 'operation_task';
  for (const [label, replacement] of [
    ['claim credential', source => `${source}; select c.claim_token from public.task_claims c`],
    ['whole claim', source => source.replace("jsonb_build_object('agentId',c.agent_id", "to_jsonb(c)||jsonb_build_object('agentId',c.agent_id")],
    ['tenant scope', source => source.replace("c.workspace_id=(p_row->>'workspace_id')::uuid", 'true')],
    ['task scope', source => source.replace("c.task_id=p_row->>'id'", 'true')],
    ['lease active projection', source => source.replace('c.expires_at>clock_timestamp()', 'true')],
  ]) {
    test(`${wrapped ? '009 predecessor' : 'inline'} rejects unsafe ${label}`, () => {
      assert.throws(() => audit(change(catalog(wrapped), projection, object => ({ source: replacement(object.source) }))));
    });
  }
}
for (const name of ['operation_task', 'operation_task_before_execution', 'operation_validate_before_execution']) {
  for (const flag of ['definer', 'anon', 'authenticated']) {
    test(`009 ${name} rejects ${flag} elevation`, () => {
      assert.throws(() => audit(change(catalog(), name, { [flag]: true })), /private|never an RPC/);
    });
  }
}
for (const flag of ['anon', 'authenticated']) {
  test(`009 read predecessor rejects ${flag} RPC exposure`, () => {
    assert.throws(() => audit(change(catalog(), 'read_operation_before_context', { [flag]: true })), /private|never an RPC/);
  });
}
for (const name of ['read_operation', 'read_operation_before_context']) {
  test(`009 ${name} retains the reviewed security definer authorization seam`, () => {
    assert.throws(() => audit(change(catalog(), name, { definer: false })), /authorization boundary/);
  });
}
test('009 execution wrapper must retain the predecessor reservation in its result', () => {
  assert.throws(
    () =>
      audit(
        change(catalog(), 'operation_task', object => ({
          source: object.source.replace("return (data-'executionState'-'blockingReason')", "return (data-'reservation')"),
        })),
      ),
    /reservation projection/,
  );
});
for (const [wrapper, predecessor] of [
  ['operation_task', 'operation_task_before_execution'],
  ['read_operation', 'read_operation_before_context'],
]) {
  test(`${wrapper} rejects a missing or ambiguous predecessor`, () => {
    assert.throws(() => audit(catalog().filter(object => object.name !== predecessor)), /predecessor/);
    const objects = catalog();
    objects.push({ ...objects.find(object => object.name === predecessor) });
    assert.throws(() => audit(objects), /predecessor/);
  });
  test(`${wrapper} rejects delegation with changed scope arguments`, () => {
    assert.throws(
      () =>
        audit(
          change(catalog(), wrapper, object => ({
            source: object.source.replace(`${predecessor}(${wrapper === 'operation_task' ? 'p_row' : 'p_workspace_id'}`, `${predecessor}(null`),
          })),
        ),
      /delegation/,
    );
  });
}
for (const name of ['operation_task', 'operation_task_before_execution', 'read_operation_before_context']) {
  for (const schema of ['net', 'vault', 'pgmq', 'cron'])
    test(`${schema} bridges reached through ${name} remain forbidden`, () => {
      const objects = change(catalog(), name, object => ({ source: `${object.source}; perform public.hidden_bridge();` }));
      objects.push({
        name: 'hidden_bridge',
        schema: 'public',
        kind: 'function',
        source: `select ${schema}.sensitive_object;`,
        definer: false,
        anon: false,
        authenticated: false,
      });
      assert.throws(() => audit(objects), /sensitive API bridge: hidden_bridge/);
    });
}
test('unreviewed dynamic SQL behind a predecessor remains forbidden', () => {
  const objects = change(catalog(), 'read_operation_before_context', object => ({ source: `${object.source}; perform public.hidden_dispatch();` }));
  objects.push({
    name: 'hidden_dispatch',
    schema: 'public',
    kind: 'function',
    source: 'begin execute p_query; end',
    definer: false,
    anon: false,
    authenticated: false,
  });
  assert.throws(() => audit(objects), /unreviewed dynamic SQL: hidden_dispatch/);
});
test('009 wrapper names do not gain a dynamic SQL exception', () => {
  assert.throws(() => audit(change(catalog(), 'operation_task', object => ({ source: `${object.source}; execute p_row::text;` }))), /unreviewed dynamic SQL/);
});
test('sensitive schema exposure and extra search paths remain forbidden', () => {
  assert.throws(() => audit(catalog(), { exposedSchemas: ['public', 'vault'] }), /unreviewed exposed schema/);
  assert.throws(() => audit(catalog(), { extraSearchPath: ['public', 'extensions', 'net'] }), /unreviewed API\/GraphQL extra search path/);
});

const branding = migration('202610210010_organization_branding');
function brandingCatalog() {
  const objects = catalog();
  change(objects, 'read_operation', { name: 'read_operation_before_branding', authenticated: false });
  change(objects, 'operation_validate', { name: 'operation_validate_before_branding' });
  objects.push(
    definition(branding, 'read_operation', { authenticated: true }),
    definition(branding, 'operation_validate'),
    definition(branding, 'organization_logo_access', { authenticated: true }),
  );
  return objects;
}
test('010 branding delegates remain reachable through actual reviewed definitions', () => {
  assert.deepEqual(
    audit(brandingCatalog())
      .map(object => object.name)
      .sort(),
    brandingCatalog()
      .map(object => object.name)
      .sort(),
  );
});
for (const flag of ['anon', 'authenticated']) {
  test(`010 read predecessor rejects ${flag} RPC exposure`, () => {
    assert.throws(() => audit(change(brandingCatalog(), 'read_operation_before_branding', { [flag]: true })), /private|never an RPC/);
  });
}
test('010 read predecessor retains the reviewed security definer boundary', () => {
  assert.throws(() => audit(change(brandingCatalog(), 'read_operation_before_branding', { definer: false })), /authorization boundary/);
});
for (const flag of ['definer', 'anon', 'authenticated']) {
  test(`010 validator predecessor rejects ${flag} elevation`, () => {
    assert.throws(() => audit(change(brandingCatalog(), 'operation_validate_before_branding', { [flag]: true })), /private|never an RPC/);
  });
}
for (const name of ['read_operation', 'read_operation_before_branding']) {
  for (const argument of ['p_workspace_id', 'p_operation', 'p_query']) {
    test(`010 ${name} rejects changed delegation ${argument}`, () => {
      const predecessor = name === 'read_operation' ? 'read_operation_before_branding' : 'read_operation_before_context';
      assert.throws(
        () =>
          audit(
            change(brandingCatalog(), name, object => ({
              source: object.source.replace(
                `${predecessor}(p_workspace_id,p_operation,p_query)`,
                `${predecessor}(${['p_workspace_id', 'p_operation', 'p_query'].map(value => (value === argument ? 'null' : value)).join(',')})`,
              ),
            })),
          ),
        /delegation/,
      );
    });
  }
}
test('010 read wrapper rejects missing and ambiguous branding predecessors', () => {
  assert.throws(() => audit(brandingCatalog().filter(object => object.name !== 'read_operation_before_branding')), /predecessor/);
  const objects = brandingCatalog();
  objects.push({ ...objects.find(object => object.name === 'read_operation_before_branding') });
  assert.throws(() => audit(objects), /predecessor/);
});
for (const [name, pattern, replacement] of [
  ['get workspace returned ID', "id=(result->'data'->>'id')::uuid", 'true'],
  ['list authorized result rows', "jsonb_array_elements(result->'items')", "jsonb_array_elements(p_query->'items')"],
  ['list returned ID', "w.id=(item->>'id')::uuid", 'true'],
]) {
  test(`010 read projection rejects changed ${name}`, () => {
    assert.throws(
      () => audit(change(brandingCatalog(), 'read_operation', object => ({ source: object.source.replace(pattern, replacement) }))),
      /projection|delegation/,
    );
  });
}
for (const name of ['read_operation_before_branding', 'operation_validate_before_branding', 'organization_logo_access']) {
  for (const schema of ['net', 'vault', 'pgmq', 'cron']) {
    test(`010 ${schema} bridge behind ${name} stays forbidden`, () => {
      const objects = change(brandingCatalog(), name, object => ({ source: `${object.source}; perform public.branding_hidden_bridge();` }));
      objects.push({
        name: 'branding_hidden_bridge',
        schema: 'public',
        kind: 'function',
        source: `select ${schema}.sensitive_object;`,
        definer: false,
        anon: false,
        authenticated: false,
      });
      assert.throws(() => audit(objects), /sensitive API bridge: branding_hidden_bridge/);
    });
  }
  test(`010 ${name} does not gain a dynamic SQL exception`, () => {
    assert.throws(() => audit(change(brandingCatalog(), name, object => ({ source: `${object.source}; execute 'select 1';` }))), /unreviewed dynamic SQL/);
  });
}
for (const [label, patch] of [
  ['anon RPC', { anon: true }],
  ['invoker downgrade', { definer: false }],
  ['changed authority workspace', object => ({ source: object.source.replace("split_part(p_name,'/',1)::uuid", 'null') })],
  ['OAuth writes', object => ({ source: object.source.replace("a->>'clientId' is null", 'true') })],
  ['agent writes', object => ({ source: object.source.replace("a->>'agentId' is null", 'true') })],
  ['member writes', object => ({ source: object.source.replace("a->>'role' in ('owner','admin')", "a->>'role' in ('owner','admin','member')") })],
  ['arbitrary path', object => ({ source: object.source.replace('p_name !~', 'p_name ~') })],
]) {
  test(`010 logo authority rejects ${label}`, () => {
    assert.throws(() => audit(change(brandingCatalog(), 'organization_logo_access', patch)), /logo|authority/);
  });
}

test('010 read entrypoint retains the reviewed security definer boundary', () => {
  assert.throws(() => audit(change(brandingCatalog(), 'read_operation', { definer: false })), /authorization boundary/);
});
test('010 nested context predecessor remains required and unambiguous', () => {
  assert.throws(() => audit(brandingCatalog().filter(object => object.name !== 'read_operation_before_context')), /predecessor/);
  const objects = brandingCatalog();
  objects.push({ ...objects.find(object => object.name === 'read_operation_before_context') });
  assert.throws(() => audit(objects), /predecessor/);
});
