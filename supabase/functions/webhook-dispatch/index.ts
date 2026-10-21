import { databaseDeliveryStore, type DeliveryStore, dispatchWebhookBatch } from '../_shared/webhook-delivery.ts';
async function equalSecret(actual: string, expected: string): Promise<boolean> {
  if (actual.length > 256) return false;
  const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  let difference = 0;
  const left = new Uint8Array(a),
    right = new Uint8Array(b);
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
export function createWebhookHandler(config: { workerSecret: string; store: () => DeliveryStore }) {
  return async (request: Request): Promise<Response> => {
    const headers = { 'cache-control': 'no-store' };
    if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405, headers });
    const supplied = request.headers.get('X-Webhook-Worker-Key') ?? '';
    if (config.workerSecret.length < 32 || !(await equalSecret(supplied, config.workerSecret))) {
      return Response.json({ error: 'unauthorized' }, { status: 401, headers });
    }
    try {
      return Response.json(await dispatchWebhookBatch(config.store()), { headers });
    } catch {
      return Response.json({ error: 'temporarily_unavailable' }, { status: 503, headers });
    }
  };
}
if (import.meta.main) {
  Deno.serve(
    createWebhookHandler({
      workerSecret: Deno.env.get('WEBHOOK_WORKER_SECRET') ?? '',
      store: () => databaseDeliveryStore(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''),
    }),
  );
}
