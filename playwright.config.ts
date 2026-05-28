import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:5190",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "CATALYST_PROVIDER_MODE=mock CATALYST_API_PORT=5191 CATALYST_WEB_PORT=5190 npm run dev",
    url: "http://127.0.0.1:5190",
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
