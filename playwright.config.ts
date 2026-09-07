import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:5290",
    trace: "retain-on-failure"
  },
  webServer: {
    command:
      "rm -rf apps/api/.data/e2e && PORT= OPENROUTER_API_KEY= CATALYST_PROVIDER_MODE=mock CATALYST_STORE_DRIVER=file CATALYST_ASSET_STORAGE_DRIVER=none CATALYST_DATA_DIR=.data/e2e CATALYST_API_PORT=5291 CATALYST_WEB_PORT=5290 npm run dev",
    url: "http://127.0.0.1:5290/api/health",
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      }
    }
  ]
});
