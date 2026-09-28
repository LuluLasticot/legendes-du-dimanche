import { defineConfig, devices } from '@playwright/test';

// Locally, reuse `pnpm dev` (Next runs one dev server per app); CI serves the production build.
const PORT = process.env.CI ? 3100 : 3000;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: /engine\.spec/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: /engine\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /lab\.spec/ },
  ],
  webServer: {
    command: process.env.CI ? `pnpm start -p ${PORT}` : 'pnpm dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
