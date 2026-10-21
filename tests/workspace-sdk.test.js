import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { NormalizedRepository } from '../src/workspace/normalized.ts';
import { workspaceSlug } from '../src/workspace/metadata.js';
const configPath = process.env.SUPABASE_TEST_CONFIG;
async function fixture(run) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const url = config.url ?? config.API_URL,
    key = config.key ?? config.ANON_KEY,
    serviceKey = config.serviceKey ?? config.SERVICE_ROLE_KEY;
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'only the dedicated local Supabase');
  assert.ok(serviceKey, 'private service credential required for fixture cleanup');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, serviceKey, options),
    users = [],
    workspaces = [],
    clients = [];
  async function signup() {
    const client = createClient(url, key, options),
      email = `sdk-${crypto.randomUUID()}@example.test`,
      password = crypto.randomUUID() + 'Aa1!';
    clients.push(client);
    const created = await client.auth.signUp({ email, password, options: { data: { name: 'Teste local', role: 'owner' } } });
    if (created.data.user) users.push(created.data.user.id);
    assert.equal(created.error, null);
    assert.ok(created.data.session);
    assert.equal((await client.auth.getSession()).data.session.user.id, created.data.user.id);
    return { client, user: created.data.user, email, password };
  }
  try {
    await run({ service, signup, workspaces });
  } finally {
    for (const client of clients) await client.auth.signOut();
    const errors = [];
    for (const id of workspaces) if ((await service.from('workspaces').delete().eq('id', id)).error) errors.push('workspace cleanup failed');
    for (const id of users) if ((await service.auth.admin.deleteUser(id)).error) errors.push('Auth fixture cleanup failed');
    assert.deepEqual(errors, []);
  }
}
const command = (repo, operation, input, expectedVersion) => repo.command(operation, { input, expectedVersion, idempotencyKey: crypto.randomUUID() });
test('real normalized SDK Auth joins tenant CAS metadata and authoritative roles', { skip: !configPath }, async () => {
  await fixture(async ({ service, signup, workspaces }) => {
    const owner = await signup(),
      stranger = await signup();
    const discovery = new NormalizedRepository(owner.client, owner.user.id, null);
    assert.deepEqual(await discovery.workspaces(), []);
    async function create(name) {
      const result = await discovery.rpc('create_workspace_v2', { p_name: name, p_slug: workspaceSlug(name), p_idempotency_key: crypto.randomUUID() });
      workspaces.push(result.data.id);
      return result.data;
    }
    const first = await create('Primeiro espaço'),
      second = await create('Árvore e Ação');
    assert.equal(second.slug, 'arvore-e-acao');
    assert.equal((await discovery.workspaces(true)).length, 2);
    const joins = await owner.client.from('workspace_memberships').select('role,workspaces(id,name)').eq('user_id', owner.user.id);
    assert.equal(joins.error, null);
    assert.equal(joins.data.length, 2);
    assert.ok(joins.data.every(row => row.role === 'owner' && row.workspaces.id));
    const repo = new NormalizedRepository(owner.client, owner.user.id, first.id),
      other = new NormalizedRepository(owner.client, owner.user.id, second.id);
    assert.deepEqual(await repo.list('list_tasks'), []);
    const project = (await command(repo, 'create_project', { name: 'SDK project' })).data;
    const task = (await command(repo, 'create_task', { projectId: project.id, title: 'Persistida no Supabase' })).data;
    const team = (await command(repo, 'create_team', { name: 'Engenharia' })).data;
    await command(repo, 'set_team_member', { id: team.id, userId: owner.user.id }, team.version);
    const members = await repo.rpc('list_workspace_members', { p_workspace_id: first.id });
    assert.equal(members.find(m => m.user_id === owner.user.id).role, 'owner');
    assert.ok((await repo.list('list_team_members', {}, true)).some(r => r.userId === owner.user.id && r.teamId === team.id));
    const updated = (await command(repo, 'update_task', { id: task.id, title: 'Winning task' }, task.version)).data;
    await assert.rejects(command(repo, 'update_task', { id: task.id, title: 'Lost task' }, task.version), { code: 'version_conflict' });
    assert.equal((await repo.query('get_task', { id: task.id }, true)).data.title, 'Winning task');
    assert.equal(updated.version, task.version + 1);
    assert.deepEqual(await other.list('list_tasks'), []);
    await command(repo, 'update_workspace', { name: 'Nome salvo', slug: 'nome-salvo', color: '#112233' }, first.version);
    const metadata = (await discovery.workspaces(true)).find(w => w.id === first.id);
    assert.equal(metadata.name, 'Nome salvo');
    assert.equal(metadata.slug, 'nome-salvo');
    assert.equal(metadata.color, '#112233');
    const outsider = new NormalizedRepository(stranger.client, stranger.user.id, first.id);
    assert.deepEqual(await outsider.workspaces(), []);
    await assert.rejects(outsider.list('list_tasks'), { code: 'forbidden' });
    await assert.rejects(command(outsider, 'update_task', { id: task.id, title: 'Forbidden' }, updated.version), { code: 'forbidden' });
    assert.equal((await service.from('workspace_memberships').insert({ workspace_id: first.id, user_id: stranger.user.id, role: 'guest' })).error, null);
    const guest = new NormalizedRepository(stranger.client, stranger.user.id, first.id);
    assert.equal((await guest.list('list_tasks'))[0].title, 'Winning task');
    await assert.rejects(command(guest, 'update_task', { id: task.id, title: 'Escalated metadata' }, updated.version), { code: 'forbidden' });
    // Auth user_metadata.role cannot override membership authority.
    assert.equal((await guest.rpc('list_workspace_members', { p_workspace_id: first.id })).find(m => m.user_id === stranger.user.id).role, 'guest');
    const login = await owner.client.auth.signInWithPassword({ email: owner.email, password: owner.password });
    assert.equal(login.error, null);
    assert.equal(login.data.user.id, owner.user.id);
    await owner.client.auth.signOut();
    assert.equal((await owner.client.auth.getSession()).data.session, null);
  });
});
test('real SDK explicit legacy cutover preserves snapshot and denies every old writer after new writes', { skip: !configPath }, async () => {
  await fixture(async ({ service, signup, workspaces }) => {
    const { client, user } = await signup();
    const payload = {
      ws: { name: 'Legacy' },
      projects: [{ id: 'legacy-p', name: 'Original', key: 'OLD' }],
      tasks: [{ id: 'legacy-t', project: 'legacy-p', title: 'Old title' }],
      future: { retained: ['literal'] },
    };
    const created = await client.rpc('create_workspace', { p_name: 'Legacy', p_slug: 'legacy-sdk', p_payload: payload });
    assert.equal(created.error, null);
    const id = created.data;
    workspaces.push(id);
    const snapshot = await service.from('workspace_snapshots').select('payload,revision').eq('workspace_id', id).single();
    assert.equal(snapshot.error, null);
    const discovery = new NormalizedRepository(client, user.id, null);
    assert.equal(
      (await discovery.workspaces()).some(w => w.id === id),
      false,
    );
    assert.equal((await client.rpc('migrate_workspace', { p_workspace_id: id, p_expected_snapshot_revision: 0 })).error, null);
    assert.equal(
      (await discovery.workspaces(true)).some(w => w.id === id),
      true,
    );
    const repo = new NormalizedRepository(client, user.id, id),
      task = (await repo.query('get_task', { id: 'legacy-t' })).data;
    await command(repo, 'update_task', { id: task.id, title: 'New authoritative write' }, task.version);
    const old = await client.rpc('save_workspace_snapshot', { p_workspace_id: id, p_expected_revision: 0, p_payload: { ...payload, tasks: [] } });
    assert.equal(old.error?.code, '55000');
    const bypass = await client.rpc('save_workspace_snapshot_v1', { p_workspace_id: id, p_expected_revision: 0, p_payload: payload });
    assert.ok(bypass.error);
    assert.equal((await client.rpc('migrate_workspace', { p_workspace_id: id, p_expected_snapshot_revision: 0 })).error, null);
    assert.equal((await repo.query('get_task', { id: task.id }, true)).data.title, 'New authoritative write');
    const preserved = await service.from('workspace_snapshots').select('payload,revision').eq('workspace_id', id).single();
    assert.equal(preserved.error, null);
    assert.deepEqual(preserved.data, snapshot.data);
  });
});
