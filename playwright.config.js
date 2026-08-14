// Minimal Playwright config for CI
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.js',
  testIgnore: ['**/unit/**'],
  timeout: 30_000,
  expect: { timeout: 5000 },
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 5000,
    ignoreHTTPSErrors: true
  },
  webServer: {
    command: 'npx http-server -p 3000 -c-1',
    port: 3000,
    reuseExistingServer: !process.env.CI
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } }
  ]
});
