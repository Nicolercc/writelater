import { expect, test, type Page } from "@playwright/test";

// Synthetic notes only. Each test gets a fresh browser context, so storage
// starts empty.

const captureField = (page: Page) => page.getByLabel("Quick capture");
const saveButton = (page: Page) => page.getByRole("button", { name: "Save", exact: true });
const status = (page: Page) => page.getByRole("status").filter({ hasText: /\S/ }).first();

async function capture(page: Page, text: string) {
  await captureField(page).fill(text);
  await saveButton(page).click();
  await expect(page.getByText("Saved to Unsorted.")).toBeVisible();
}

test("a capture survives reload and completes a paper handoff", async ({ page }) => {
  await page.goto("/");
  await capture(page, "E2E synthetic: email mentor Friday");

  await page.reload();
  await page.getByTestId("nav-review").click();
  await page.getByRole("button", { name: "Save destinations" }).click();

  await page.getByRole("button", { name: /^Unsorted/ }).click();
  await page.getByRole("button", { name: "Weekly Planner", exact: true }).click();
  await expect(status(page)).toHaveText(/Sent to Weekly Planner\./);

  // The back button; the nav tab is named "Review (N)".
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: /Weekly Planner · This Week/ }).click();
  await page.getByRole("button", { name: "Written in Weekly Planner" }).click();
  await expect(status(page)).toHaveText(/Marked written\./);

  // Reload: the app reopens in the same queue, with the item done today.
  await page.reload();
  await page.getByTestId("nav-review").click();
  await expect(page.getByRole("heading", { name: "Weekly Planner" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bring back: E2E synthetic: email mentor Friday" })).toBeVisible();
});

test("an unsaved draft survives a reload", async ({ page }) => {
  await page.goto("/");
  await captureField(page).fill("E2E synthetic: half-written thought");
  await page.reload();
  await expect(captureField(page)).toHaveValue("E2E synthetic: half-written thought");
});

test("a double tap on Save stores one capture", async ({ page }) => {
  await page.goto("/");
  await captureField(page).fill("E2E synthetic: tapped twice");
  await saveButton(page).dblclick();
  await expect(page.getByText("Saved to Unsorted.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /1 waiting/ })).toBeVisible();
});
