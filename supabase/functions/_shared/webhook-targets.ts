import { isIP } from 'node:net';
export type Resolver = (hostname: string) => Promise<string[]>;
export interface WebhookTarget {
  url: URL;
  hostname: string;
  address: string;
  family: 4 | 6;
}
export class TargetRejected extends Error {
  constructor() {
    super('target_rejected');
  }
}
/** Conservative global-unicast policy, including IANA special-purpose/documentation ranges. */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && ((b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99) || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6 || address.includes('.')) return false;
  const first = parseInt(address.split(':')[0], 16), second = parseInt(address.split(':')[1] || '0', 16);
  // Only 2000::/3 is globally routable today. Exclude special assignments inside it.
  return first >= 0x2000 && first <= 0x3fff && !(first === 0x2001 && second < 0x200) &&
    !(first === 0x2001 && second === 0xdb8) && first !== 0x2002 && !(first === 0x3fff && second < 0x1000);
}
export const resolvePublicDns: Resolver = async (hostname) => {
  const results = await Promise.allSettled([Deno.resolveDns(hostname, 'A'), Deno.resolveDns(hostname, 'AAAA')]);
  const addresses: string[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') addresses.push(...result.value);
    else if (!(result.reason instanceof Deno.errors.NotFound)) throw new TargetRejected();
  }
  return addresses;
};
export async function validateWebhookTarget(
  value: string,
  resolve: Resolver = resolvePublicDns,
): Promise<WebhookTarget> {
  try {
    const url = new URL(value), hostname = url.hostname.toLowerCase();
    if (
      value.length > 2048 || url.protocol !== 'https:' || url.username || url.password || url.hash || url.search ||
      (url.port && url.port !== '443') || hostname.endsWith('.') || hostname.startsWith('[') || isIP(hostname) ||
      !hostname.includes('.') || !/^[a-z0-9.-]+$/.test(hostname) || hostname.split('.').some((label) =>
        !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
      ) ||
      /(?:^|\.)(?:localhost|local|internal|invalid|test|example)$/.test(hostname)
    ) throw new TargetRejected();
    const addresses = await resolve(hostname);
    if (!addresses.length || !addresses.every(isPublicAddress)) throw new TargetRejected();
    return { url, hostname, address: addresses[0], family: isIP(addresses[0]) as 4 | 6 };
  } catch {
    throw new TargetRejected();
  }
}
