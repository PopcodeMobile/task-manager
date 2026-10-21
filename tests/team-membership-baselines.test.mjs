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
const guest = '00000000-0000-0000-0000-000000000002';
const baseline = (teamIds = [], userId = member) => [{ userId, teamIds }];
const reject = (promise, code) => assert.rejects(promise, e => e.code === code || e.message === code);
async function setup(
  kind,
  teams = [
    { id: 'a', name: 'A', unknown: { preserved: [42] } },
    { id: 'b', name: 'B' },
  ],
) {
  const payload = {
    teams,
    projects: [],
    tasks: [],
    members: [
      { id: owner, role: 'Owner', team: '' },
      { id: member, role: 'Member', team: '' },
    ],
    me: owner,
  };
  if (kind === 'local') {
    const values = new Map([['gr8r.v2', JSON.stringify({ data: { ...seed(), ...payload } })]]);
    const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
    const persistence = createLocalRepository({ storage, seed, blank: emptyWorkspace });
    const options = { persistence, storage, identity: 'local', workspaceId: null };
    options.workspaceId = (await createLocalWorkspaceRepository(options).workspaces())[0].id;
    const repo = createLocalWorkspaceRepository(options);
    return {
      command: (op, input, expectedVersion, idempotencyKey = crypto.randomUUID()) => repo.command(op, { input, expectedVersion, idempotencyKey }),
      list: op => repo.list(op),
      snapshot: async () => [...values],
      change: async fn => {
        const record = await persistence.load(repo.workspaceId);
        fn(record.data);
        await persistence.save(repo.workspaceId, record.data, record.revision);
      },
      close: async () => {},
    };
  }
  const db = new PGlite();
  for (const f of [
    'supabase/tests/bootstrap.sql',
    ...[
      '202610160001_workspaces',
      '202610200001_normalized_work',
      '202610200002_agent_operations',
      '202610200005_ui_contracts',
      '202610200006_file_duplication',
      '202610200007_task_graph_copy',
    ].map(n => `supabase/migrations/${n}.sql`),
  ])
    await db.exec(await readFile(f, 'utf8'));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  const ws = (await db.query('select public.create_workspace($1,$2,$3) id', ['Guard', 'guard', JSON.stringify(payload)])).rows[0].id;
  await db.query('select public.migrate_workspace($1,0)', [ws]);
  await db.query("insert into public.workspace_memberships values($1,$2,'member'),($1,$3,'guest')", [ws, member, guest]);
  const command = async (op, input, expected = null, key = crypto.randomUUID(), workspace = ws) =>
    (await db.query('select public.execute_operation($1,$2,$3,$4,$5) result', [workspace, op, JSON.stringify(input), key, expected])).rows[0].result;
  await db.exec('begin;set role authenticated');
  await command('batch', { commands: [{ operation: 'update_team', input: { id: 'a', name: 'Warm007' }, expectedVersion: 1 }] });
  await db.exec('rollback');
  const migration = await readFile('supabase/migrations/202610200008_team_membership_baselines.sql', 'utf8').catch(() => null);
  if (migration) await db.exec(migration);
  await db.exec('set role authenticated');
  return {
    db,
    ws,
    command,
    list: async op => (await db.query("select public.read_operation($1,$2,'{}') result", [ws, op])).rows[0].result.items,
    snapshot: async () => {
      await db.exec('reset role');
      const rows = [];
      for (const table of ['teams', 'team_members', 'domain_events', 'idempotency_requests', 'operation_rate_limits'])
        rows.push((await db.query(`select to_jsonb(t) data from public.${table} t order by to_jsonb(t)::text`)).rows);
      await db.exec('set role authenticated');
      return rows;
    },
    close: () => db.close(),
  };
}
for (const kind of ['local', 'sql']) {
  test(`${kind}: serialized disjoint replacement rejects stale empty baseline and rolls back whole batch`, async () => {
    const h = await setup(kind);
    try {
      const plan = id => ({
        commands: [
          { operation: 'update_team', input: { id, name: `Edited ${id}`, expectedMemberships: baseline() }, expectedVersion: 1 },
          { operation: 'set_team_member', input: { id, userId: member }, expectedVersion: 2 },
        ],
      });
      const a = plan('a'),
        b = plan('b');
      const result = await h.command('batch', a, undefined, 'plan-a');
      const before = await h.snapshot();
      await reject(h.command('batch', b, undefined, 'plan-b'), 'version_conflict');
      assert.deepEqual(await h.snapshot(), before);
      assert.deepEqual(await h.command('batch', a, undefined, 'plan-a'), result, 'replay skips now-obsolete guard');
      const reviewed = {
        commands: [
          { operation: 'update_team', input: { id: 'b', expectedMemberships: baseline(['a']) }, expectedVersion: 1 },
          { operation: 'remove_team_member', input: { id: 'a', userId: member }, expectedVersion: 3 },
          { operation: 'set_team_member', input: { id: 'b', userId: member }, expectedVersion: 2 },
        ],
      };
      await h.command('batch', reviewed);
      assert.deepEqual(
        (await h.list('list_team_members')).filter(r => r.userId === member).map(r => r.teamId),
        ['b'],
      );
      const teamA = (await h.list('list_teams')).find(t => t.id === 'a');
      assert.deepEqual(teamA.legacyMetadata.unknown, { preserved: [42] });
      assert.equal(Object.hasOwn(teamA.legacyMetadata, 'expectedMemberships'), false);
    } finally {
      await h.close();
    }
  });
  test(`${kind}: newly created team phantom and selected-member drift conflict before any writes`, async () => {
    const h = await setup(kind);
    try {
      await h.command('create_team', { id: 'newer', name: 'Newer', expectedMemberships: baseline() });
      await h.command('set_team_member', { id: 'newer', userId: member }, 1);
      const before = await h.snapshot();
      for (const expectedMemberships of [baseline(), baseline(['a'])]) {
        await reject(
          h.command('batch', {
            commands: [
              { operation: 'create_team', input: { id: 'rollback', name: 'Rollback' } },
              { operation: 'update_team', input: { id: 'b', expectedMemberships }, expectedVersion: 1 },
            ],
          }),
          'version_conflict',
        );
        assert.deepEqual(await h.snapshot(), before);
      }
      const result = await h.command('create_team', { id: 'reviewed', name: 'Reviewed', expectedMemberships: baseline(['newer']) });
      assert.equal(Object.hasOwn(result.data.legacyMetadata, 'expectedMemberships'), false);
      assert.equal((await h.list('list_teams')).find(t => t.id === 'newer').version, 2, 'guard never bumps other teams');
    } finally {
      await h.close();
    }
  });
  test(`${kind}: strict guard shape, duplicates, exact IDs and whole-request limits are atomic`, async () => {
    const h = await setup(kind);
    try {
      const before = await h.snapshot();
      for (const expectedMemberships of [
        null,
        {},
        [null],
        [{}],
        [{ userId: member }],
        [{ userId: member, teamIds: [], extra: true }],
        baseline(null),
        baseline([null]),
        baseline(['a', 'a']),
        [...baseline(), ...baseline()],
        baseline([12]),
        baseline([], 12),
        baseline(['\u00a0']),
        baseline(['x'.repeat(129)]),
      ]) {
        await reject(h.command('update_team', { id: 'b', expectedMemberships }, 1), 'validation_error');
        assert.deepEqual(await h.snapshot(), before);
      }
      await reject(h.command('set_team_member', { id: 'a', userId: member, expectedMemberships: [] }, 1), 'validation_error');
      await reject(
        h.command('batch', { commands: Array(101).fill({ operation: 'update_team', input: { id: 'a', expectedMemberships: [] }, expectedVersion: 1 }) }),
        'validation_error',
      );
      await reject(
        h.command('batch', {
          commands: [
            { operation: 'create_team', input: { id: 'large', name: 'Large' } },
            ...Array.from({ length: 30 }, (_, i) => ({
              operation: 'create_team',
              input: { id: `large${i}`, name: 'Large', description: 'x'.repeat(10000), expectedMemberships: [] },
            })),
          ],
        }),
        'validation_error',
      );
      assert.deepEqual(await h.snapshot(), before);
      for (const expectedMemberships of [baseline(['missing']), baseline([], '00000000-0000-0000-0000-000000000099')]) {
        await reject(h.command('update_team', { id: 'b', expectedMemberships }, 1), 'version_conflict');
        assert.deepEqual(await h.snapshot(), before);
      }
      await h.command('update_team', { id: 'a', expectedMemberships: [] }, 1);
      await h.command('update_team', { id: 'a', expectedMemberships: baseline() }, 2);
    } finally {
      await h.close();
    }
  });
}
test('SQL: unguarded multi-team compatibility, set order, UUID case and current authorization/replay', async () => {
  const h = await setup('sql');
  try {
    await h.command('set_team_member', { id: 'a', userId: member }, 1);
    await h.command('set_team_member', { id: 'b', userId: member }, 1);
    assert.equal((await h.list('list_team_members')).length, 2);
    const result = await h.command('update_team', { id: 'a', expectedMemberships: baseline(['b', 'a']) }, 2, 'receipt');
    await h.command('remove_team_member', { id: 'b', userId: member }, 2);
    assert.deepEqual(await h.command('update_team', { id: 'a', expectedMemberships: baseline(['b', 'a']) }, 2, 'receipt'), result);
    await h.db.query("select set_config('request.jwt.claim.sub',$1,false)", [guest]);
    await reject(h.command('update_team', { id: 'a', expectedMemberships: [] }, 3), 'forbidden');
    await h.db.query("select set_config('request.jwt.claim.sub',$1,false)", [member]);
    await reject(h.command('create_team', { name: 'Other', expectedMemberships: [] }, undefined, 'tenant', crypto.randomUUID()), 'forbidden');
    await h.db.exec('reset role');
    await h.db.query("insert into public.agents(workspace_id,id,name,auth_user_id) values($1,'agent','Agent',$2)", [h.ws, member]);
    await h.db.exec('set role authenticated');
    const input = { id: 'b', expectedMemberships: baseline(['a']) };
    const agent = await h.command('update_team', input, 3, 'agent');
    await h.db.exec('reset role');
    await h.db.query('delete from public.workspace_memberships where workspace_id=$1 and user_id=$2', [h.ws, member]);
    await h.db.exec('set role authenticated');
    await reject(h.command('update_team', input, 3, 'agent'), 'forbidden');
    assert.equal(agent.data.version, 4);
  } finally {
    await h.close();
  }
});
test('local: exact historical member IDs, seeded missing-vs-empty teams and authorized device replay', async () => {
  const h = await setup('local');
  try {
    await h.change(data => {
      data.members.push({ id: 'historical/α', team: 'engineering', role: 'Member' });
      delete data.teams;
    });
    const teams = await h.list('list_teams');
    const team = teams.find(t => t.id === 'engineering') ?? teams[0];
    await h.change(data => {
      data.members.find(m => m.id === 'historical/α').team = team.id;
    });
    const before = await h.snapshot();
    await reject(h.command('create_team', { id: 'guarded', name: 'Guarded', expectedMemberships: baseline([], 'historical/α') }), 'version_conflict');
    assert.deepEqual(await h.snapshot(), before);
    const input = { id: 'guarded', name: 'Guarded', expectedMemberships: baseline([team.id], 'historical/α') };
    await h.command('create_team', input, undefined, 'replay');
    await h.change(data => {
      data.members.find(m => m.id === 'historical/α').team = '';
    });
    await h.command('create_team', input, undefined, 'replay');
    await h.change(data => {
      data.members.find(m => m.id === owner).role = 'Owner';
      data.teams = [];
    });
    assert.deepEqual(await h.list('list_teams'), []);
    await h.command('create_team', { id: 'empty', name: 'Empty', expectedMemberships: baseline([], 'historical/α') });
  } finally {
    await h.close();
  }
});
for (const kind of ['local', 'sql']) {
  test(`${kind}: exact Unicode and numeric-string team IDs, stale deleted team/member, and 100-child bound`, async () => {
    const h = await setup(kind);
    try {
      const { acceptedFileIds } = await import('./fixtures/file-duplication-ids.js');
      for (const teamId of [...acceptedFileIds, '1']) {
        if (kind === 'local')
          await h.change(data => {
            data.teams.push({ id: teamId, name: 'Exact' });
            data.members.find(m => m.id === member).team = teamId;
          });
        else {
          await h.db.exec('reset role');
          await h.db.query("insert into public.teams(workspace_id,id,name) values($1,$2,'Exact')", [h.ws, teamId]);
          await h.db.query('delete from public.team_members where workspace_id=$1 and user_id=$2', [h.ws, member]);
          await h.db.query('insert into public.team_members values($1,$2,$3)', [h.ws, teamId, member]);
          await h.db.exec('set role authenticated');
        }
        const target = (await h.list('list_teams')).find(t => t.id === 'a');
        await h.command('update_team', { id: 'a', expectedMemberships: baseline([teamId]) }, target.version);
      }
      if (kind === 'local')
        await h.change(data => {
          data.teams = data.teams.filter(t => t.id !== '1');
        });
      else {
        await h.db.exec('reset role');
        await h.db.query("delete from public.teams where workspace_id=$1 and id='1'", [h.ws]);
        await h.db.exec('set role authenticated');
      }
      let target = (await h.list('list_teams')).find(t => t.id === 'a');
      let before = await h.snapshot();
      await reject(h.command('update_team', { id: 'a', expectedMemberships: baseline(['1']) }, target.version), 'version_conflict');
      assert.deepEqual(await h.snapshot(), before);
      await h.command('update_team', { id: 'a', expectedMemberships: baseline() }, target.version);
      if (kind === 'local')
        await h.change(data => {
          data.members = data.members.filter(m => m.id !== member);
        });
      else {
        await h.db.exec('reset role');
        await h.db.query('delete from public.workspace_memberships where workspace_id=$1 and user_id=$2', [h.ws, member]);
        await h.db.exec('set role authenticated');
      }
      target = (await h.list('list_teams')).find(t => t.id === 'a');
      before = await h.snapshot();
      await reject(h.command('update_team', { id: 'a', expectedMemberships: baseline() }, target.version), 'version_conflict');
      assert.deepEqual(await h.snapshot(), before);
      const result = await h.command('batch', {
        commands: Array.from({ length: 100 }, (_, i) => ({
          operation: 'update_team',
          input: { id: 'a', expectedMemberships: [] },
          expectedVersion: target.version + i,
        })),
      });
      assert.equal(result.data.results.length, 100);
      assert.equal(result.data.results.at(-1).data.version, target.version + 100);
    } finally {
      await h.close();
    }
  });
}
test('OpenAPI exposes optional team guards only on create/update, including bounded batch references', async () => {
  const api = JSON.parse(await readFile('supabase/functions/api/openapi.json', 'utf8'));
  const schemas = api.components.schemas;
  for (const op of ['create_team', 'update_team']) {
    assert.equal(schemas[op].properties.input.properties.expectedMemberships.$ref, '#/components/schemas/TeamMembershipBaselines');
    assert.ok(!schemas[op].properties.input.required.includes('expectedMemberships'));
  }
  assert.equal(schemas.set_team_member.properties.input.properties.expectedMemberships, undefined);
  assert.equal(schemas.TeamMembershipBaselines.items.additionalProperties, false);
  assert.equal(schemas.TeamMembershipBaselines.items.properties.teamIds.uniqueItems, true);
});
