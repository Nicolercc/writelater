import { describe, expect, it } from "vitest";
import { replacedElsewhere } from "./serviceWorker";

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
