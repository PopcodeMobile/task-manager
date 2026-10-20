/** Native TLS fixture; test-only CA lives outside git. Production target policy remains strict. */
import { assert, assertEquals, assertRejects } from '@std/assert';
import { type DeliveryStore, dispatchWebhookBatch, sendPinnedWebhook } from '../_shared/webhook-delivery.ts';
import { type WebhookTarget } from '../_shared/webhook-targets.ts';
const tlsDir = Deno.env.get('TEST_WEBHOOK_TLS_DIR');
Deno.test({
  name: 'pinned standard transport: fragmented/chunked/interim, redirect, invalid TLS and bounded parser',
  ignore: !tlsDir,
  fn: async () => {
    const cert = await Deno.readTextFile(`${tlsDir}/cert.pem`), key = await Deno.readTextFile(`${tlsDir}/key.pem`);
    const listener = Deno.listenTls({ hostname: '127.0.0.1', port: 0, cert, key, alpnProtocols: ['http/1.1'] });
    let connections = 0, closedOnTimeout = 0;
    const hosts: string[] = [];
    const sockets = new Set<Deno.TlsConn>();
    const modes = [
      'continue',
      'fragmented',
      'redirect',
      'truncated',
      'oversized',
      'bodylarge',
      'slow',
      'valid',
      'wronghostname',
    ];
    const serving = (async () => {
      for await (const socket of listener) {
        sockets.add(socket);
        connections++;
        const mode = modes.shift();
        void (async () => {
          try {
            const buffer = new Uint8Array(32768);
            let request = '';
            while (!request.includes('\r\n\r\n')) {
              const read = await socket.read(buffer);
              if (read === null) return;
              request += new TextDecoder().decode(buffer.subarray(0, read));
            }
            const expected = request.indexOf('\r\n\r\n') + 4 +
              Number(request.match(/\r\ncontent-length: (\d+)/i)?.[1] ?? 0);
            while (request.length < expected) {
              const read = await socket.read(buffer);
              if (read === null) return;
              request += new TextDecoder().decode(buffer.subarray(0, read));
            }
            hosts.push(request.match(/\r\nhost: ([^\r]+)/i)?.[1] ?? '');
            const write = async (text: string) => {
              const bytes = new TextEncoder().encode(text);
              let at = 0;
              while (at < bytes.length) at += await socket.write(bytes.subarray(at));
            };
            if (mode === 'continue') {
              await write('HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n');
            } else if (mode === 'fragmented') {
              for (
                const part of [
                  'HTTP/1.1 103 Early Hints\r\n\r\nHTTP/1.1 20',
                  '0 OK\r\nTransfer-Encoding: chunked\r\nRetry-After: 90\r\n\r\n',
                  '2\r\nok\r\n0\r\n\r\n',
                ]
              ) await write(part);
            } else if (mode === 'redirect') {
              await write('HTTP/1.1 302 Found\r\nLocation: http://169.254.169.254/\r\nContent-Length: 0\r\n\r\n');
            } else if (mode === 'truncated') await write('HTTP/1.1 200 OK\r\nContent-Length: 500\r\n\r\nshort');
            else if (mode === 'oversized') {
              await write('HTTP/1.1 200 OK\r\nX-Long: ' + 'x'.repeat(20000) + '\r\nContent-Length: 0\r\n\r\n');
            } else if (mode === 'bodylarge') {
              await write('HTTP/1.1 200 OK\r\nContent-Length: 70000\r\n\r\n' + 'x'.repeat(70000));
            } else if (mode === 'slow') {
              await write('HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n');
              try {
                if (await socket.read(buffer) === null) closedOnTimeout++;
              } catch {
                closedOnTimeout++;
              }
            } else await write('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok');
          } catch {
            /* expected disconnects/certificate failures */
          } finally {
            try {
              socket.close();
            } catch { /* already closed */ }
            sockets.delete(socket);
          }
        })();
      }
    })();
    const target: WebhookTarget = {
      url: new URL(`https://webhook.fixture.invalid:${listener.addr.port}/event`),
      hostname: 'webhook.fixture.invalid',
      address: '127.0.0.1',
      family: 4,
    };
    try {
      await assertRejects(() => sendPinnedWebhook(target, '{}', {}, AbortSignal.timeout(1000)));
      assertEquals(
        await sendPinnedWebhook(target, '{}', { 'Content-Type': 'application/json' }, AbortSignal.timeout(1000)),
        { status: 200, retryAfter: '90' },
      );
      assertEquals((await sendPinnedWebhook(target, '{}', {}, AbortSignal.timeout(1000))).status, 302);
      assertEquals(connections, 3, 'redirect did not connect to Location');
      await assertRejects(() => sendPinnedWebhook(target, '{}', {}, AbortSignal.timeout(1000)));
      await assertRejects(() => sendPinnedWebhook(target, '{}', {}, AbortSignal.timeout(1000)));
      await assertRejects(() => sendPinnedWebhook(target, '{}', {}, AbortSignal.timeout(1000)));
      await assertRejects(() => sendPinnedWebhook(target, '{}', {}, AbortSignal.timeout(25)));
      await new Promise((resolve) => setTimeout(resolve, 10));
      assertEquals(closedOnTimeout, 1, 'deadline destroys the actual socket');
      assertEquals((await sendPinnedWebhook(target, '{}', {}, AbortSignal.timeout(1000))).status, 200);
      const certificateError = await assertRejects(() =>
        sendPinnedWebhook(
          {
            ...target,
            url: new URL(`https://wrong.fixture.invalid:${listener.addr.port}`),
            hostname: 'wrong.fixture.invalid',
          },
          '{}',
          {},
          AbortSignal.timeout(1000),
        )
      );
      assert(
        certificateError instanceof Error && /certificate|cert|hostname|name/i.test(certificateError.message),
        'TLS verification specifically rejected certificate name',
      );
      assert(
        hosts.every((host) => host === `webhook.fixture.invalid:${listener.addr.port}`),
        'Host preserves original hostname',
      );
    } finally {
      listener.close();
      for (const socket of sockets) {
        try {
          socket.close();
        } catch { /* already closed */ }
      }
      await serving;
      await new Promise((resolve) => setTimeout(resolve, 160));
    }
  },
});
Deno.test('whole operation timeout stops slow DNS before socket creation', async () => {
  let sends = 0;
  const results: string[] = [];
  const store: DeliveryStore = {
    claim: () =>
      Promise.resolve([{
        id: 'd',
        leaseToken: 'l',
        eventId: 'e',
        attempt: 1,
        targetUrl: 'https://example.com',
        rawBody: '{}',
      }]),
    secret: () => Promise.resolve('fixture'),
    complete: (_d, r) => {
      results.push(r.category);
      return Promise.resolve(true);
    },
  };
  await dispatchWebhookBatch(store, {
    timeoutMs: 10,
    resolve: async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return ['8.8.8.8'];
    },
    send: () => {
      sends++;
      return Promise.resolve({ status: 200, retryAfter: null });
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assertEquals(sends, 0);
  assertEquals(results, ['timeout']);
});
