/** Design-system guard: values belong to tokens; runtime data stays runtime data. */
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCENTS, TOKEN_GROUPS } from '../src/core/design-tokens.js';

const STYLE_COLOR = /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/i;
const SCALED_PROPERTIES = /^(?:(?:padding|margin)(?:-[a-z-]+)?|(?:row-|column-)?gap|font-size|border(?:-[a-z-]+)?-radius)$/;
const NUMBER = /(?<![\w.-])-?\d*\.?\d+(?:px)\b/;
const STATIC_DECLARATION =
  /\b((?:padding|margin)(?:-[a-z-]+)?|(?:row-|column-)?gap|font-size|font-weight|line-height|border(?:-[a-z-]+)?-radius|animation(?:-duration|-delay)?|transition(?:-duration|-delay)?)\s*:\s*([^;{}"'`\n]+)/g;
const stripComments = source => source.replace(/\/\*[\s\S]*?\*\//g, '');

export async function readProjectSources(base = '.') {
  async function walk(dir) {
    return (
      await Promise.all(
        (await readdir(dir, { withFileTypes: true })).map(entry => (entry.isDirectory() ? walk(`${dir}/${entry.name}`) : `${dir}/${entry.name}`)),
      )
    ).flat();
  }
  return Promise.all(
    (await walk(`${base}/src`))
      .filter(path => /\.(?:css|js)$/.test(path))
      .map(async path => ({ path: path.replace(`${base}/`, ''), source: await readFile(path, 'utf8') })),
  );
}

export function auditTokenSources(sources, { checkInline = true } = {}) {
  const failures = [];
  const tokenSource = sources.find(file => file.path.endsWith('styles/tokens.css'))?.source;
  if (!tokenSource) return ['Missing src/styles/tokens.css'];
  const allSource = sources.map(file => file.source).join('\n');
  const declared = new Set([...allSource.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
  const publicTokens = new Set([...tokenSource.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
  const inventory = TOKEN_GROUPS.flatMap(group => group.tokens);
  for (const name of publicTokens) if (!inventory.includes(name)) failures.push(`Catalog is missing ${name}`);
  for (const name of inventory) if (!publicTokens.has(name)) failures.push(`Catalog references undefined ${name}`);
  if (inventory.length !== new Set(inventory).size) failures.push('Catalog contains duplicate token names');
  for (const accent of ACCENTS)
    for (const field of ['token', 'lightToken', 'darkToken'])
      if (!publicTokens.has(accent[field])) failures.push(`Accent ${accent.id} references undefined ${accent[field]}`);

  for (const { path, source } of sources) {
    if (path.includes('/locales/')) continue;
    const clean = stripComments(source);
    // Dynamic --st-${status} references are checked against the finite status vocabulary.
    for (const match of clean.matchAll(/var\(\s*(--[\w-]+)(?=\s*[,)])/g)) if (!declared.has(match[1])) failures.push(`${path}: undefined ${match[1]}`);
    if (/var\(--st-\$\{/.test(clean))
      for (const status of ['backlog', 'todo', 'progress', 'review', 'done'])
        if (!publicTokens.has(`--st-${status}`)) failures.push(`${path}: missing status token --st-${status}`);
    if (path.endsWith('tokens.css')) continue;
    if (path.endsWith('.css')) {
      if (STYLE_COLOR.test(clean)) failures.push(`${path}: fixed style color outside tokens.css`);
      for (const match of clean.matchAll(STATIC_DECLARATION)) {
        const [, property, value] = match;
        if (SCALED_PROPERTIES.test(property) && NUMBER.test(value)) failures.push(`${path}: fixed ${property}: ${value.trim()}`);
        if (/^(font-weight|line-height)$/.test(property) && /^\d/.test(value.trim())) failures.push(`${path}: fixed ${property}: ${value.trim()}`);
        if (/^(animation|transition)/.test(property) && /\b\d*\.?\d+(?:ms|s)\b/.test(value)) failures.push(`${path}: fixed motion value: ${value.trim()}`);
      }
    } else if (checkInline) {
      for (const style of clean.matchAll(/style=(['"])([\s\S]*?)\1/g)) {
        if (STYLE_COLOR.test(style[2])) failures.push(`${path}: fixed inline style color`);
        for (const match of style[2].matchAll(STATIC_DECLARATION))
          if (SCALED_PROPERTIES.test(match[1]) && NUMBER.test(match[2])) failures.push(`${path}: fixed inline ${match[1]}: ${match[2].trim()}`);
      }
    }
  }
  return [...new Set(failures)];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sources = await readProjectSources();
  const failures = auditTokenSources(sources, { checkInline: !process.argv.includes('--css-only') });
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else console.log(`Token audit passed: ${TOKEN_GROUPS.flatMap(group => group.tokens).length} public tokens, ${sources.length} source files checked.`);
}
