import { expect, test } from "@playwright/test";

// Playwright exposes service workers only in Chromium, so the offline test
// runs there. The service worker itself is standard and has no
// browser-specific code.
test.skip(({ browserName }) => browserName !== "chromium", "Service worker control is Chromium-only in Playwright");

test("opens, saves, and reloads with no network after the first visit", async ({ page, context }) => {
  await page.goto("/");
  // Wait until the worker has installed and controls the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "What do you need to write later?" })).toBeVisible();
  await expect(page.getByText("You're offline. Everything still saves on this device.")).toBeVisible();

  await page.getByLabel("Quick capture").fill("E2E synthetic: written on the subway");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved to Unsorted.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /1 waiting/ })).toBeVisible();
});
