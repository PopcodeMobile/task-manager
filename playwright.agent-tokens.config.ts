import { defineConfig } from '@playwright/test';
delete process.env.NO_COLOR;
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'organization-agent-tokens.spec.ts',
  outputDir: '/tmp/kairos-agent-tokens-browser',
  workers: 1,
  timeout: 20000,
  use: { baseURL: process.env.KAIROS_TOKEN_TEST_ORIGIN ?? 'http://127.0.0.1:5198', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: process.env.KAIROS_TOKEN_TEST_ORIGIN
    ? undefined
    : {
        command: process.env.GR8R_PREVIEW_DIR
          ? `npm run preview -- --host 127.0.0.1 --port 5198 --strictPort --outDir ${process.env.GR8R_PREVIEW_DIR}`
          : 'npm run dev -- --host 127.0.0.1 --port 5198 --strictPort',
        env: {
          VITE_SUPABASE_URL: 'https://org-token-fixture.example.test',
          VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture',
          VITE_SUPABASE_ANON_KEY: 'sb_publishable_test_fixture',
        },
        url: 'http://127.0.0.1:5198',
        reuseExistingServer: false,
      },
});
