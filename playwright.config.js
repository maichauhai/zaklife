const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/smoke",
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:4182",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx --yes http-server . -p 4182 -s",
    url: "http://127.0.0.1:4182",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
