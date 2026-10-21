import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAccentPreference, customAccentColors, normalizeAccentHex } from '../src/core/custom-accent.js';
import { loadAppearance, saveAppearance } from '../src/workspace/device-preferences.js';

function luminance(hex) {
  const channels = Array.isArray(hex)
    ? hex.map(channel => channel / 255)
    : hex
        .slice(1)
        .match(/../g)
        .map(channel => parseInt(channel, 16) / 255);
  const [r, g, b] = channels.map(channel => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function rootElement() {
  const properties = new Map();
  return {
    dataset: {},
    style: { setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name) },
    properties,
  };
}

test('normalizes only complete RGB or RRGGBB hex input', () => {
  assert.equal(normalizeAccentHex('#f0a'), '#FF00AA');
  assert.equal(normalizeAccentHex(' #abC123 '), '#ABC123');
  for (const value of ['', 'red', 'fff', '#12', '#1234', '#12345678', '#fff; color: red', '#fff\n--acc-l:red', null, {}, 123]) {
    assert.equal(normalizeAccentHex(value), null);
  }
});

test('white and black bases remain unchanged in the theme where they have contrast', () => {
  assert.equal(customAccentColors('#fff').dark, '#FFFFFF');
  assert.equal(customAccentColors('#000').light, '#000000');
  assert.notEqual(customAccentColors('#fff').light, '#FFFFFF');
  assert.notEqual(customAccentColors('#000').dark, '#000000');
  assert.equal(customAccentColors('var(--accent)'), null);
});

test('brand colors meet text and foreground contrast in both themes', () => {
  for (const base of ['#FFFFFF', '#000000', '#5A67D8', '#F87716', '#005740', '#23918A', '#777777']) {
    const colors = customAccentColors(base);
    assert.equal(colors.base, base);
    assert.ok(contrast(colors.light, '#FFFFFF') >= 4.5, `${base}: light accent`);
    for (const surface of ['#1D1C1A', '#1D1D1C']) assert.ok(contrast(colors.dark, surface) >= 4.5, `${base}: dark accent`);
    for (const theme of ['light', 'dark']) {
      const root = rootElement();
      applyAccentPreference(root, base, theme === 'dark');
      assert.ok(contrast(colors[theme], root.properties.get('--on-accent')) >= 4.5, `${base}: ${theme} foreground`);
    }
  }
  assert.equal(customAccentColors('#005740').light, '#005740');
  assert.equal(customAccentColors('#FFCC88').dark, '#FFCC88');
});

test('custom accents stay readable on actual surfaces and accent tinted text backgrounds', () => {
  const surfaces = {
    light: ['#FFFFFF', '#FBFAF8', '#F4F3F0', '#F6F5F2', '#EEEDE9', '#F7F6F3'],
    dark: ['#1D1C1A', '#1A1A19', '#151514', '#1D1D1C', '#252524', '#2D2D2B', '#181817'],
  };
  function tint(foreground, background, alpha) {
    return [1, 3, 5].map(
      offset => parseInt(foreground.slice(offset, offset + 2), 16) * alpha + parseInt(background.slice(offset, offset + 2), 16) * (1 - alpha),
    );
  }
  for (const base of ['#F58220', '#FFFFFF', '#000000', '#5A67D8', '#005740', '#23918A', '#777777', '#FF00FF', '#00FFFF', '#FFFF00']) {
    const colors = customAccentColors(base);
    assert.equal(colors.base, base);
    for (const theme of ['light', 'dark']) {
      for (const surface of surfaces[theme]) {
        // Plain text, unread rows, drag targets, soft badges, soft-on-unread, account avatars.
        for (const alpha of [0, 0.035, 0.06, 0.1, 0.1315, 0.17]) {
          assert.ok(contrast(colors[theme], tint(colors[theme], surface, alpha)) >= 4.5, `${base}: ${theme} / ${surface} / ${alpha}`);
        }
      }
    }
  }
});

test('switching to a named palette or reset clears custom overrides', () => {
  const root = rootElement();
  applyAccentPreference(root, '#abc', false);
  assert.equal(root.dataset.accent, '#AABBCC');
  assert.equal(root.properties.size, 3);
  for (const palette of ['indigo', 'blue', 'violet', 'teal', 'rose', 'graphite', 'green', 'amber']) {
    applyAccentPreference(root, '#abc', false);
    applyAccentPreference(root, palette, false);
    assert.equal(root.dataset.accent, palette);
    assert.equal(root.properties.size, 0);
  }
  applyAccentPreference(root, '#abc', true);
  applyAccentPreference(root, undefined, true);
  assert.equal(root.dataset.accent, 'indigo');
  assert.equal(root.properties.size, 0);
  applyAccentPreference(root, '#fff; --acc-l: red', false);
  assert.equal(root.dataset.accent, 'indigo');
  assert.equal(root.properties.size, 0);
});

test('applying each theme leaves the saved base intact and another identity uses its own palette', () => {
  const records = new Map();
  const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
  saveAppearance(storage, 'first-user', { accent: normalizeAccentHex('#f80') });
  const root = rootElement();
  for (const dark of [false, true, false]) {
    const preference = loadAppearance(storage, 'first-user');
    applyAccentPreference(root, preference.accent, dark);
    assert.equal(loadAppearance(storage, 'first-user').accent, '#FF8800');
  }
  applyAccentPreference(root, loadAppearance(storage, 'second-user').accent, false);
  assert.equal(root.dataset.accent, 'indigo');
  assert.equal(root.properties.size, 0);
});
