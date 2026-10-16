import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    files: ['vite.config.js', 'eslint.config.js', 'playwright.config.js', 'tests/**/*.js', 'tests/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
];
