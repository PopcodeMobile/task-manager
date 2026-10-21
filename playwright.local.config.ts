import { defineConfig } from '@playwright/test';
delete process.env.NO_COLOR;
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'local-panel.spec.ts',
  outputDir: '/tmp/gr8r-playwright-local',
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5180', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: {
    command:
      'VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= VITE_SUPABASE_PUBLISHABLE_KEY= npm run dev -- --config vite.playwright.config.js --host 127.0.0.1 --port 5180 --strictPort',
    url: 'http://127.0.0.1:5180/',
    reuseExistingServer: false,
  },
});
