/** Generate a private local ES256 key with the official Supabase CLI. Never print key material. */
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('../supabase/.temp/', import.meta.url));
const destination = fileURLToPath(new URL('../supabase/.temp/task3-signing-keys.json', import.meta.url));
mkdirSync(directory, { recursive: true, mode: 0o700 });
if (existsSync(destination)) {
  const keys = JSON.parse(readFileSync(destination, 'utf8'));
  if (!Array.isArray(keys)) throw new Error('Invalid local signing key file.');
  if (keys.length) {
    if (keys[0]?.alg !== 'ES256' || !keys[0]?.d) throw new Error('Invalid local signing key file.');
    chmodSync(destination, 0o600);
    process.stdout.write('Local OAuth signing key already exists.\n');
    process.exit(0);
  }
} else {
  // CLI config loading requires the configured path to exist even for key generation.
  writeFileSync(destination, '[]', { mode: 0o600, flag: 'wx' });
}
const generated = spawnSync('supabase', ['gen', 'signing-key', '--algorithm', 'ES256', '--append'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  encoding: 'utf8',
  input: 'n\n',
});
if (generated.status !== 0) {
  process.stderr.write('Supabase CLI could not generate the local key. Check the local config and CLI version.\n');
  process.exit(1);
}
const keys = JSON.parse(readFileSync(destination, 'utf8'));
if (!Array.isArray(keys) || keys[0]?.alg !== 'ES256' || !keys[0]?.d) throw new Error('Invalid local signing key file.');
chmodSync(destination, 0o600);
process.stdout.write('Local OAuth signing key created in ignored supabase/.temp/. Run supabase start next.\n');
