import { defineConfig } from '@playwright/test';
delete process.env.NO_COLOR;
export default defineConfig({
  testDir: './tests/browser',
  testMatch: ['agent-panel.spec.ts', 'cloud.spec.js', 'cutover.spec.ts'],
  outputDir: '/tmp/gr8r-playwright-agent',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5181', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: {
    command: process.env.GR8R_PREVIEW_DIR
      ? `npm run preview -- --host 127.0.0.1 --port 5181 --strictPort --outDir ${process.env.GR8R_PREVIEW_DIR}`
      : 'npm run dev -- --host 127.0.0.1 --port 5181 --strictPort',
    url: 'http://127.0.0.1:5181/',
    reuseExistingServer: false,
  },
});
