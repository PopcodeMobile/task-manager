# Source equivalence and reachability methods

## task6d-format-equivalence.mjs

Run from repository root with Node and installed TypeScript; save under scripts/ or use an equivalent module resolution path. Output stays under /tmp. For the equivalence script, run once with `before` to capture the committed BASE, then without arguments to compare current source.

```js
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const files = [
  'supabase/functions/tests/team-membership-baselines.test.ts',
  'scripts/setup-webhooks.ts',
  'supabase/functions/_shared/webhook-delivery.ts',
  'supabase/functions/_shared/webhook-signing.ts',
  'supabase/functions/_shared/webhook-targets.ts',
  'supabase/functions/deno.json',
  'supabase/functions/mcp/index.ts',
  'supabase/functions/mcp/tools.ts',
  'supabase/functions/tests/oauth.test.ts',
  'supabase/functions/tests/webhook-delivery.test.ts',
  'supabase/functions/tests/webhook-transport.test.ts',
  'supabase/functions/webhook-dispatch/index.ts',
  'supabase/tests/webhook-dispatch-live.ts',
  'supabase/tests/webhook-edge/main.ts',
  'supabase/tests/webhook-edge/probe.ts',
];
function shape(file, baseline = false) {
  const source = baseline ? execFileSync('git', ['show', '2dbd14e:' + file], { encoding: 'utf8' }) : readFileSync(file, 'utf8');
  if (file.endsWith('.json')) return JSON.parse(source);
  const result = [];
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (root.parseDiagnostics.length) throw Error('Parse diagnostics: ' + file);
  function walk(node) {
    if (ts.isParenthesizedExpression(node)) {
      walk(node.expression);
      return;
    }
    if (ts.isParenthesizedTypeNode(node)) {
      walk(node.type);
      return;
    }
    result.push([node.kind, ts.isIdentifier(node) || ts.isLiteralExpression(node) ? node.text : null]);
    ts.forEachChild(node, walk);
    result.push('end');
  }
  walk(root);
  return result;
}
if (process.argv[2] === 'before') writeFileSync('/tmp/task6d-format-before.json', JSON.stringify(Object.fromEntries(files.map(f => [f, shape(f, true)]))));
else {
  const before = JSON.parse(readFileSync('/tmp/task6d-format-before.json'));
  for (const f of files) {
    if (JSON.stringify(before[f]) !== JSON.stringify(shape(f))) throw Error('AST mismatch: ' + f);
    console.log('Equivalent AST: ' + f);
  }
}
```

## task6d-import-closure.mjs

Run from repository root with Node and installed TypeScript; save under scripts/ or use an equivalent module resolution path. Output stays under /tmp. For the equivalence script, run once with `before` to capture the committed BASE, then without arguments to compare current source.

```js
import ts from 'typescript';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
const root = process.cwd(),
  seen = new Set(),
  missing = [];
function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const text = readFileSync(file, 'utf8'),
    imports = [];
  if (file.endsWith('.css')) {
    for (const match of text.matchAll(/@import\s+["']([^"']+)/g)) imports.push(match[1]);
  } else {
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    function walk(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
        imports.push(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0]))
        imports.push(node.arguments[0].text);
      ts.forEachChild(node, walk);
    }
    walk(ast);
  }
  for (const spec of imports) {
    if (!spec.startsWith('.')) continue;
    const p = resolve(dirname(file), spec),
      found = [p, ...['.ts', '.tsx', '.js', '.jsx', '.css', '/index.ts', '/index.tsx'].map(ext => p + ext)].find(existsSync);
    if (!found) missing.push({ file: relative(root, file), spec });
    else visit(found);
  }
}
visit(resolve('src/app/main.tsx'));
const files = [...seen].map(p => relative(root, p)).sort();
const forbidden = files.filter(p =>
  /tests\/fixtures|src\/(?:main\.js|actions\/|pages\/|views\/|shell\/|overlays\/|workspace\/(?:controller|config|auth|supabase|status)\.js|core\/(?:store|theme|navigation|icons)\.js)/.test(
    p,
  ),
);
const result = { entry: 'index.html -> src/app/main.tsx', modules: files.length, missing, forbidden, files };
writeFileSync('/tmp/task6d-import-closure.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ modules: files.length, missing, forbidden }));
if (missing.length || forbidden.length) process.exit(1);
```

