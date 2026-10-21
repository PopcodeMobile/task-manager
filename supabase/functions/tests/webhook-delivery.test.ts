import { assert, assertEquals, assertRejects } from '@std/assert';
import { signHermesWebhook } from '../_shared/webhook-signing.ts';
import { isPublicAddress, resolvePublicDns, validateWebhookTarget } from '../_shared/webhook-targets.ts';
import { type Delivery, type DeliveryResult, type DeliveryStore, dispatchWebhookBatch, retryDelaySeconds } from '../_shared/webhook-delivery.ts';
import { createWebhookHandler } from '../webhook-dispatch/index.ts';

Deno.test('Generic V2 signs exact timestamp dot raw bytes with SHA256 hex', async () => {
  assertEquals(await signHermesWebhook('secret', '1700000000', '{"event_id":"e1"}'), 'b2f1e511066934a38f46dfea0a07129698893b80ac931ac0154c7894af0996b7');
  assert((await signHermesWebhook('secret', '1700000001', '{}')) !== (await signHermesWebhook('secret', '1700000000', '{}')));
});
Deno.test('targets reject special addresses, metadata, mixed DNS and URL tricks', async () => {
  for (const ip of [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.0.0.9',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '240.0.0.1',
    '::',
    '::1',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
    '2001:db8::1',
    '2002:808:808::',
    'fc00::1',
    'fe80::1',
    'ff02::1',
  ])
    assertEquals(isPublicAddress(ip), false, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assertEquals(isPublicAddress(ip), true, ip);
  for (const url of [
    'http://example.com/',
    'https://user:password@example.com/',
    'https://example.com/#x',
    'https://example.com:8443/',
    'https://2130706433/',
    'https://0x7f000001/',
    'https://0177.0.0.1/',
    'https://[::1]/',
    'https://localhost/',
    'https://example.com./',
  ])
    await assertRejects(() => validateWebhookTarget(url, () => Promise.resolve(['8.8.8.8'])));
  await assertRejects(() => validateWebhookTarget('https://example.com/', () => Promise.resolve(['8.8.8.8', '10.0.0.1'])));
  await assertRejects(() => validateWebhookTarget('https://example.com/', () => Promise.resolve([])));
  await assertRejects(() => validateWebhookTarget('https://example.com/', () => Promise.reject(Error('private resolver detail'))));
  assertEquals((await validateWebhookTarget('https://example.com/path', () => Promise.resolve(['8.8.8.8']))).address, '8.8.8.8');
});
Deno.test('bounded retries honor Retry-After integers and HTTP dates without trusting response text', () => {
  assertEquals(
    [1, 2, 3, 4, 5, 6, 7].map(n => retryDelaySeconds(n, null, 0)),
    [30, 120, 600, 1800, 7200, 21600, 86400],
  );
  assertEquals(retryDelaySeconds(1, '90', 0), 90);
  assertEquals(retryDelaySeconds(1, 'Thu, 01 Jan 1970 00:02:00 GMT', 0), 120);
  for (const value of ['-1', '1.2', 'garbage', '9'.repeat(200), 'Wed, 01 Jan 1969 00:00:00 GMT']) {
    assertEquals(retryDelaySeconds(1, value, 0), 30);
  }
  assertEquals(retryDelaySeconds(1, '999999', 0), 86400);
});
const delivery: Delivery = {
  id: 'd1',
  leaseToken: 'lease',
  eventId: 'e1',
  attempt: 1,
  targetUrl: 'https://example.com/hook',
  rawBody: '{"event_id":"e1","event_type":"task.updated"}',
};
Deno.test('HTTP receiver validates HMAC, stable IDs, renewed signature, 503 then 200', async () => {
  const received: { id: string | null; stamp: string | null; signature: string | null; body: string }[] = [];
  const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, async request => {
    const body = await request.text(),
      stamp = request.headers.get('X-Webhook-Timestamp'),
      signature = request.headers.get('X-Webhook-Signature-V2');
    assertEquals(signature, await signHermesWebhook('fixture', stamp!, body));
    received.push({ id: request.headers.get('X-Request-ID'), stamp, signature, body });
    return new Response('sensitive receiver error is never recorded', {
      status: received.length === 1 ? 503 : 200,
      headers: { 'Retry-After': '60' },
    });
  });
  const outcomes: DeliveryResult[] = [];
  let now = 1700000000000;
  const store: DeliveryStore = {
    claim: () => Promise.resolve([{ ...delivery }]),
    secret: () => Promise.resolve('fixture'),
    complete: (_d, result) => {
      outcomes.push(result);
      return Promise.resolve(true);
    },
  };
  try {
    const send = async (_target: unknown, body: string, headers: Record<string, string>, signal: AbortSignal) => {
      const response = await fetch(`http://127.0.0.1:${server.addr.port}`, {
        method: 'POST',
        body,
        headers,
        signal,
        redirect: 'error',
      });
      await response.body?.cancel();
      return { status: response.status, retryAfter: response.headers.get('Retry-After') };
    };
    await dispatchWebhookBatch(store, { now: () => now, resolve: () => Promise.resolve(['8.8.8.8']), send });
    now += 60000;
    await dispatchWebhookBatch(store, { now: () => now, resolve: () => Promise.resolve(['8.8.8.8']), send });
    assertEquals(
      received.map(r => r.id),
      ['e1', 'e1'],
    );
    assertEquals(received[0].body, received[1].body);
    assert(received[0].signature !== received[1].signature);
    assertEquals(
      outcomes.map(o => o.category),
      ['http_retry', 'accepted'],
    );
    assertEquals(outcomes[0].retrySeconds, 60);
    assert(!JSON.stringify(outcomes).includes('sensitive'));
  } finally {
    await server.shutdown();
  }
});
Deno.test('timeout after receiver acceptance replays one consumer effect and missing secret fails safely', async () => {
  const seen = new Set<string>();
  let effects = 0,
    sends = 0;
  const results: DeliveryResult[] = [];
  const store: DeliveryStore = {
    claim: () => Promise.resolve([{ ...delivery }]),
    secret: () => Promise.resolve('fixture'),
    complete: (_d, r) => {
      results.push(r);
      return Promise.resolve(true);
    },
  };
  const send = async (_target: unknown, body: string, _headers: Record<string, string>, signal: AbortSignal) => {
    sends++;
    const id = JSON.parse(body).event_id;
    if (!seen.has(id)) {
      seen.add(id);
      effects++;
    }
    if (sends === 1) {
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    }
    return Promise.resolve({ status: 200, retryAfter: null });
  };
  await dispatchWebhookBatch(store, { resolve: () => Promise.resolve(['8.8.8.8']), send, timeoutMs: 20 });
  await dispatchWebhookBatch(store, { resolve: () => Promise.resolve(['8.8.8.8']), send, timeoutMs: 20 });
  assertEquals(effects, 1);
  assertEquals(sends, 2);
  assertEquals(
    results.map(r => r.category),
    ['timeout', 'accepted'],
  );
  store.secret = () => Promise.resolve(null);
  await dispatchWebhookBatch(store, { resolve: () => Promise.resolve(['8.8.8.8']), send });
  assertEquals(sends, 2);
  assertEquals(results[2].category, 'configuration');
});
Deno.test('redirect and blocked target never succeed, eighth failure is terminal', async () => {
  const results: DeliveryResult[] = [];
  let sends = 0;
  const store: DeliveryStore = {
    claim: () => Promise.resolve([{ ...delivery, attempt: 8 }]),
    secret: () => Promise.resolve('fixture'),
    complete: (_d, r) => {
      results.push(r);
      return Promise.resolve(true);
    },
  };
  await dispatchWebhookBatch(store, {
    resolve: () => Promise.resolve(['8.8.8.8']),
    send: () => {
      sends++;
      return Promise.resolve({ status: 302, retryAfter: null });
    },
  });
  assertEquals(results[0].category, 'redirect');
  assertEquals(results[0].retrySeconds, null);
  await dispatchWebhookBatch(store, {
    resolve: () => Promise.resolve(['127.0.0.1']),
    send: () => {
      sends++;
      return Promise.resolve({ status: 200, retryAfter: null });
    },
  });
  assertEquals(sends, 1);
  assertEquals(results[1].category, 'target_rejected');
  await dispatchWebhookBatch(store, {
    resolve: () => Promise.resolve(['8.8.8.8']),
    send: () => Promise.resolve({ status: 503, retryAfter: null }),
  });
  assertEquals(results[2].retrySeconds, null);
});
Deno.test('worker rejects public keys, user JWTs, missing/wrong secrets before store access', async () => {
  let accessed = 0;
  const handler = createWebhookHandler({
    workerSecret: 'a'.repeat(48),
    store: () => {
      accessed++;
      throw Error('should not access');
    },
  });
  for (const headers of <Record<string, string>[]>[
    {},
    { apikey: 'sb_publishable_test' },
    {
      authorization: 'Bearer user.jwt.token',
    },
    { 'X-Webhook-Worker-Key': 'wrong' },
  ]) {
    const response = await handler(new Request('https://worker.invalid', { method: 'POST', headers }));
    assertEquals(response.status, 401);
  }
  assertEquals(accessed, 0);
});

