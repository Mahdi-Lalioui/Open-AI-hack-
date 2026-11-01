/**
 * End-to-end tests. One in-memory server session is shared by every test, so tests run
 * serially (workers: 1) and each test resets the session through the REST API first.
 * The server runs in example mode (OPENAI_API_KEY is explicitly empty) on port 4599.
 */
import { defineConfig } from '@playwright/test';

const PORT = 4599;
export const E2E_BASE_URL = `http://127.0.0.1:${PORT}`;

// Headless chromium needs a software GL backend for the R3F canvas.
const webglArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: E2E_BASE_URL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: webglArgs },
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1365, height: 768 } },
    },
    {
      name: 'mobile',
      // The two-browser host/guest flow manages its own viewports; run it once (desktop project).
      testIgnore: /host-guest\.spec\.ts/,
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    command: 'npx tsx server/index.ts',
    url: `${E2E_BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      OPENAI_API_KEY: '',
      PUBLIC_BASE_URL: '',
      NODE_ENV: 'development',
    },
  },
});
