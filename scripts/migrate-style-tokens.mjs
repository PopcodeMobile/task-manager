/** One-time, idempotent migration for static template styles.
 * Runtime geometry (positions, widths, percentages, icon SVG coordinates) remains data.
 * Run only after other template edits are complete: node scripts/migrate-style-tokens.mjs --write
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const spaces = new Map([
  [2, '--s-half'],
  [4, '--s-1'],
  [6, '--s-1-5'],
  [8, '--s-2'],
  [10, '--s-2-5'],
  [12, '--s-3'],
  [14, '--s-3-5'],
  [16, '--s-4'],
  [20, '--s-5'],
  [24, '--s-6'],
  [28, '--s-7'],
  [32, '--s-8'],
  [40, '--s-10'],
  [48, '--s-12'],
  [64, '--s-16'],
  [72, '--s-18'],
  [80, '--s-20'],
  [96, '--s-24'],
]);
const sizes = new Map([
  [11, '--fs-2xs'],
  [11.5, '--fs-meta'],
  [12, '--fs-xs'],
  [12.5, '--fs-sm'],
  [13, '--fs-body-sm'],
  [13.5, '--fs'],
  [14, '--fs-label'],
  [14.5, '--fs-md'],
  [15, '--fs-input'],
  [16, '--fs-lg'],
  [19, '--fs-xl'],
  [20, '--fs-subtitle'],
  [22, '--fs-stat'],
  [23, '--fs-2xl'],
  [30, '--fs-display'],
]);
const radii = new Map([
  [2, '--r-2xs'],
  [4, '--r-xs'],
  [6, '--r-sm'],
  [8, '--r'],
  [10, '--r-lg'],
  [12, '--r-xl'],
  [14, '--r-2xl'],
  [999, '--r-full'],
]);
const weights = new Map([
  ['400', '--fw-regular'],
  ['450', '--fw-book'],
  ['500', '--fw-medium'],
  ['600', '--fw-semibold'],
  ['700', '--fw-bold'],
]);
const leading = new Map([
  ['1', '--lh-tight'],
  ['1.1', '--lh-stat'],
  ['1.2', '--lh-heading'],
  ['1.3', '--lh-compact'],
  ['1.4', '--lh-snug'],
  ['1.45', '--lh-body'],
  ['1.5', '--lh-relaxed'],
  ['1.55', '--lh-copy'],
  ['1.6', '--lh-reading'],
]);
const times = new Map([
  [120, '--dur-fast'],
  [140, '--dur'],
  [200, '--dur-ui'],
  [260, '--dur-enter'],
  [340, '--dur-drawer'],
  [400, '--dur-page'],
  [700, '--dur-spin'],
  [1000, '--dur-feedback'],
  [1300, '--dur-shimmer'],
]);
const token = name => `var(${name})`;
export function spaceValue(n) {
  if (!n) return '0';
  if (n < 0) return `calc(${spaceValue(-n)} * -1)`;
  return spaces.has(n) ? token(spaces.get(n)) : `calc(var(--space-unit) * ${n / 4})`;
}
export function migrateDeclaration(property, value) {
  if (/^(?:margin|padding)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?$|^(?:row-|column-)?gap$/.test(property))
    return value.replace(/(?<![\w.-])(-?\d*\.?\d+)px\b/g, (_, n) => spaceValue(Number(n)));
  if (property === 'font-size') return value.replace(/(?<![\w.-])(\d*\.?\d+)px\b/g, (raw, n) => (sizes.has(Number(n)) ? token(sizes.get(Number(n))) : raw));
  if (property === 'font-weight') return weights.has(value.trim()) ? token(weights.get(value.trim())) : value;
  if (property === 'line-height') return leading.has(value.trim()) ? token(leading.get(value.trim())) : value;
  if (/^border(?:-(?:top|bottom)-(?:left|right))?-radius$/.test(property))
    return value
      .replace(/(?<![\w.-])(\d*\.?\d+)px\b/g, (_, n) => (radii.has(Number(n)) ? token(radii.get(Number(n))) : `calc(var(--radius-unit) * ${Number(n) / 2})`))
      .replace(/\b50%/g, token('--r-circle'))
      .replace(/\b28%/g, token('--r-brand'));
  if (/^(?:animation|transition)(?:-duration|-delay)?$/.test(property))
    return value.replace(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g, (_, n, unit) => {
      const ms = Number(n) * (unit === 's' ? 1000 : 1);
      return times.has(ms) ? token(times.get(ms)) : `calc(var(--motion-step) * ${Number((ms / 10).toFixed(3))})`;
    });
  return value;
}
export function migrateStyleText(source) {
  // These property names do not occur as application data. Stop before template
  // expressions/string delimiters, so only complete static declarations change.
  const migrated = source.replace(
    /\b((?:margin|padding)(?:-[a-z-]+)?|(?:row-|column-)?gap|font-size|font-weight|line-height|border(?:-[a-z-]+)?-radius|animation(?:-duration|-delay)?|transition(?:-duration|-delay)?)\s*:\s*([^;{}"'`\n]+)/g,
    (all, property, value) => `${property}:${migrateDeclaration(property, value)}`,
  );
  // Fixed QR/brand presentation colors stay fixed through explicit palette tokens.
  // Stored project/avatar colors and SVG brand artwork are application data.
  const colors = new Map([
    ['#fff', '--white'],
    ['#ffffff', '--white'],
    ['#000', '--black'],
    ['#000000', '--black'],
    ['#1d1c1a', '--palette-light-text'],
  ]);
  return migrated.replace(
    /\bstyle="([^"]*)"/g,
    (all, style) => `style="${style.replace(/#[\da-f]{3,8}\b/gi, raw => (colors.has(raw.toLowerCase()) ? token(colors.get(raw.toLowerCase())) : raw))}"`,
  );
}
async function files(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map(entry => (entry.isDirectory() ? files(`${dir}/${entry.name}`) : `${dir}/${entry.name}`)),
    )
  ).flat();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let count = 0;
  for (const path of await files('src')) {
    if (!path.endsWith('.js') || path.includes('/locales/')) continue;
    const before = await readFile(path, 'utf8'),
      after = migrateStyleText(before);
    if (before === after) continue;
    count++;
    if (process.argv.includes('--write')) await writeFile(path, after);
  }
  console.log(`${count} template files ${process.argv.includes('--write') ? 'migrated' : 'would change (pass --write to apply)'}`);
}
