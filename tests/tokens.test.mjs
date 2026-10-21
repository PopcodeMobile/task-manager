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
  assert.deepEqual(auditTokenSources(sources), []);
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

test('foundation overrides reach the supported React button, drawer and sidebar styles', async () => {
  const entry = await readFile('src/app/styles.css', 'utf8');
  assert.match(entry, /@import ['"]\.\/design\/base\.css['"]/);
  const components = await readFile('src/app/design/base.css', 'utf8');
  const shell = await readFile('src/app/shell/workspace.css', 'utf8');
  const preferences = await readFile('src/app/panel/panel.css', 'utf8');
  assert.ok(dependencyChain(declaration(components, '.ui-button', 'gap'), '--space-unit'));
  assert.ok(dependencyChain(declaration(components, '.ui-button', 'border-radius'), '--radius-unit'));
  assert.ok(dependencyChain(declaration(components, '.ui-button', 'font-size'), '--fs-body-sm'));
  assert.ok(dependencyChain(declaration(components, '.ui-button-primary', 'background'), '--accent'));
  assert.ok(dependencyChain(declaration(shell, '.ui-sheet', 'width'), '--drawer-w'));
  assert.ok(dependencyChain(declaration(shell, '.work-shell', 'grid-template-columns'), '--side-w'));
  // Final controls do not animate; both explicit and system reduced-motion remain honored.
  assert.match(preferences, /prefers-reduced-motion: reduce/);
  assert.match(preferences, /transition: none !important/);
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

test('catalogue demonstrations never call entity writers', async () => {
  const catalog = await readFile('src/app/panel/CataloguePage.tsx', 'utf8');
  assert.doesNotMatch(catalog, /\.(?:execute|command|rpc)\(/);
  assert.doesNotMatch(catalog, /(?:delete_task|create_task|delete_project|create_project)/);
  assert.match(catalog, /setConfirm\(true\)/);
  assert.match(catalog, /setModal\(true\)/);
  // Actual persisted-state invariance is exercised by the browser states-controls test.
});

test('source discovery includes the final React TS and TSX consumers', () => {
  assert.ok(sources.some(file => file.path === 'src/app/App.tsx'));
  assert.ok(sources.some(file => file.path === 'src/components/ui/utils.ts'));
});

test('React controlled styles follow constants, spreads, assertions and conditional branches', () => {
  const faults = auditTokenSources([
    sources.find(file => file.path.endsWith('/tokens.css')),
    {
      path: 'src/components/ui/probe.tsx',
      source: `
      const base = { padding: 12, fontWeight: 600 };
      const paint = { ...base, borderRadius: '4px', color: '#123456' } as CSSProperties;
      const ok = { gap: 'var(--s-2)' };
      export const Probe = () => <div style={active ? paint : { ...ok, transitionDuration: '200ms', '--probe': 'var(--missing)' }} />;
    `,
    },
  ]);
  for (const fragment of ['padding', 'font-weight', 'border-radius', 'color', 'motion', 'undefined --missing'])
    assert.ok(
      faults.some(fault => fault.includes(fragment)),
      `Missed ${fragment}: ${faults.join('\n')}`,
    );
});

test('static cn and cva utilities reject framework scales and modified arbitrary literals', () => {
  const faults = auditTokenSources([
    sources.find(file => file.path.endsWith('/tokens.css')),
    {
      path: 'src/components/ui/probe.tsx',
      source: `
      const variant = cva('bg-red-500', { variants: { size: { sm: 'p-4 rounded', lg: 'md:hover:rounded-lg' } } });
      const classes = cn('dark:text-[#123456]', enabled && 'duration-200', { 'gap-[12px]': enabled });
      export const Probe = () => <div className={cn(classes, variant(), 'font-semibold', 'text-sm', 'leading-6')} />;
    `,
    },
  ]);
  for (const fragment of [
    'bg-red-500',
    'rounded',
    'p-4',
    'md:hover:rounded-lg',
    'dark:text-[#123456]',
    'duration-200',
    'gap-[12px]',
    'font-semibold',
    'text-sm',
    'leading-6',
  ])
    assert.ok(
      faults.some(fault => fault.includes(fragment)),
      `Missed ${fragment}`,
    );
});

test('semantic aliases require authored theme declarations; token utilities and runtime geometry stay valid', () => {
  const base = sources.find(file => file.path.endsWith('/tokens.css'));
  const component = {
    path: 'src/probe.tsx',
    source: `
    const box = { left: x, top: y, width: progress + '%', height: count * 40, color: validatedColor, padding: 'var(--s-2)' };
    const domainColor = '#c0ffee';
    export const Probe = () => <div style={box} className={cn('hover:bg-primary', 'p-[var(--s-2)]', 'rounded-[var(--r)]', 'w-[125px]', 'flex', 'text-foreground')} />;
  `,
  };
  const theme = { path: 'src/app/styles.css', source: '@theme inline { --color-primary: var(--accent); --color-foreground: var(--text); }' };
  assert.deepEqual(auditTokenSources([base, theme, component]), []);
  assert.ok(auditTokenSources([base, component]).some(fault => fault.includes('bg-primary')));
  const invalid = { path: 'src/arbitrary.tsx', source: '<div className="p-[var(--missing-space)] [padding:12px] hover:[color:#123456]" />' };
  const faults = auditTokenSources([base, invalid]);
  assert.ok(faults.some(fault => fault.includes('undefined --missing-space')));
  assert.ok(faults.some(fault => fault.includes('[padding:12px]')));
  assert.ok(faults.some(fault => fault.includes('[color:#123456]')));
});

test('foundation formulas in React preserve token multipliers while bare radius utilities cannot bypass the guard', () => {
  const base = sources.find(file => file.path.endsWith('/tokens.css'));
  assert.deepEqual(
    auditTokenSources([
      base,
      { path: 'src/formula.tsx', source: `<div style={{ padding: 'calc(var(--space-unit) * 3)', borderRadius: 'calc(var(--radius-unit) * 2)' }} />` },
    ]),
    [],
  );
  const faults = auditTokenSources([base, { path: 'src/radius.tsx', source: '<div className="hover:rounded p-(--missing-space)" />' }]);
  assert.ok(faults.some(fault => fault.includes('hover:rounded')));
  assert.ok(faults.some(fault => fault.includes('undefined --missing-space')));
});

test('signed numeric styles and computed literal keys cannot bypass controlled spacing', () => {
  const faults = auditTokenSources([
    sources.find(file => file.path.endsWith('/tokens.css')),
    {
      path: 'src/signed.tsx',
      source: "const spacing = -12; const styles = { ['padding']: 8, marginTop: spacing }; export const Probe = () => <div style={styles} />;",
    },
  ]);
  assert.ok(faults.some(fault => fault.includes('fixed padding')));
  assert.ok(faults.some(fault => fault.includes('fixed margin-top')));
});

for (const [name, source, expected] of [
  ['style template', 'const pad = 12; export const Probe = () => <div style={{ padding: `${pad}px` }} />;', 'fixed padding'],
  ['class template', 'const pad = 4; export const Probe = () => <div className={`p-${pad}`} />;', 'p-4'],
  ['computed const key', 'const key = "padding"; export const Probe = () => <div style={{ [key]: 12 }} />;', 'fixed padding'],
]) {
  test(`static local ${name} cannot bypass the token policy`, () => {
    const faults = auditTokenSources([sources.find(file => file.path.endsWith('/tokens.css')), { path: 'src/probe.tsx', source }]);
    assert.ok(
      faults.some(fault => fault.includes(expected)),
      `Missed ${name}: ${faults.join('\n')}`,
    );
  });
}

test('nested static templates and computed class keys retain modifier and arbitrary-value checks', () => {
  const source = [
    'const size = 12; const px = `${size}px`; const key = `pad${"ding"}`;',
    'const utility = `hover:gap-[${px}]`; const styles = { [key]: px };',
    'export const Probe = () => <div style={styles} className={cn({ [utility]: enabled })} />;',
  ].join('\n');
  const faults = auditTokenSources([sources.find(file => file.path.endsWith('/tokens.css')), { path: 'src/probe.tsx', source }]);
  assert.ok(faults.some(fault => fault.includes('fixed padding')));
  assert.ok(faults.some(fault => fault.includes('hover:gap-[12px]')));
});

test('static token templates and dynamic imported generated values retain geometry and domain-color tolerance', () => {
  const source = [
    'import { importedPad, importedKey } from "./runtime";',
    'const token = "var(--s-2)"; const tokenClass = `p-[${token}]`; const key = "padding";',
    'const generated = readSize(); const domainColor = validateColor(userColor);',
    'const cycleA = cycleB; const cycleB = cycleA;',
    'export const Probe = ({ pad, property, progress }) => <>',
    '<div style={{ [key]: `${token}`, width: `${12}px`, left: `${progress}%`, color: `${domainColor}` }} className={tokenClass} />',
    '<div style={{ padding: `${pad}px`, [property]: 12, margin: `${importedPad}px`, [importedKey]: 8, gap: `${generated}px`, borderRadius: `${cycleA}px` }} className={`p-${pad}`} />',
    '</>;',
  ].join('\n');
  assert.deepEqual(auditTokenSources([sources.find(file => file.path.endsWith('/tokens.css')), { path: 'src/probe.tsx', source }]), []);
});

test('unknown template substitutions do not turn partial utilities or shadowed parameters into static values', () => {
  const source = [
    'import { importedPad } from "./runtime";',
    'const pad = 12; const key = "padding"; let mutable = 4; mutable = readSize();',
    'export const Probe = (pad, key, color) => <div',
    '  style={{ padding: `${pad}px`, [key]: 12, margin: `${mutable}px`, color: `${color}` }}',
    '  className={`p-[${pad}px] bg-[${color}] hover:p-${importedPad} gap-${mutable}`} />;',
  ].join('\n');
  const base = sources.find(file => file.path.endsWith('/tokens.css'));
  assert.deepEqual(auditTokenSources([base, { path: 'src/probe.tsx', source }]), []);
  const mixed = 'const spacing = 6; export const Probe = ({ pad, extra }) => <div className={`p-[${pad}px] hover:gap-4 p-4 md:gap-${spacing} ${extra}`} />; ';
  const faults = auditTokenSources([base, { path: 'src/mixed.tsx', source: mixed }]);
  assert.equal(faults.length, 3);
  for (const value of ['hover:gap-4', 'p-4', 'md:gap-6']) assert.ok(faults.some(fault => fault.includes(value)));
});

for (const [name, source] of [
  ['destructured local', 'const color = "#123456"; export const Probe = props => { const { color } = props; return <div style={{ color: `${color}` }} />; };'],
  ['uninitialized local', 'const pad = 12; export const Probe = props => { let pad; pad = props.pad; return <div style={{ padding: `${pad}px` }} />; };'],
  [
    'renamed nested destructuring',
    'const color = "#123456"; export const Probe = props => { const { appearance: { tone: color } } = props; return <div style={{ color: `${color}` }} />; };',
  ],
  ['array binding', 'const pad = 12; export const Probe = props => { const [pad] = props.sizes; return <div style={{ padding: `${pad}px` }} />; };'],
  [
    'catch binding',
    'const color = "#123456"; export const Probe = () => { try { readColor(); } catch (color) { return <div style={{ color: `${color}` }} />; } };',
  ],
]) {
  test(`nearest unknown ${name} shadows outer static values`, () => {
    assert.deepEqual(auditTokenSources([sources.find(file => file.path.endsWith('/tokens.css')), { path: 'src/probe.tsx', source }]), []);
  });
}

test('destructuring property names do not shadow outer bindings and shorthand const values remain checked', () => {
  const source = [
    'const pad = 12; const padding = 8;',
    'export const Probe = props => { const { pad: runtimePad } = props;',
    '  return <><div style={{ padding: `${runtimePad}px` }} /><div style={{ padding: `${pad}px` }} /><div style={{ padding }} /></>;',
    '};',
  ].join('\n');
  const faults = auditTokenSources([sources.find(file => file.path.endsWith('/tokens.css')), { path: 'src/probe.tsx', source }]);
  assert.equal(faults.length, 2);
  assert.ok(faults.some(fault => fault.includes('padding: 12px')));
  assert.ok(faults.some(fault => fault.includes('padding: 8')));
});
