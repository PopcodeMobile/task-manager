/** Real independent PostgreSQL sessions exercise the production RPCs, without instrumenting them. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
function session(container) {
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
  let output = '',
    errors = '',
    sequence = 0;
  child.stdout.on('data', value => {
    output += value;
  });
  child.stderr.on('data', value => {
    errors += value;
  });
  return {
    async query(sql) {
      const marker = `review_barrier_${++sequence}`,
        start = output.length;
      child.stdin.write(`${sql}\n\\echo ${marker}\n`);
      const deadline = Date.now() + 8000;
      while (!output.slice(start).includes(marker)) {
        if (child.exitCode !== null) throw new Error(`PostgreSQL session exited: ${errors.trim()}`);
        if (Date.now() >= deadline) throw new Error(`PostgreSQL barrier timed out: ${errors.trim()}`);
        await delay(10);
      }
      return output.slice(start).split(marker)[0].trim();
    },
    close() {
      child.stdin.end();
      child.kill();
    },
  };
}
export async function verifyWebhookRecovery({ container, sql, scenario }) {
  const fixture = JSON.parse(sql("select row_to_json(row) from (select id,lease_token from public.webhook_deliveries where state='processing') row;").trim());
  const id = fixture.id,
    lease = fixture.lease_token;
  if (scenario === 'secret-lock' || scenario === 'completion-lock') {
    const holder = session(container),
      waiter = session(container);
    try {
      const waiterPid = Number(await waiter.query("set statement_timeout='7s'; select pg_backend_pid();"));
      sql(`update public.webhook_deliveries set lease_until=clock_timestamp()+interval '2 seconds' where id='${id}';`);
      await holder.query(`begin;select id from public.webhook_deliveries where id='${id}' for update;`);
      const waiting = waiter.query(
        scenario === 'secret-lock'
          ? `select public.webhook_delivery_secret('${id}','${lease}') is null;`
          : `select not public.complete_webhook_delivery('${id}','${lease}','accepted',200);`,
      );
      const deadline = Date.now() + 6000;
      let blocked = false;
      while (Date.now() < deadline) {
        if (sql(`select cardinality(pg_blocking_pids(${waiterPid}))>0;`).trim() === 't') {
          blocked = true;
          break;
        }
        await delay(20);
      }
      assert.ok(blocked, 'production RPC must actually wait for the unchanged delivery row lock');
      while (sql(`select clock_timestamp()>lease_until from public.webhook_deliveries where id='${id}';`).trim() !== 't') {
        assert.ok(Date.now() < deadline, 'lease must expire while RPC is blocked');
        await delay(20);
      }
      await holder.query('commit;');
      assert.equal(await waiting, 't', `${scenario}: production RPC accepted a lease that expired while awaiting its lock`);
      assert.equal(
        sql(
          `select state='processing' and lease_token='${lease}' and exists(select 1 from pgmq.q_webhook_delivery q where q.msg_id=d.queue_msg_id) from public.webhook_deliveries d where id='${id}';`,
        ).trim(),
        't',
        'rejected stale RPC must not alter state/token or archive the queue',
      );
    } finally {
      holder.close();
      waiter.close();
    }
    return;
  }
  assert.equal(scenario, 'crash-backoff');
  for (let attempt = 1; attempt <= 8; attempt++) {
    // Expire only the lease; make the pgmq message observable without changing its ledger due time.
    sql(
      `update public.webhook_deliveries set lease_until=clock_timestamp()-interval '1 second' where id='${id}';select pgmq.set_vt('webhook_delivery',queue_msg_id,0) from public.webhook_deliveries where id='${id}';`,
    );
    assert.equal(sql('select public.claim_webhook_batch();').trim(), '[]', `interrupted attempt ${attempt} must not immediately reserve its successor`);
    if (attempt === 8) {
      assert.equal(
        sql(
          `select state='failed' and attempt=8 and not exists(select 1 from pgmq.q_webhook_delivery q where q.msg_id=d.queue_msg_id) from public.webhook_deliveries d where id='${id}';`,
        ).trim(),
        't',
        'eighth interrupted reservation is terminal',
      );
      break;
    }
    const seconds = [30, 120, 600, 1800, 7200, 21600, 86400][attempt - 1];
    assert.equal(
      sql(
        `select state='pending' and attempt=${attempt} and lease_token is null and last_category='lease_expired' and next_attempt_at>=clock_timestamp()+make_interval(secs=>${seconds - 2}) from public.webhook_deliveries where id='${id}';`,
      ).trim(),
      't',
      `interrupted attempt ${attempt} must persist its ${seconds}s backoff`,
    );
    assert.equal(
      sql(
        `select q.vt>=d.next_attempt_at and q.vt<d.next_attempt_at+interval '1 second' from public.webhook_deliveries d join pgmq.q_webhook_delivery q on q.msg_id=d.queue_msg_id where d.id='${id}';`,
      ).trim(),
      't',
      'queue visibility must align with persisted due time',
    );
    const due = sql(`select next_attempt_at from public.webhook_deliveries where id='${id}';`).trim();
    sql(`select pgmq.set_vt('webhook_delivery',queue_msg_id,0) from public.webhook_deliveries where id='${id}';`);
    assert.equal(sql('select public.claim_webhook_batch();').trim(), '[]', 'early poll must not spend an attempt');
    assert.equal(
      sql(`select next_attempt_at from public.webhook_deliveries where id='${id}';`).trim(),
      due,
      'recovery must not keep extending the retry deadline',
    );
    // Only after the no-early-reservation proof, simulate reaching that persisted deadline.
    sql(
      `update public.webhook_deliveries set next_attempt_at=clock_timestamp()-interval '1 second' where id='${id}';select pgmq.set_vt('webhook_delivery',queue_msg_id,0) from public.webhook_deliveries where id='${id}';`,
    );
    const batch = JSON.parse(sql('select public.claim_webhook_batch();').trim());
    assert.equal(batch.length, 1);
    assert.equal(batch[0].attempt, attempt + 1);
  }
}
