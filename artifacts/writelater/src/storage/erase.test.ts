import { describe, expect, it } from "vitest";
import { openWriteLaterDb } from "./db";
import { deleteCapture, eraseAll, saveCapture } from "./captures";
import { assignCapture, createDestinations, loadSnapshot } from "./handoffs";
import { listEvents, logEvent } from "./usage";
import { clearLocalState, storeDraft } from "./draft";

async function setup() {
  const db = await openWriteLaterDb("test");
  await createDestinations(db, [{ id: "p", name: "Planner", kind: "paper" }]);
  await saveCapture(db, { opId: "keep", text: "SYNTHETIC keep" });
  await saveCapture(db, { opId: "gone", text: "SYNTHETIC gone" });
  await assignCapture(db, { opId: "h-keep", captureId: "keep", destinationId: "p" });
  await assignCapture(db, { opId: "h-gone", captureId: "gone", destinationId: "p" });
  await logEvent(db, "capture_saved");
  return db;
}

describe("deleteCapture", () => {
  it("removes the capture and its handoffs together, leaving others", async () => {
    const db = await setup();
    expect(await deleteCapture(db, "gone")).toBe(true);
    const snapshot = await loadSnapshot(db);
    expect(snapshot.captures.map((c) => c.id)).toEqual(["keep"]);
    expect(snapshot.handoffs.map((h) => h.id)).toEqual(["h-keep"]);
    db.close();
  });

  it("reports a missing capture without changing anything", async () => {
    const db = await setup();
    expect(await deleteCapture(db, "nope")).toBe(false);
    expect((await loadSnapshot(db)).handoffs).toHaveLength(2);
    db.close();
  });
});

describe("eraseAll", () => {
  it("clears captures, destinations, handoffs, and usage events", async () => {
    const db = await setup();
    await eraseAll(db);
    expect(await loadSnapshot(db)).toEqual({ captures: [], destinations: [], handoffs: [] });
    expect(await listEvents(db)).toEqual([]);
    db.close();
  });
});

describe("clearLocalState", () => {
  it("removes only this database's WriteLater keys", () => {
    storeDraft("writelater", { opId: "a", text: "SYNTHETIC draft" });
    localStorage.setItem("writelater:review-view:writelater", "{}");
    localStorage.setItem("writelater:setup-skipped:writelater", "1");
    storeDraft("writelater-demo", { opId: "b", text: "SYNTHETIC demo draft" });
    localStorage.setItem("unrelated", "x");

    clearLocalState("writelater");

    expect(Object.keys(localStorage).sort()).toEqual(["unrelated", "writelater:draft:writelater-demo"]);
  });
});
