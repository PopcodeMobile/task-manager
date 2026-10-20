import { defineConfig } from '@playwright/test';
// Playwright sets FORCE_COLOR for child processes; do not inherit a conflicting NO_COLOR.
delete process.env.NO_COLOR;
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'oauth-consent.spec.ts',
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:5180', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5180 --strictPort', url: 'http://127.0.0.1:5180/react.html', reuseExistingServer: true },
});
