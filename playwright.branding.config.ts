import { defineConfig } from '@playwright/test';
delete process.env.NO_COLOR;
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'branding.spec.ts',
  outputDir: '/tmp/kairos-branding-results',
  workers: 1,
  timeout: 30000,
  use: { baseURL: process.env.GR8R_BRANDING_PUBLIC_URL ?? 'http://127.0.0.1:5196', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: process.env.GR8R_BRANDING_PUBLIC_URL
    ? undefined
    : {
        command: process.env.GR8R_PREVIEW_DIR
          ? `npm run preview -- --host 127.0.0.1 --port 5196 --strictPort --outDir ${process.env.GR8R_PREVIEW_DIR}`
          : 'npm run dev -- --host 127.0.0.1 --port 5196 --strictPort',
        env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
        url: 'http://127.0.0.1:5196',
        reuseExistingServer: false,
      },
});
