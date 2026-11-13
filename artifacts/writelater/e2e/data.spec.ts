import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { capture, setUpDestinations, sortFirstUnsortedTo, status, storedCounts } from "./helpers";

test("backup, erase everything, then restore brings the work back", async ({ page }) => {
  await page.goto("/");
  await capture(page, "E2E synthetic: keep this safe");
  await setUpDestinations(page);
  await sortFirstUnsortedTo(page, "Weekly Planner");
  expect(await storedCounts(page)).toMatchObject({ captures: 1, destinations: 2, handoffs: 1 });

  // A real download of the backup file.
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Download backup/ }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^writelater-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backupPath = await download.path();
  const backup = JSON.parse(await readFile(backupPath, "utf8"));
  expect(backup).toMatchObject({ format: "writelater-backup" });
  expect(backup.captures[0].text).toBe("E2E synthetic: keep this safe");

  // Erase everything, behind its confirmation.
  await page.getByRole("button", { name: "Erase everything on this device…" }).click();
  await expect(page.getByRole("heading", { name: "Erase everything?" })).toBeFocused();
  await page.getByRole("button", { name: "Erase everything", exact: true }).click();
  await expect(status(page)).toHaveText(/Everything was erased/);
  await expect(page.getByRole("button", { name: "Save destinations" })).toBeVisible();
  expect(await storedCounts(page)).toEqual({ captures: 0, destinations: 0, handoffs: 0, events: 0 });

  // Erasing survives a reload: nothing comes back on its own.
  await page.reload();
  await expect(page.getByRole("button", { name: /0 waiting/ })).toBeVisible();

  // Restore the downloaded file through the real file input.
  await page.getByTestId("nav-review").click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.locator("#restore-file").setInputFiles(backupPath);
  await expect(page.getByRole("heading", { name: "Restore preview" })).toBeFocused();
  await expect(page.getByText("Will add 1 capture, 2 destinations, and 1 status.")).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(status(page)).toHaveText(/Restored 4 records\./);

  // The restored item is back in its queue after a reload.
  await page.reload();
  await page.getByTestId("nav-review").click();
  await page.getByRole("button", { name: /Weekly Planner · This Week/ }).click();
  await expect(page.getByText("E2E synthetic: keep this safe")).toBeVisible();
  await expect(page.getByRole("button", { name: "Written in Weekly Planner" })).toBeVisible();
});

test("an invalid backup is refused and changes nothing", async ({ page }) => {
  await page.goto("/");
  await capture(page, "E2E synthetic: untouched");
  await page.getByTestId("nav-review").click();
  await page.getByRole("button", { name: "Skip for now" }).click();

  await page.locator("#restore-file").setInputFiles({
    name: "not-a-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hello":"world"}'),
  });
  await expect(page.getByRole("heading", { name: "Can't restore this file" })).toBeFocused();
  await expect(page.getByRole("alert")).toHaveText(/isn't a WriteLater backup\. Nothing was changed\./);
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toHaveCount(0);
  expect(await storedCounts(page)).toMatchObject({ captures: 1 });
});

test("deleting one capture asks first and removes only that one", async ({ page }) => {
  await page.goto("/");
  await capture(page, "E2E synthetic: delete me");
  await capture(page, "E2E synthetic: keep me");
  await page.getByTestId("nav-review").click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: /^Unsorted/ }).click();

  const card = page.getByRole("listitem").filter({ hasText: "E2E synthetic: delete me" });
  await card.getByRole("button", { name: "Delete…" }).click();
  await expect(card.getByRole("button", { name: "Delete permanently" })).toBeFocused();
  await card.getByRole("button", { name: "Delete permanently" }).click();
  await expect(status(page)).toHaveText(/Deleted permanently\./);

  // After a reload, Review reopens the queue that was open: Unsorted.
  await page.reload();
  await page.getByTestId("nav-review").click();
  await expect(page.getByRole("heading", { name: "Unsorted · 1" })).toBeVisible();
  await expect(page.getByText("E2E synthetic: keep me")).toBeVisible();
  await expect(page.getByText("E2E synthetic: delete me")).toHaveCount(0);
  expect(await storedCounts(page)).toMatchObject({ captures: 1 });
});
