import { defineConfig, devices } from "@playwright/test";

const databaseUrl =
  process.env.E2E_DATABASE_URL ?? "mysql://root:root@127.0.0.1:3306/e2e_ci";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "node dist/index.js",
    url: "http://127.0.0.1:4173/health/ready",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NODE_ENV: "development",
      DEPLOYMENT_ENV: "local",
      AUTH_MODE: "disabled",
      DEV_AUTH_OPEN_ID: "e2e-owner",
      DEV_SERVE_STATIC: "true",
      DATABASE_URL: databaseUrl,
      PORT: "4173",
    },
  },
});
