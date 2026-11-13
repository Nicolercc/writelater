import { expect, type Page } from "@playwright/test";

// Shared steps for end-to-end tests. Synthetic notes only. Each test gets a
// fresh browser context, so storage starts empty.

export const captureField = (page: Page) => page.getByLabel("Quick capture");
export const saveButton = (page: Page) => page.getByRole("button", { name: "Save", exact: true });
/** The screen's live status message (the always-mounted region that has text). */
export const status = (page: Page) => page.getByRole("status").filter({ hasText: /\S/ }).first();

export async function capture(page: Page, text: string) {
  await captureField(page).fill(text);
  await saveButton(page).click();
  await expect(page.getByText("Saved to Unsorted.")).toBeVisible();
}

/** Opens Review and accepts the default destinations: Weekly Planner (paper) and Obsidian (digital). */
export async function setUpDestinations(page: Page) {
  await page.getByTestId("nav-review").click();
  await page.getByRole("button", { name: "Save destinations" }).click();
  await expect(status(page)).toHaveText(/Destinations added\./);
}

/** From Review home: opens Unsorted and sends the first capture to a destination. */
export async function sortFirstUnsortedTo(page: Page, destination: string) {
  await page.getByRole("button", { name: /^Unsorted/ }).click();
  await page.getByRole("button", { name: destination, exact: true }).first().click();
  await expect(status(page)).toHaveText(new RegExp(`Sent to ${destination}\\.`));
  // The back button; the nav tab is named "Review (N)".
  await page.getByRole("button", { name: "Review", exact: true }).click();
}

/** Record counts read straight from IndexedDB, independent of what the UI shows. */
export async function storedCounts(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("writelater");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = (store: string) =>
      new Promise<number>((resolve, reject) => {
        const request = db.transaction(store).objectStore(store).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const result = {
      captures: await count("captures"),
      destinations: await count("destinations"),
      handoffs: await count("handoffs"),
      events: await count("events"),
    };
    db.close();
    return result;
  });
}
