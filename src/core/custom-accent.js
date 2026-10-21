import { ACCENTS } from './design-tokens.js';

const BLACK = '#000000';
const WHITE = '#FFFFFF';
// Mirrors bg, bg-side, surface, surface-2, surface-3 and sunken in tokens.css.
const LIGHT_SURFACES = ['#FBFAF8', '#F4F3F0', WHITE, '#F6F5F2', '#EEEDE9', '#F7F6F3'];
const DARK_SURFACES = ['#1D1C1A', '#1A1A19', '#151514', '#1D1D1C', '#252524', '#2D2D2B', '#181817'];
const OVERRIDES = ['--acc-l', '--acc-d', '--on-accent'];
const NAMED_ACCENTS = new Set([...ACCENTS.map(accent => accent.id), 'green', 'amber']);

export function normalizeAccentHex(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim();
  if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) return null;
  return (hex.length === 4 ? '#' + [...hex.slice(1)].map(channel => channel + channel).join('') : hex).toUpperCase();
}

function channels(hex) {
  return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
}
function luminance(color) {
  const [r, g, b] = (typeof color === 'string' ? channels(color) : color).map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const first = luminance(a),
    second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
function contrastVariant(base, surfaces, target) {
  const readable = color => {
    const foreground = channels(color);
    // The opaque 17% account-avatar tint is stronger than accent-soft (10%)
    // and accent-soft layered over an unread row (13.15%). Keep fractional
    // sRGB channels: CSS color-mix does not round the composite to a HEX value.
    return surfaces.every(surface => {
      const background = channels(surface);
      const tint = background.map((channel, index) => channel * 0.83 + foreground[index] * 0.17);
      return contrast(foreground, background) >= 4.5 && contrast(foreground, tint) >= 4.5;
    });
  };
  if (readable(base)) return base;
  const from = channels(base),
    to = channels(target);
  const mix = amount =>
    '#' +
    from
      .map((channel, index) =>
        Math.round(channel + (to[index] - channel) * amount)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase();
  let low = 0,
    high = 1;
  // Keep the passing side of the search, including channel rounding boundaries.
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (readable(mix(middle))) high = middle;
    else low = middle;
  }
  return mix(high);
}

export function customAccentColors(value) {
  const base = normalizeAccentHex(value);
  if (!base) return null;
  return { base, light: contrastVariant(base, LIGHT_SURFACES, BLACK), dark: contrastVariant(base, DARK_SURFACES, WHITE) };
}

export function applyAccentPreference(root, value, dark = false) {
  for (const property of OVERRIDES) root.style.removeProperty(property);
  const colors = customAccentColors(value);
  if (!colors) {
    root.dataset.accent = NAMED_ACCENTS.has(value) ? value : 'indigo';
    return;
  }
  root.dataset.accent = colors.base;
  root.style.setProperty('--acc-l', colors.light);
  root.style.setProperty('--acc-d', colors.dark);
  const current = dark ? colors.dark : colors.light;
  root.style.setProperty('--on-accent', contrast(current, BLACK) > contrast(current, WHITE) ? BLACK : WHITE);
}
