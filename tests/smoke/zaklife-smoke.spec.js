const { test, expect } = require("@playwright/test");

const ignoredConsoleFragments = [
  "favicon.ico",
  "faviconV2",
  "Failed to load resource: the server responded with a status of 404",
  "ERR_BLOCKED_BY_CLIENT",
];

test("core ZakLife routes render without app console errors", async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (ignoredConsoleFragments.some((fragment) => text.includes(fragment))) return;
    consoleErrors.push(text);
  });

  const routes = [
    ["dashboard", "Dashboard"],
    ["content", "Content Manager"],
    ["pos", "Monstea POS"],
    ["tasks", "Tasks"],
    ["journal", "Journal & Habits"],
    ["quickdock", "Quick Dock"],
  ];

  for (const [route, title] of routes) {
    await page.goto(`/#${route}`);
    await expect(page.locator("#pageTitle")).toContainText(title, { timeout: 15_000 });
    await expect(page.locator(`#view-${route}`)).toBeVisible();
  }

  await page.goto("/#dashboard");
  await expect(page.locator("body")).toContainText("Automation Monitoring", { timeout: 15_000 });
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