Deno.test('DNS timeout or empty answers persist retry classification while prohibited answers remain terminal', async () => {
  const results: DeliveryResult[] = [];
  let sends = 0;
  const store: DeliveryStore = {
    claim: () => Promise.resolve([{ ...delivery }]),
    secret: () => Promise.resolve('fixture'),
    complete: (_delivery, result) => {
      results.push(result);
      return Promise.resolve(true);
    },
  };
  const send = () => {
    sends++;
    return Promise.resolve({ status: 200, retryAfter: null });
  };
  await dispatchWebhookBatch(store, {
    resolve: () => Promise.reject(new Deno.errors.TimedOut('private resolver detail')),
    send,
  });
  await dispatchWebhookBatch(store, { resolve: () => Promise.resolve([]), send });
  for (const answers of [['10.0.0.1'], ['8.8.8.8', '10.0.0.1']]) {
    await dispatchWebhookBatch(store, { resolve: () => Promise.resolve(answers), send });
  }
  assertEquals(sends, 0);
  assertEquals<unknown>(
    results.map(result => [result.category, result.retrySeconds]),
    [
      ['dns_unavailable', 30],
      ['dns_unavailable', 30],
      ['target_rejected', null],
      ['target_rejected', null],
    ],
  );
  assert(!JSON.stringify(results).includes('private resolver detail'));
});

