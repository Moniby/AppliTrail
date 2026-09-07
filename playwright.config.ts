import { defineConfig } from "@playwright/test";

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL,
    actionTimeout: 15_000,
    locale: "en-CA",
    timezoneId: "America/Toronto",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: {
      "oai-authenticated-user-id": "e2e-owner",
      "oai-authenticated-user-email": "journey.owner@applitrail.test",
      "oai-authenticated-user-full-name": "Journey Owner",
    },
  },
  webServer: {
    command: "npm run start:e2e",
    url: `${baseURL}/api/ready`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
