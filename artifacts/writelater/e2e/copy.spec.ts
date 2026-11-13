import { expect, test } from "@playwright/test";
import { capture, setUpDestinations, sortFirstUnsortedTo, status, storedCounts } from "./helpers";

const NOTE = "E2E synthetic: why do I avoid sharing unfinished work?";

async function openObsidianQueue(page: import("@playwright/test").Page) {
  await page.goto("/");
  await capture(page, NOTE);
  await setUpDestinations(page);
  await sortFirstUnsortedTo(page, "Obsidian");
  await page.getByRole("button", { name: /^Obsidian/ }).click();
}

test.describe("Copy Markdown", () => {
  // Reading the clipboard back needs a permission only Chromium grants in Playwright.
  test("copies the text, survives a reload, and only Added completes it", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "Clipboard read permission is Chromium-only in Playwright");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openObsidianQueue(page);

    await page.getByRole("button", { name: "Copy Markdown" }).click();
    await expect(status(page)).toHaveText(/Copied\. Paste it into Obsidian, then confirm\./);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${NOTE}\n`);
    await expect(page.getByRole("button", { name: "Added to Obsidian" })).toBeFocused();

    // Copying alone doesn't complete the handoff, and it survives an interruption.
    await page.reload();
    await page.getByTestId("nav-review").click();
    await expect(page.getByText("Copied. Paste it into Obsidian, then confirm.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy Markdown" })).toHaveCount(0);

    await page.getByRole("button", { name: "Added to Obsidian" }).click();
    await expect(status(page)).toHaveText(/Marked added\./);
    await expect(page.getByRole("button", { name: `Bring back: ${NOTE}` })).toBeVisible();
  });

  test("when the clipboard is blocked, shows the text selected and never claims a copy", async ({ page }) => {
    // Simulate a browser that refuses clipboard access.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.reject(new DOMException("blocked", "NotAllowedError")) },
      });
    });
    await openObsidianQueue(page);

    await page.getByRole("button", { name: "Copy Markdown" }).click();
    await expect(page.getByRole("alert")).toHaveText(/Copy didn't work\. The text is selected/);
    const fallback = page.getByLabel("Text to copy");
    await expect(fallback).toBeFocused();
    await expect(fallback).toHaveValue(`${NOTE}\n`);
    expect(
      await fallback.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd, el.value.length]),
    ).toEqual([0, NOTE.length + 1, NOTE.length + 1]);
    await expect(page.getByText(/^Copied\./)).toHaveCount(0);
    expect(await storedCounts(page)).toMatchObject({ handoffs: 1 });

    // Manual copy, then confirm.
    await page.getByRole("button", { name: "Added to Obsidian" }).click();
    await expect(status(page)).toHaveText(/Marked added\./);
  });
});
