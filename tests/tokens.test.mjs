import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { auditTokenSources, readProjectSources } from '../scripts/check-tokens.mjs';
import { migrateStyleText } from '../scripts/migrate-style-tokens.mjs';

const sources = await readProjectSources();
const tokens = sources.find(file => file.path.endsWith('/tokens.css')).source;
const lightBlock = tokens.split(':root {')[1].split('\n}')[0];
const defaults = new Map([...lightBlock.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(match => [match[1], match[2]]));
function dependencyChain(value, name, visited = new Set()) {
  if (value.includes(`var(${name})`)) return true;
  return [...value.matchAll(/var\((--[\w-]+)/g)].some(([, ref]) => {
    if (visited.has(ref)) return false;
    visited.add(ref);
    return dependencyChain(defaults.get(ref) || '', name, visited);
  });
}
function declaration(source, selector, property) {
  const block = source.split(`${selector} {`)[1]?.split('}')[0];
  assert.ok(block, `Missing ${selector}`);
  const value = block.match(new RegExp(`(?:^|[;\\n])\\s*${property}:\\s*([^;]+);`))?.[1];
  assert.ok(value, `Missing ${selector} ${property}`);
  return value;
}

test('the complete token inventory and CSS consumers pass the guard', () => {
  assert.deepEqual(auditTokenSources(sources, { checkInline: false }), []);
});

test('unknown references, hardcoded CSS and inline regressions fail the guard', () => {
  const faults = auditTokenSources([
    ...sources,
    { path: 'src/styles/regression.css', source: '.bad { color: var(--unknown); padding: 12px; background: #123456; }' },
    { path: 'src/pages/regression.js', source: 'const html = `<div style="gap:8px;color:var(--missing-inline)"></div>`;' },
  ]);
  assert.ok(faults.some(fault => fault.includes('undefined --unknown')));
  assert.ok(faults.some(fault => fault.includes('undefined --missing-inline')));
  assert.ok(faults.some(fault => fault.includes('fixed padding')));
  assert.ok(faults.some(fault => fault.includes('fixed style color')));
  assert.ok(faults.some(fault => fault.includes('fixed inline gap')));
});

test('runtime geometry and user-owned color values are permitted', () => {
  const source = 'const color = "#c0ffee"; const html = `<div style="--c:${color};left:${x}px;width:${progress}%"></div>`;';
  assert.deepEqual(auditTokenSources([sources.find(file => file.path.endsWith('/tokens.css')), { path: 'src/data/user-preview.js', source }]), []);
});

test('foundation overrides reach the actual button, overlay and sidebar styles', async () => {
  const components = await readFile('src/styles/components.css', 'utf8');
  const overlays = await readFile('src/styles/overlays.css', 'utf8');
  const shell = await readFile('src/styles/shell.css', 'utf8');
  assert.ok(dependencyChain(declaration(components, '.btn', 'gap'), '--space-unit'));
  assert.ok(dependencyChain(declaration(components, '.btn', 'border-radius'), '--radius-unit'));
  assert.ok(dependencyChain(declaration(components, '.btn', 'font-size'), '--fs-sm'));
  assert.ok(dependencyChain(declaration(components, '.btn', 'transition'), '--motion-step'));
  assert.ok(dependencyChain(declaration(components, '.btn-primary', 'background'), '--accent'));
  assert.ok(dependencyChain(declaration(overlays, '.modal', 'max-width'), '--modal-md'));
  assert.ok(dependencyChain(declaration(shell, '.shell', 'grid-template-columns'), '--side-w'));
});

test('template migration is idempotent and preserves runtime geometry and data', () => {
  const source =
    'const color = "#f06"; const html = `<div style="padding:12px 6px;margin-left:-4px;gap:8px;font-size:12px;border-radius:6px;left:${x}px;width:${width}%;--c:${color}"></div>`;';
  const result = migrateStyleText(source);
  assert.match(result, /padding:var\(--s-3\) var\(--s-1-5\)/);
  assert.match(result, /margin-left:calc\(var\(--s-1\) \* -1\)/);
  assert.match(result, /font-size:var\(--fs-xs\)/);
  assert.match(result, /border-radius:var\(--r-sm\)/);
  assert.ok(result.includes('left:${x}px;width:${width}%;--c:${color}'));
  assert.ok(result.includes('const color = "#f06"'));
  assert.equal(migrateStyleText(result), result);
});

test('catalog previews cannot dispatch seeded or destructive entity actions', async () => {
  const catalog = await readFile('src/pages/design-system.js', 'utf8');
  assert.doesNotMatch(catalog, /data-a="(?:delTask|delProject|removeMember|archiveProject|newTask|newProject|openTask)"/);
  assert.doesNotMatch(catalog, /data-id="[ptm]\d+"/);
  assert.match(catalog, /class="ds-card-preview" inert/);
  assert.match(catalog, /class="panel ds-list-preview" inert/);
  assert.match(catalog, /data-a="demoConfirm"/);
});
