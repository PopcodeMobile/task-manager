import assert from 'node:assert/strict';
import { validateCommand } from '../_shared/validation.ts';
const owner = '00000000-0000-0000-0000-000000000001';
const asset = '20000000-0000-0000-0000-000000000001';
const dataUrl = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAA==';
Deno.test('cloud validator accepts nullable paths and batches, rejects URLs/local data/unknown fields', () => {
  const envelope = (input: Record<string, unknown>) => ({ workspaceId: owner, expectedVersion: 1, idempotencyKey: 'brand', input });
  const path = `${owner}/${asset}.webp`;
  for (const input of [{ logoPath: path }, { logoPath: null }, { name: 'Brand', logoPath: path }, { color: '#112233' }])
    assert.deepEqual(validateCommand('update_workspace', envelope(input)), envelope(input));
  validateCommand('batch', envelope({ commands: [{ operation: 'update_workspace', input: { logoPath: path }, expectedVersion: 1 }] }));
  for (const input of [
    {},
    { logoPath: '' },
    { logoPath: 1 },
    { logoPath: {} },
    { logoPath: dataUrl },
    { logoPath: `https://example.test/${path}` },
    { logoPath: `${owner}/../${asset}.webp` },
    { logoPath: path.toUpperCase() },
    { logoPath: `${asset}/${asset}.webp` },
    { logoPath: path + '.svg' },
    { logoDataUrl: dataUrl },
    { logoPath: null, extra: true },
  ])
    assert.throws(
      () => validateCommand('update_workspace', envelope(input)),
      (e: any) => e.code === 'validation_error',
    );
  assert.throws(
    () =>
      validateCommand('batch', envelope({ commands: [{ operation: 'update_workspace', input: { logoPath: `${asset}/${asset}.webp` }, expectedVersion: 1 }] })),
    (e: any) => e.code === 'validation_error',
  );
});