## task6d-browser.mjs

Original wrapper logic. Supply private local status outside Git; never print or commit its values. Run from repository root. The browser wrapper requires a confirmed worktree freeze and free strict ports before execution. Build first, then freeze sources and outputs for preview runs.

```js
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const [mode, serve = 'dev', ...args] = process.argv.slice(2);
if (spawnSync('lsof', ['-nP', '-iTCP:5180', '-iTCP:5181', '-sTCP:LISTEN']).status === 0) throw Error('Owned ports occupied');
const output = mkdtempSync(`/tmp/task6d-${mode}-${serve}-`),
  env = { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: `${output}/results.json` };
if (mode !== 'local') {
  const s = JSON.parse(readFileSync('/tmp/task3-local-status.json', 'utf8'));
  Object.assign(env, { TEST_SUPABASE_URL: s.API_URL, TEST_SUPABASE_ANON_KEY: s.ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY });
}
if (serve === 'preview') {
  const paths = JSON.parse(readFileSync('/tmp/task6d-build-paths.json', 'utf8'));
  env.GR8R_PREVIEW_DIR = mode === 'local' ? paths.local : paths.cloud;
}
const config = mode === 'local' ? 'playwright.config.js' : mode === 'oauth' ? 'playwright.oauth.config.ts' : 'playwright.agent.config.ts';
const result = spawnSync('npx', ['playwright', 'test', '--config', config, '--reporter=list,json', '--output', output, ...args], {
  env,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
writeFileSync(`${output}/raw.log`, result.stdout + result.stderr);
console.log(JSON.stringify({ exitCode: result.status, output }));
console.log((result.stdout + result.stderr).split('\n').slice(-40).join('\n'));
process.exit(result.status ?? 1);
```

## task6d-build.mjs

Original wrapper logic. Supply private local status outside Git; never print or commit its values. Run from repository root. The browser wrapper requires a confirmed worktree freeze and free strict ports before execution. Build first, then freeze sources and outputs for preview runs.

```js
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const paths = {};
const envHash = createHash('sha256').update(readFileSync('.env.local')).digest('hex');
for (const mode of ['cloud', 'local']) {
  paths[mode] = mkdtempSync(join('/tmp', `task6d-${mode}-`));
  const env = { ...process.env };
  if (mode === 'local') for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY']) env[key] = '';
  const result = spawnSync('npm', ['run', 'build', '--', '--outDir', paths[mode], '--emptyOutDir'], { encoding: 'utf8', env });
  writeFileSync(`/tmp/task6d-build-${mode}.log`, result.stdout + result.stderr);
  console.log(`${mode} build exit: ${result.status}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const config = JSON.parse(readFileSync('/tmp/task3-local-status.json', 'utf8'));
const privateValues = Object.entries(config)
  .filter(([key, value]) => /SERVICE_ROLE|JWT_SECRET|PASSWORD/.test(key) && typeof value === 'string' && value.length > 8)
  .map(([, value]) => value);
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? files(join(path, entry.name)) : [join(path, entry.name)]));
}
const scan = {
  privateCandidates: privateValues.length,
  builds: {},
  envUnchanged: envHash === createHash('sha256').update(readFileSync('.env.local')).digest('hex'),
};
for (const [mode, path] of Object.entries(paths)) {
  const textFiles = files(path).filter(file => /\.(js|css|html|json)$/.test(file));
  const matches = textFiles.flatMap(file => privateValues.filter(value => readFileSync(file, 'utf8').includes(value)));
  scan.builds[mode] = {
    path,
    textArtifacts: textFiles.length,
    jsBundles: textFiles.filter(file => file.endsWith('.js')).length,
    literalPrivateMatches: matches.length,
  };
}
writeFileSync('/tmp/task6d-build-paths.json', JSON.stringify(paths, null, 2));
writeFileSync('/tmp/task6d-build-scan.json', JSON.stringify(scan, null, 2));
console.log(JSON.stringify(scan));
```
