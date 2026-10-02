import { defineConfig, devices } from '@playwright/test';

// Locally, reuse `pnpm dev` (Next runs one dev server per app); CI serves the production build.
const PORT = process.env.CI ? 3100 : 3000;
/** CI runners have no GPU: allow Chrome's software WebGL. */
const GL = process.env.CI ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [];

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 60_000,
  // A hung browser (software WebGL on CI runners) must fail the job, not stall it.
  globalTimeout: 10 * 60_000,
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: GL } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: /engine\.spec/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: /engine\.spec/ },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], launchOptions: { args: GL } },
      testMatch: /(lab|public)\.spec/,
    },
  ],
  webServer: {
    // The Next binary directly: a pnpm wrapper does not pass the stop signal on (hung teardown).
    command: process.env.CI ? `./node_modules/.bin/next start -p ${PORT}` : 'pnpm dev',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
