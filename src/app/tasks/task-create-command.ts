/** Completion always passes through complete_task, atomically after version-1 creation. */
export function taskCreateCommand(input: Record<string, unknown>) {
  return input.status === 'done'
    ? {
        operation: 'batch',
        input: {
          commands: [
            { operation: 'create_task', input: { ...input, status: 'todo' } },
            { operation: 'complete_task', input: { id: input.id }, expectedVersion: 1 },
          ],
        },
      }
    : { operation: 'create_task', input };
}
export function knownNonCommitting(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return [
    'validation_error',
    'forbidden',
    'unauthorized',
    'not_found',
    'storage',
    'version_conflict',
    'rate_limited',
    'already_claimed',
    'claim_expired',
  ].includes(code);
}
