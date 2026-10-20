import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
test('real pgmq Vault Cron SQL: atomic fanout, lease fencing, retries, admin and OAuth boundaries', { timeout: 180000 }, async () => {
  const source = await readFile('supabase/migrations/202610200004_webhook_delivery.sql', 'utf8').catch(() => null);
  assert.ok(source, 'persistent webhook delivery migration must exist');
  const run = spawnSync(process.execPath, ['supabase/tests/webhook-postgres.mjs'], { encoding: 'utf8', timeout: 170000 });
  assert.equal(run.status, 0, run.stdout + '\n' + run.stderr);
});
