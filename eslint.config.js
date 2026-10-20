import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'playwright.oauth.config.ts', 'tests/browser/oauth-consent.spec.ts'],
  })),
  { files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser } } },
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    files: ['vite.config.js', 'eslint.config.js', 'playwright.config.js', 'tests/**/*.js', 'tests/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
];
