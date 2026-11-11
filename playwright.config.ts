import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5174',
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--no-sandbox'],
    },
  },
  webServer: [
    {
      command: 'npm run dev -- --port 5174',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run preview -- --port 4174',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
