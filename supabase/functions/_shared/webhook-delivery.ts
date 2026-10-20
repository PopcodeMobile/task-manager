// deno-lint-ignore no-import-prefix -- Direct pin also resolves in isolated Edge workers without application import maps.
import { buildConnector, Client } from 'npm:undici@7.30.1';
import { signHermesWebhook } from './webhook-signing.ts';
import {
  resolvePublicDns,
  type Resolver,
  TargetRejected,
  validateWebhookTarget,
  type WebhookTarget,
} from './webhook-targets.ts';
export interface Delivery {
  id: string;
  leaseToken: string;
  eventId: string;
  attempt: number;
  targetUrl: string;
  rawBody: string;
}
export type Category =
  | 'accepted'
  | 'http_retry'
  | 'http_rejected'
  | 'redirect'
  | 'timeout'
  | 'network'
  | 'target_rejected'
  | 'configuration';
export interface DeliveryResult {
  category: Category;
  status: number | null;
  retrySeconds: number | null;
}
export interface DeliveryStore {
  claim(): Promise<Delivery[]>;
  secret(delivery: Delivery): Promise<string | null>;
  complete(delivery: Delivery, result: DeliveryResult): Promise<boolean>;
}
export interface HttpResult {
  status: number;
  retryAfter: string | null;
}
export type Sender = (
  target: WebhookTarget,
  body: string,
  headers: Record<string, string>,
  signal: AbortSignal,
) => Promise<HttpResult>;
const waits = [30, 120, 600, 1800, 7200, 21600, 86400];
export function retryDelaySeconds(attempt: number, retryAfter: string | null, now: number): number {
  const base = waits[Math.max(0, Math.min(6, attempt - 1))];
  if (!retryAfter || retryAfter.length > 128) return base;
  let delay: number;
  if (/^\d+$/.test(retryAfter)) delay = Number(retryAfter);
  else if (/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(retryAfter)) {
    delay = Math.ceil((Date.parse(retryAfter) - now) / 1000);
  } else return base;
  return Number.isFinite(delay) && delay >= 0 ? Math.max(base, Math.min(86400, delay)) : base;
}
/** Standard llhttp parser; connect only to the validated literal, verify TLS against the original hostname. */
export const sendPinnedWebhook: Sender = async (target, body, headers, signal) => {
  signal.throwIfAborted();
  const connector = buildConnector({
    servername: target.hostname,
    rejectUnauthorized: true,
    family: target.family,
    autoSelectFamily: false,
    timeout: 10000,
    lookup(hostname, options, callback) {
      if (hostname !== target.hostname || signal.aborted) return callback(new TargetRejected(), '', target.family);
      if (options.all) callback(null, [{ address: target.address, family: target.family }]);
      else callback(null, target.address, target.family);
    },
  });
  const client = new Client(target.url.origin, {
    connect: connector,
    allowH2: false,
    pipelining: 0,
    maxHeaderSize: 16384,
    maxResponseSize: 65536,
    headersTimeout: 10000,
    bodyTimeout: 10000,
  });
  const abort = () => {
    void client.destroy().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const response = await client.request({
      method: 'POST',
      path: target.url.pathname + target.url.search,
      body,
      headers,
      signal,
    });
    // Bounded body drain verifies framing; no receiver text is stored or logged.
    for await (const _chunk of response.body) { /* parser/size limits enforced by undici */ }
    const retryAfter = response.headers['retry-after'];
    return { status: response.statusCode, retryAfter: typeof retryAfter === 'string' ? retryAfter : null };
  } finally {
    signal.removeEventListener('abort', abort);
    await client.destroy();
  }
};
export async function dispatchWebhookBatch(
  store: DeliveryStore,
  options: { resolve?: Resolver; send?: Sender; now?: () => number; timeoutMs?: number } = {},
): Promise<{ claimed: number; completed: number }> {
  const deliveries = await store.claim();
  const now = options.now ?? Date.now;
  const results = await Promise.all(deliveries.map(async (delivery) => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new DOMException('timeout', 'TimeoutError')),
      Math.min(10000, options.timeoutMs ?? 10000),
    );
    const signal = controller.signal;
    let result: DeliveryResult;
    try {
      const attempt = async (): Promise<HttpResult> => {
        const secret = await store.secret(delivery);
        if (!secret) throw new Error('configuration');
        const target = await validateWebhookTarget(delivery.targetUrl, options.resolve ?? resolvePublicDns);
        signal.throwIfAborted();
        const timestamp = Math.floor(now() / 1000).toString();
        const signature = await signHermesWebhook(secret, timestamp, delivery.rawBody);
        signal.throwIfAborted();
        return (options.send ?? sendPinnedWebhook)(target, delivery.rawBody, {
          'Content-Type': 'application/json',
          'X-Request-ID': delivery.eventId,
          'X-Webhook-Timestamp': timestamp,
          'X-Webhook-Signature-V2': signature,
        }, signal);
      };
      const response = await Promise.race([
        attempt(),
        new Promise<never>((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        ),
      ]);
      const status = response.status;
      const category: Category = status >= 200 && status < 300
        ? 'accepted'
        : status >= 300 && status < 400
        ? 'redirect'
        : status === 408 || status === 429 || status >= 500
        ? 'http_retry'
        : 'http_rejected';
      result = {
        category,
        status,
        retrySeconds: category === 'http_retry' && delivery.attempt < 8
          ? retryDelaySeconds(delivery.attempt, response.retryAfter, now())
          : null,
      };
    } catch (error) {
      const category: Category = signal.aborted
        ? 'timeout'
        : error instanceof TargetRejected
        ? 'target_rejected'
        : error instanceof Error && error.message === 'configuration'
        ? 'configuration'
        : 'network';
      result = {
        category,
        status: null,
        retrySeconds: delivery.attempt < 8 && category !== 'target_rejected'
          ? retryDelaySeconds(delivery.attempt, null, now())
          : null,
      };
    } finally {
      clearTimeout(timeout);
    }
    // Lost acknowledgement intentionally leaves the lease for durable recovery.
    return await store.complete(delivery, result);
  }));
  return { claimed: deliveries.length, completed: results.filter(Boolean).length };
}
export function databaseDeliveryStore(url: string, key: string): DeliveryStore {
  async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('database_unavailable');
    }
    return response.json();
  }
  return {
    claim: () => rpc<Delivery[]>('claim_webhook_batch', { p_limit: 5 }),
    secret: (d) => rpc<string | null>('webhook_delivery_secret', { p_delivery_id: d.id, p_lease_token: d.leaseToken }),
    complete: (d, r) =>
      rpc<boolean>('complete_webhook_delivery', {
        p_delivery_id: d.id,
        p_lease_token: d.leaseToken,
        p_category: r.category,
        p_status: r.status,
        p_retry_seconds: r.retrySeconds,
      }),
  };
}
