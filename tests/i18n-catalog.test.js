import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { parse } from 'acorn';
import { catalogs } from '../src/core/i18n.js';

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => (entry.isDirectory() ? sourceFiles(`${dir}/${entry.name}`) : `${dir}/${entry.name}`)));
  return files.flat().filter(file => file.endsWith('.js') && !file.includes('/locales/') && !file.includes('/data/'));
}
function walk(node, visit, parent) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc') continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit, node));
    else if (value && typeof value === 'object') walk(value, visit, node);
  }
}

test('every explicit UI translation has a Portuguese and English catalog entry', async () => {
  const missing = [];
  for (const file of await sourceFiles(new URL('../src', import.meta.url).pathname)) {
    const ast = parse(await readFile(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    walk(ast, node => {
      if (node.type !== 'CallExpression' || !['t', 'tr'].includes(node.callee.name)) return;
      const key = node.arguments[0]?.value;
      if (typeof key !== 'string' || !key) return;
      for (const locale of ['pt-BR', 'en'])
        if (!Object.hasOwn(catalogs[locale], key)) missing.push(`${locale} ${file.split('/src/')[1]}:${node.loc.start.line} ${key}`);
    });
  }
  assert.deepEqual(missing, []);
});

test('translated display labels never replace canonical domain IDs', async () => {
  const invalid = [];
  const canonical = new Set(['created', 'completed', 'assigned', 'moved', 'archived', 'restored', 'renamed', 'estimated', 'reopened']);
  for (const file of await sourceFiles(new URL('../src', import.meta.url).pathname)) {
    const ast = parse(await readFile(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    walk(ast, (node, parent) => {
      if (node.type !== 'CallExpression' || !['t', 'tr'].includes(node.callee.name)) return;
      const key = node.arguments[0]?.value;
      if (typeof key !== 'string' || !key) return;
      const domainProperty = parent?.type === 'Property' && parent.value === node && ['id', 'role', 'op'].includes(parent.key.name);
      if (domainProperty || (canonical.has(key) && (parent?.type === 'ArrayExpression' || parent?.type === 'SwitchCase')))
        invalid.push(`${file}:${node.loc.start.line} ${key}`);
    });
  }
  assert.deepEqual(invalid, []);
});

test('translated messages retain all interpolation fields', () => {
  const placeholders = message => [...new Set(String(message).match(/\{\w+\}/g) || [])].sort();
  const invalid = [];
  for (const [key, value] of Object.entries(catalogs['pt-BR'])) {
    for (const message of typeof value === 'object' ? Object.values(value) : [value]) {
      if (JSON.stringify(placeholders(key)) !== JSON.stringify(placeholders(message))) invalid.push(key);
    }
  }
  assert.deepEqual(invalid, []);
});
