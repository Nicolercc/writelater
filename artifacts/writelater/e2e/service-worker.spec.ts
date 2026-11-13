import { expect, test } from "@playwright/test";

// Regression: on a first visit, WebKit could deliver the worker's "installed"
// event after it had already claimed the page, and the app showed a false
// "A new version of WriteLater is ready" banner.
test("a first visit never offers an update", async ({ page }) => {
  await page.goto("/");
  const supported = await page.evaluate(() => "serviceWorker" in navigator);
  test.skip(!supported, "No service worker support in this browser context");

  // Wait until the worker has installed, activated, and taken control.
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 15_000 });
  // Give any late lifecycle events time to arrive.
  await page.waitForTimeout(1_000);
  await expect(page.getByText("A new version of WriteLater is ready.")).toHaveCount(0);
});
