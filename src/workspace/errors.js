export class WorkspaceError extends Error {
  constructor(code) {
    super(code);
    this.name = 'WorkspaceError';
    this.code = code;
  }
}
export function publicError(error) {
  const known = ['conflict', 'storage', 'corrupt', 'forbidden', 'not_found', 'stale_scope', 'configuration', 'unauthenticated', 'invalid', 'network', 'auth'];
  return known.includes(error?.code) ? error : new WorkspaceError('network');
}
export const clone = value => JSON.parse(JSON.stringify(value));
