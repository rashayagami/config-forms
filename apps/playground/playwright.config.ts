import { defineConfig } from '@playwright/test';

/**
 * Browser tests against the production build (`pnpm --filter playground build`).
 * They run on the installed Google Chrome (channel "chrome"), so no browser
 * download is needed. Set PLAYWRIGHT_BASE_URL to reuse a running server.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3101',
    channel: 'chrome',
    trace: 'off',
    // PW_SLOWMO=400 with --headed slows each step down enough to watch.
    launchOptions: { slowMo: Number(process.env['PW_SLOWMO'] ?? 0) },
  },
  webServer: process.env['PLAYWRIGHT_BASE_URL']
    ? undefined
    : {
        command: 'npx next start -p 3101',
        port: 3101,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
