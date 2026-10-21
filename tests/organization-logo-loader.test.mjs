import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = stripTypeScriptTypes(readFileSync(new URL('../src/app/workspaces/organization-logo.ts', import.meta.url), 'utf8'), { mode: 'transform' })
  .replace(/^import .*;$/m, '')
  .replaceAll('export ', '');
const path = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp';
function loader(result) {
  const calls = [];
  const blob = new Blob(['fixture'], { type: 'image/webp' });
  const context = vm.createContext({
    supabase: {
      storage: {
        from(bucket) {
          assert.equal(bucket, 'organization-logos');
          return {
            async download(...args) {
              calls.push(args);
              return result ?? { data: blob, error: null };
            },
          };
        },
      },
    },
    URL: {
      createObjectURL(data) {
        assert.equal(data, blob);
        return 'blob:private-logo';
      },
    },
  });
  vm.runInContext(source, context);
  return { load: vm.runInContext('organizationLogoSource', context), calls };
}

test('cloud logo uses authenticated SDK download with HTTP cache disabled', async () => {
  const { load, calls } = loader();
  assert.equal(await load(path), 'blob:private-logo');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], path);
  assert.deepEqual(Object.keys(calls[0][1]), []);
  assert.equal(calls[0][2].cache, 'no-store');
});
test('invalid external/SVG paths cannot trigger a download and local images stay local', async () => {
  const { load, calls } = loader();
  for (const value of ['https://example.test/logo.webp', 'data:image/svg+xml;base64,AAAA', '../logo.webp', '']) assert.equal(await load(value), null);
  const local = 'data:image/webp;base64,AAAA';
  assert.equal(await load(local), local);
  assert.equal(calls.length, 0);
});
test('denied authenticated logo read uses the fallback without a blob URL', async () => {
  const { load } = loader({ data: null, error: { message: 'private error is not returned' } });
  assert.equal(await load(path), null);
});
