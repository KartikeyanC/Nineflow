// End-to-end tests (e2e/), run against the web app in the Chrome already installed on this PC,
// so no browser download is needed:  npm run test:e2e
import { defineConfig, devices } from '@playwright/test'

const PORT = 5190

export default defineConfig({
  testDir: './e2e',
  outputDir: './node_modules/.cache/e2e-results',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    // A phone-sized, touch screen, like the Android app.
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  // A production build, like the shipped app. (The dev server reloads the page while it prepares
  // files on first use, which threw tests back to the sign-in screen.)
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
