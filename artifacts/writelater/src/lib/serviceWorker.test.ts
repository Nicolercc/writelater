import { describe, expect, it } from "vitest";
import { isUpdateReady, replacedElsewhere } from "./serviceWorker";

describe("replacedElsewhere", () => {
  it("warns a tab that was running an old version when another tab updated", () => {
    expect(replacedElsewhere({ hadControllerAtLoad: true, initiatedHere: false })).toBe(true);
  });

  it("stays quiet on a first install, when the worker takes control for the first time", () => {
    expect(replacedElsewhere({ hadControllerAtLoad: false, initiatedHere: false })).toBe(false);
  });

  it("stays quiet in the tab that accepted the update (it reloads itself)", () => {
    expect(replacedElsewhere({ hadControllerAtLoad: true, initiatedHere: true })).toBe(false);
  });
});

describe("isUpdateReady", () => {
  it("offers an update that installed while an older version controlled the page and is now waiting", () => {
    expect(isUpdateReady({ controlledWhenInstallStarted: true, isWaiting: true })).toBe(true);
  });

  it("never offers an update on a first install, even if the page is claimed before 'installed' arrives", () => {
    // WebKit can deliver 'installed' after the new worker has already claimed the page.
    expect(isUpdateReady({ controlledWhenInstallStarted: false, isWaiting: false })).toBe(false);
    expect(isUpdateReady({ controlledWhenInstallStarted: false, isWaiting: true })).toBe(false);
  });

  it("doesn't offer a worker that is no longer waiting (it already activated)", () => {
    expect(isUpdateReady({ controlledWhenInstallStarted: true, isWaiting: false })).toBe(false);
  });
});