Deno.test('default A/AAAA resolver preserves transient failures and prioritizes proven prohibited addresses', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(Deno, 'resolveDns')!;
  const results: DeliveryResult[] = [];
  let sent = 0;
  const store: DeliveryStore = {
    claim: () => Promise.resolve([{ ...delivery }]),
    secret: () => Promise.resolve('fixture'),
    complete: (_delivery, result) => {
      results.push(result);
      return Promise.resolve(true);
    },
  };
  const responses: [string[] | Error, string[] | Error][] = [
    [['8.8.8.8'], new Deno.errors.TimedOut('AAAA timeout')],
    [['10.0.0.1'], new Deno.errors.TimedOut('AAAA timeout')],
    [new Deno.errors.NotFound('no A'), new Deno.errors.NotFound('no AAAA')],
    [['8.8.8.8'], new Deno.errors.NotFound('no AAAA')],
  ];
  try {
    for (const answers of responses) {
      Object.defineProperty(Deno, 'resolveDns', {
        ...descriptor,
        value: (_hostname: string, type: string) => {
          const answer = answers[type === 'A' ? 0 : 1];
          return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
        },
      });
      await dispatchWebhookBatch(store, {
        resolve: resolvePublicDns,
        send: () => {
          sent++;
          return Promise.resolve({ status: 200, retryAfter: null });
        },
      });
    }
  } finally {
    Object.defineProperty(Deno, 'resolveDns', descriptor);
  }
  assertEquals(sent, 1);
  assertEquals<unknown>(
    results.map(result => [result.category, result.retrySeconds]),
    [
      ['dns_unavailable', 30],
      ['target_rejected', null],
      ['dns_unavailable', 30],
      ['accepted', null],
    ],
  );
});
