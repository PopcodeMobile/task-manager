import { sendPinnedWebhook } from '../_shared/webhook-delivery.ts';
import { validateWebhookTarget } from '../_shared/webhook-targets.ts';
import { createWebhookHandler } from '../webhook-dispatch/index.ts';
Deno.serve(async (req) => {
  const mode = new URL(req.url).searchParams.get('mode') ?? 'positive';
  if (mode === 'auth') {
    let accesses = 0;
    const handler = createWebhookHandler({
      workerSecret: 'fixture-worker-secret-with-at-least-32-characters',
      store: () => {
        accesses++;
        return { claim: async () => [], secret: async () => null, complete: async () => false };
      },
    });
    const statuses = [];
    for (
      const headers of [{}, { apikey: 'sb_publishable_fixture' }, { authorization: 'Bearer ordinary.user.jwt' }, {
        'X-Webhook-Worker-Key': 'wrong',
      }, { 'X-Webhook-Worker-Key': 'fixture-worker-secret-with-at-least-32-characters' }]
    ) statuses.push((await handler(new Request('https://fixture.invalid', { method: 'POST', headers }))).status);
    return Response.json({ mode, statuses, accesses, deno: Deno.version.deno });
  }
  const peers = [];
  const connect = Deno.connect;
  Deno.connect = async (options) => {
    const conn = await connect(options);
    peers.push({ requested: options.hostname, peer: conn.remoteAddr.hostname });
    return conn;
  };
  try {
    const target = await validateWebhookTarget('https://example.com/');
    const response = await sendPinnedWebhook(target, '{"event_id":"transport-fixture"}', {
      'Content-Type': 'application/json',
    }, AbortSignal.timeout(10000));
    return Response.json({
      mode,
      address: target.address,
      hostname: target.hostname,
      peers,
      status: response.status,
      deno: Deno.version.deno,
    });
  } catch {
    return Response.json({ mode, error: 'transport_failed', peers }, { status: 500 });
  } finally {
    Deno.connect = connect;
  }
});
