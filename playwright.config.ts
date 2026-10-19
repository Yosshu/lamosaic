import { defineConfig, devices } from '@playwright/test';

// Use a preinstalled Chromium when CHROMIUM_PATH is set (e.g. sandboxed dev environments).
const executablePath = process.env.CHROMIUM_PATH;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions } },
    // iPhone / iPad viewports and touch, rendered with Chromium (WebKit is not installed in CI).
    {
      name: 'iphone',
      use: { ...devices['iPhone 15'], browserName: 'chromium', launchOptions },
    },
    {
      name: 'ipad',
      use: { ...devices['iPad (gen 11)'], browserName: 'chromium', launchOptions },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
