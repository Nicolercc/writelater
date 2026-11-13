import { describe, expect, it } from "vitest";
import { openWriteLaterDb } from "./db";
import { buildUsageSummary, listEvents, logEvent } from "./usage";
import { saveCapture } from "./captures";
import type { StoredEvent } from "./db";

const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

describe("usage events", () => {
  it("adds an events store when upgrading from v2 and keeps captures", async () => {
    const v2 = await openWriteLaterDb("upgrade-v3", undefined, 2);
    await saveCapture(v2, { opId: "keep", text: "SYNTHETIC kept" });
    v2.close();

    const v3 = await openWriteLaterDb("upgrade-v3");
    await logEvent(v3, "capture_saved");
    expect((await listEvents(v3)).map((e) => e.type)).toEqual(["capture_saved"]);
    expect((await v3.getAll("captures")).map((c) => c.text)).toEqual(["SYNTHETIC kept"]);
    v3.close();
  });

  it("stores only a type and a time", async () => {
    const db = await openWriteLaterDb("test");
    await logEvent(db, "handoff_sorted");
    const [event] = await listEvents(db);
    expect(Object.keys(event).sort()).toEqual(["at", "id", "type"]);
    db.close();
  });
});

describe("buildUsageSummary", () => {
  const events: StoredEvent[] = [
    { id: "1", type: "capture_saved", at: local(2030, 3, 4, 8) },
    { id: "2", type: "capture_saved", at: local(2030, 3, 4, 9) },
    { id: "3", type: "handoff_confirmed_paper", at: local(2030, 3, 4, 21) }, // Mon, week 1
    { id: "4", type: "review_opened", at: local(2030, 3, 6) },
    { id: "5", type: "handoff_confirmed_digital", at: local(2030, 3, 7) }, // Thu, week 1
    { id: "6", type: "handoff_confirmed_paper", at: local(2030, 3, 12) }, // Tue, week 2
  ];

  it("counts active days, review days, and review weeks", () => {
    const summary = buildUsageSummary(events, new Date(2030, 2, 13));
    expect(summary).toMatchObject({
      format: "writelater-usage-summary",
      generatedOn: "2030-03-13",
      firstDay: "2030-03-04",
      lastDay: "2030-03-12",
      activeDays: 4,
      reviewDays: 3,
      reviewWeeks: 2,
      totals: { capture_saved: 2, handoff_confirmed_paper: 2, handoff_confirmed_digital: 1, review_opened: 1 },
    });
    expect(summary.days[0]).toEqual({ day: "2030-03-04", counts: { capture_saved: 2, handoff_confirmed_paper: 1 } });
  });

  it("contains no times of day or event IDs", () => {
    const json = JSON.stringify(buildUsageSummary(events));
    expect(json).not.toMatch(/T\d{2}:\d{2}/);
    expect(json).not.toContain('"id"');
  });

  it("handles no events", () => {
    expect(buildUsageSummary([])).toMatchObject({ firstDay: null, activeDays: 0, reviewWeeks: 0, days: [] });
  });
});
