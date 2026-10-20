export const messages = {
  unauthorized: 'Authentication required.',
  forbidden: 'Access denied.',
  not_found: 'Resource not found.',
  validation_error: 'Invalid request.',
  version_conflict: 'Resource changed. Refresh and retry.',
  already_claimed: 'Task is already claimed.',
  claim_expired: 'Task claim is missing or expired. Claim again.',
  idempotency_conflict: 'Idempotency key was used with a different request.',
  rate_limited: 'Too many requests. Retry later.',
  temporarily_unavailable: 'Service temporarily unavailable.',
} as const;
export type ErrorCode = keyof typeof messages;
export const statuses: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_error: 422,
  version_conflict: 409,
  already_claimed: 409,
  claim_expired: 409,
  idempotency_conflict: 409,
  rate_limited: 429,
  temporarily_unavailable: 503,
};
export class PublicError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
    this.name = 'PublicError';
  }
}
export function publicError(error: unknown): { code: ErrorCode; message: string; status: number } {
  const raw = error as { code?: string; message?: string } | null;
  let code: ErrorCode = 'temporarily_unavailable';
  if (error instanceof PublicError) code = error.code;
  else if (raw?.message && Object.hasOwn(messages, raw.message)) code = raw.message as ErrorCode;
  else if (['23503', '23514', '23502', '22P02', '22007', '22008', '22003', 'PT422'].includes(raw?.code ?? '')) {
    code = 'validation_error';
  } else if (raw?.code === '42501' || raw?.code === 'PT403') code = 'forbidden';
  else if (raw?.code === '40001') code = 'version_conflict';
  else if (raw?.code === 'PT401') code = 'unauthorized';
  else if (raw?.code === 'PT404') code = 'not_found';
  else if (raw?.code === 'PT429') code = 'rate_limited';
  return { code, message: messages[code], status: statuses[code] };
}
export function errorResponse(error: unknown, requestId: string, headers: HeadersInit = {}): Response {
  const safe = publicError(error);
  return Response.json(
    { error: { code: safe.code, message: safe.message, requestId } },
    {
      status: safe.status,
      headers: {
        ...Object.fromEntries(new Headers(headers)),
        'X-Request-Id': requestId,
        ...(safe.status === 429 ? { 'Retry-After': '60' } : {}),
      },
    },
  );
}
