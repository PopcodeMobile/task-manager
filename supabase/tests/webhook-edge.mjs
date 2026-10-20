import console from 'node:console';
/** Exact cached Edge image, disposable worker, production source copied byte-for-byte. */
import assert from 'node:assert/strict';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const dir = await mkdtemp(path.join(tmpdir(), 'task-manager-webhook-edge-')),
  container = `task-manager-webhook-edge-${process.pid}`;
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
try {
  for (const name of ['main', 'probe', '_shared', 'webhook-dispatch']) await mkdir(path.join(dir, name));
  for (const name of ['main', 'probe']) await copyFile(`supabase/tests/webhook-edge/${name}.ts`, path.join(dir, name, 'index.ts'));
  for (const name of ['webhook-delivery', 'webhook-signing', 'webhook-targets'])
    await copyFile(`supabase/functions/_shared/${name}.ts`, path.join(dir, '_shared', `${name}.ts`));
  await copyFile('supabase/functions/webhook-dispatch/index.ts', path.join(dir, 'webhook-dispatch', 'index.ts'));
  docker([
    'run',
    '--detach',
    '--rm',
    '--name',
    container,
    '--publish',
    '127.0.0.1::9000',
    '--mount',
    `type=bind,source=${dir},target=/probe,readonly`,
    'public.ecr.aws/supabase/edge-runtime:v1.77.4',
    'start',
    '--main-service',
    '/probe/main',
    '--port',
    '9000',
  ]);
  const port = docker(['port', container, '9000/tcp']).split(':').at(-1),
    base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      const response = await globalThis.fetch(`${base}/?mode=auth`);
      const data = await response.json();
      assert.deepEqual(data.statuses, [401, 401, 401, 401, 200]);
      assert.equal(data.accesses, 1);
      console.log(JSON.stringify(data));
      ready = true;
      break;
    } catch {
      await delay(100);
    }
  }
  assert.ok(ready, 'exact Edge auth smoke failed');
  const response = await globalThis.fetch(`${base}/?mode=positive`, { signal: globalThis.AbortSignal.timeout(20000) }),
    data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.hostname, 'example.com');
  assert.equal(data.peers.length, 1);
  assert.equal(data.peers[0].requested, data.address);
  assert.equal(data.peers[0].peer, data.address);
  assert.ok(data.status >= 200 && data.status <= 599);
  console.log(JSON.stringify(data));
  console.log(
    'PASS production worker auth + public HTTPS POST through pinned production transport on exact Edge; HTTP405 is example.com rejecting POST, not Hermes acceptance.',
  );
} finally {
  spawnSync('docker', ['rm', '--force', container], { stdio: 'ignore' });
  await rm(dir, { recursive: true, force: true });
}
