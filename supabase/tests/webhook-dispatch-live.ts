/** Real PostgREST -> real pgmq/Vault -> dispatcher -> HTTP receiver, isolated database only. */
import { assert, assertEquals, assertRejects } from '@std/assert';
import {
  databaseDeliveryStore,
  type DeliveryStore,
  dispatchWebhookBatch,
} from '../functions/_shared/webhook-delivery.ts';
import { createWebhookHandler } from '../functions/webhook-dispatch/index.ts';
import { signHermesWebhook } from '../functions/_shared/webhook-signing.ts';
const url = Deno.env.get('TEST_WEBHOOK_RPC_URL')!, token = Deno.env.get('TEST_WEBHOOK_SERVICE_TOKEN')!;
async function rpc(name: string, parameters: Record<string, unknown> = {}) {
  const response = await fetch(`${url}/rpc/${name}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(parameters),
  });
  assert(response.ok, `fixture RPC ${name} failed (${response.status})`);
  return response.status === 204 ? null : response.json();
}
const proxy = Deno.serve(
  { hostname: '127.0.0.1', port: 0, onListen() {} },
  (request) => fetch(new Request(url + new URL(request.url).pathname.replace(/^\/rest\/v1/, ''), request)),
);
const deliveries: { eventId: string; body: string; signature: string | null; timestamp: string | null }[] = [];
let effects = 0;
const receiver = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, async (request) => {
  const body = await request.text(),
    timestamp = request.headers.get('X-Webhook-Timestamp'),
    signature = request.headers.get('X-Webhook-Signature-V2'),
    eventId = request.headers.get('X-Request-ID')!;
  assertEquals(signature, await signHermesWebhook('fixture-key-'.repeat(4), timestamp!, body));
  assert(Math.abs(Date.now() / 1000 - Number(timestamp)) < 300, 'Hermes timestamp window');
  if (await rpc('test_consumer_accept', { p_event_id: eventId })) effects++;
  deliveries.push({ eventId, body, signature, timestamp });
  return new Response('untrusted response omitted', {
    status: deliveries.length === 1 ? 503 : 200,
    headers: { 'Retry-After': '60' },
  });
});
try {
  // User and public roles cannot call privileged database paths.
  const denial = await fetch(`${url}/rpc/claim_webhook_batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert(denial.status === 401 || denial.status === 403 || denial.status === 404);
  await denial.body?.cancel();
  await rpc('test_advance_webhook');
  const store: DeliveryStore = databaseDeliveryStore(`http://127.0.0.1:${proxy.addr.port}`, token);
  let now = Date.now();
  const options = {
    now: () => now,
    resolve: () => Promise.resolve(['8.8.8.8']),
    send: async (_target: unknown, body: string, headers: Record<string, string>, signal: AbortSignal) => {
      const response = await fetch(`http://127.0.0.1:${receiver.addr.port}/`, {
        method: 'POST',
        headers,
        body,
        signal,
        redirect: 'error',
      });
      await response.body?.cancel();
      return { status: response.status, retryAfter: response.headers.get('Retry-After') };
    },
  };
  assertEquals(await dispatchWebhookBatch(store, options), { claimed: 1, completed: 1 });
  await rpc('test_advance_webhook');
  now += 60000;
  await assertRejects(() =>
    dispatchWebhookBatch({
      ...store,
      complete: () => Promise.reject(new Error('simulated crash after HTTP200 before acknowledgement')),
    }, options)
  );
  assertEquals((await store.claim()).length, 0, 'lost acknowledgement leaves durable live lease');
  await rpc('test_advance_webhook');
  now += 60000;
  assertEquals(await dispatchWebhookBatch(store, options), { claimed: 1, completed: 1 });
  assertEquals(deliveries.length, 3);
  assertEquals(deliveries[0].eventId, deliveries[2].eventId);
  assertEquals(deliveries[0].body, deliveries[2].body);
  assert(deliveries[1].signature !== deliveries[2].signature);
  assertEquals(deliveries[0].eventId, deliveries[1].eventId);
  assertEquals(deliveries[0].body, deliveries[1].body);
  assert(deliveries[0].signature !== deliveries[1].signature);
  assertEquals(effects, 1);
  let calls = 0;
  const handler = createWebhookHandler({ workerSecret: 'scheduler-fixture-'.repeat(3), store: () => store });
  const worker = Deno.serve(
    { hostname: '0.0.0.0', port: 0, onListen() {} },
    (request) => ++calls === 1 ? new Response('fixture wakeup loss', { status: 503 }) : handler(request),
  );
  try {
    await rpc('test_prepare_scheduler', {
      p_url: `http://host.docker.internal:${worker.addr.port}/functions/v1/webhook-dispatch`,
    });
    let proof: { missed: boolean; recovered: boolean; failedTarget: boolean; runs: number } | undefined;
    for (let i = 0; i < 100; i++) {
      proof = await rpc('test_scheduler_result');
      if (proof?.missed && proof.recovered && proof.failedTarget && proof.runs >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(
      proof?.missed && proof.recovered && proof.failedTarget && proof.runs >= 2,
      'actual Cron/pg_net authenticated wakeup did not recover',
    );
    console.log(
      'PASS actual Cron -> pg_net -> dedicated-secret production handler -> service RPC queue claim; first wakeup503, later200; private target fails closed.',
    );
  } finally {
    await rpc('test_stop_scheduler');
    await worker.shutdown();
  }
  console.log(
    'PASS actual PostgREST/private RPCs + pgmq/Vault + dispatcher + HMAC receiver 503/200/lost-ack replay, stable ID/bytes, renewed signature; SQL consumer effects=1.',
  );
} finally {
  await receiver.shutdown();
  await proxy.shutdown();
}
