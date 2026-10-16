import test from 'node:test';
import assert from 'node:assert/strict';

const moduleUrl = new URL('../src/core/i18n.js', import.meta.url);

test('i18n exists and defaults to Brazilian Portuguese', async () => {
  const i18n = await import(moduleUrl).catch(() => null);
  assert.ok(i18n, 'the i18n module must exist');
  assert.equal(i18n.getLocale(), 'pt-BR');
});

test('locale normalization migrates English preferences and rejects unsupported locales', async () => {
  const { normalizeLocale } = await import(moduleUrl);
  assert.equal(normalizeLocale('English (US)'), 'en');
  assert.equal(normalizeLocale('English (UK)'), 'en');
  assert.equal(normalizeLocale('en-GB'), 'en');
  assert.equal(normalizeLocale('pt'), 'pt-BR');
  assert.equal(normalizeLocale('es'), 'pt-BR');
});

test('switching language updates labels and preserves interpolated content', async () => {
  const { setLocale, t } = await import(moduleUrl);
  setLocale('pt-BR');
  assert.equal(t('Home'), 'Início');
  assert.equal(t('Created {name}', { name: 'Home <draft>' }), 'Criado: Home <draft>');
  setLocale('en');
  assert.equal(t('Home'), 'Home');
  assert.equal(t('Created {name}', { name: 'Início' }), 'Created Início');
  assert.equal(t('Unknown user text'), 'Unknown user text');
  setLocale('pt-BR');
});

test('counts select grammatical forms in both locales', async () => {
  const { setLocale, t } = await import(moduleUrl);
  setLocale('pt-BR');
  assert.equal(t('{count} tasks', { count: 1 }), '1 tarefa');
  assert.equal(t('{count} tasks', { count: 2 }), '2 tarefas');
  setLocale('en');
  assert.equal(t('{count} tasks', { count: 1 }), '1 task');
  assert.equal(t('{count} tasks', { count: 2 }), '2 tasks');
  setLocale('pt-BR');
});

test('dates, relative time and numeric values follow the active locale', async () => {
  const { setLocale, formatDate, formatNumber, formatRelative } = await import(moduleUrl);
  setLocale('pt-BR');
  assert.equal(formatDate('2026-10-16', { day: '2-digit', month: '2-digit', year: 'numeric' }), '16/10/2026');
  assert.equal(formatNumber(1234.5), '1.234,5');
  assert.equal(formatRelative(-1, 'day'), 'ontem');
  setLocale('en');
  assert.equal(formatDate('2026-10-16', { day: '2-digit', month: '2-digit', year: 'numeric' }), '10/16/2026');
  assert.equal(formatNumber(1234.5), '1,234.5');
  assert.equal(formatRelative(-1, 'day'), 'yesterday');
  setLocale('pt-BR');
});
