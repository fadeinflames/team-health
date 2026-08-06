import { defineConfig, devices } from "@playwright/test";

// Тесты делят одно состояние сервера (общая база, seed, /api/reset),
// поэтому параллелизм выключен намеренно.
export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["line"]],
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
