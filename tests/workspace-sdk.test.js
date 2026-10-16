import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseRepository } from '../src/workspace/supabase.js';

const configPath = process.env.SUPABASE_TEST_CONFIG;
test('real Supabase Auth, PostgREST joins, tenant repository and CAS round trip', { skip: !configPath }, async () => {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(config.url).hostname), 'integration test only targets local Supabase');
  const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
  const client = createClient(config.url, config.key, authOptions);
  const email = `workspace-${crypto.randomUUID()}@example.test`;
  const password = crypto.randomUUID() + 'Aa1!';
  const signup = await client.auth.signUp({ email, password, options: { data: { name: 'Teste local' } } });
  assert.equal(signup.error, null);
  assert.ok(signup.data.session);
  assert.equal((await client.auth.getSession()).data.session.user.id, signup.data.user.id);
  const repo = createSupabaseRepository(client, signup.data.user);
  assert.deepEqual(await repo.list(), []);
  const first = await repo.create({ name: 'Primeiro espaço', url: 'primeiro' });
  const second = await repo.create({ name: 'Árvore e Ação' });
  assert.equal(second.data.ws.url, 'arvore-e-acao');
  assert.deepEqual(first.data.tasks, []);
  assert.equal(first.data.members[0].role, 'Owner');
  assert.equal(first.data.me, signup.data.user.id);
  assert.equal((await repo.list()).length, 2);
  const payload = {
    ...first.data,
    tasks: [{ id: crypto.randomUUID(), title: 'Persistida no Supabase' }],
    teams: [{ id: 'engineering', name: 'Engenharia' }],
    members: first.data.members.map(member => ({ ...member, team: 'engineering', role: 'Guest' })),
  };
  assert.equal(await repo.save(first.id, payload, 0), 1);
  const reloaded = await repo.load(first.id);
  assert.equal(reloaded.data.tasks[0].title, 'Persistida no Supabase');
  assert.equal(reloaded.data.members[0].team, 'engineering');
  assert.equal(reloaded.data.members[0].role, 'Owner');
  assert.deepEqual((await repo.load(second.id)).data.tasks, []);
  await assert.rejects(repo.save(first.id, first.data, 0), { code: 'conflict' });
  const metadata = { ...payload, ws: { ...payload.ws, name: 'Nome salvo', url: 'nome-salvo', c: '#112233' } };
  await repo.save(first.id, metadata, 1);
  const renamed = await repo.load(first.id);
  assert.equal(renamed.data.ws.name, 'Nome salvo');
  assert.equal(renamed.data.ws.url, 'nome-salvo');
  assert.equal(renamed.data.ws.c, '#112233');
  const outsider = createClient(config.url, config.key, authOptions);
  const stranger = await outsider.auth.signUp({ email: `outsider-${crypto.randomUUID()}@example.test`, password });
  assert.equal(stranger.error, null);
  const otherRepo = createSupabaseRepository(outsider, stranger.data.user);
  assert.deepEqual(await otherRepo.list(), []);
  await assert.rejects(otherRepo.load(first.id));
  await assert.rejects(otherRepo.save(first.id, payload, 2), { code: 'forbidden' });
  const login = await client.auth.signInWithPassword({ email, password });
  assert.equal(login.error, null);
  assert.equal(login.data.user.id, signup.data.user.id);
  await client.auth.signOut();
  assert.equal((await client.auth.getSession()).data.session, null);
  await outsider.auth.signOut();
  if (process.env.SUPABASE_TEST_USER_OUTPUT) {
    await writeFile(process.env.SUPABASE_TEST_USER_OUTPUT, JSON.stringify({ email, password, workspaceId: first.id }));
    await chmod(process.env.SUPABASE_TEST_USER_OUTPUT, 0o600);
  }
});
