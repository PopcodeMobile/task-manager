import { defineConfig } from '@playwright/test';
delete process.env.NO_COLOR;
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'auth-validation.spec.ts',
  outputDir: '/tmp/kairos-auth-validation-results',
  workers: 1,
  timeout: 20000,
  expect: { timeout: 3000 },
  use: { baseURL: 'http://127.0.0.1:5194', viewport: { width: 1280, height: 900 }, trace: 'retain-on-failure' },
  webServer: {
    command: process.env.GR8R_PREVIEW_DIR
      ? `npm run preview -- --host 127.0.0.1 --port 5194 --strictPort --outDir ${process.env.GR8R_PREVIEW_DIR}`
      : 'npm run dev -- --host 127.0.0.1 --port 5194 --strictPort',
    env: { VITE_SUPABASE_URL: 'https://auth-fixture.example.test', VITE_SUPABASE_ANON_KEY: 'public-test-fixture', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
    url: 'http://127.0.0.1:5194',
    reuseExistingServer: false,
  },
});
