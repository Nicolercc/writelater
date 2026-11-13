import { describe, expect, it } from "vitest";
import { openWriteLaterDb, SCHEMA_VERSION, type WriteLaterDb } from "./db";
import { listCaptures, saveCapture } from "./captures";
import {
  assignCapture,
  createDestinations,
  deferHandoff,
  loadSnapshot,
  moveHandoff,
  reactivateHandoff,
  unsortHandoff,
  resolveHandoff,
  undoHandoffWrite,
  type HandoffWrite,
  type WriteResult,
} from "./handoffs";
import { buildReview, localDate } from "../lib/review";

function ok<T>(result: WriteResult<T>): T {
  if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
  return result.value;
}

async function setup(): Promise<WriteLaterDb> {
  const db = await openWriteLaterDb("test");
  await createDestinations(db, [
    { id: "planner", name: "Weekly Planner", kind: "paper", section: "This Week" },
    { id: "vault", name: "Obsidian", kind: "digital" },
  ]);
  await saveCapture(db, { opId: "c1", text: "SYNTHETIC one" }, () => new Date(Date.now() - 2000));
  await saveCapture(db, { opId: "c2", text: "SYNTHETIC two" }, () => new Date(Date.now() - 1000));
  return db;
}

async function assign(db: WriteLaterDb, captureId: string, destinationId: string | null) {
  return ok(await assignCapture(db, { opId: `assign-${captureId}`, captureId, destinationId }));
}

describe("schema upgrade", () => {
  it("keeps v1 captures when opening the current version", async () => {
    const v1 = await openWriteLaterDb("upgrade", undefined, 1);
    await saveCapture(v1, { opId: "old", text: "SYNTHETIC from v1" });
    v1.close();

    const v2 = await openWriteLaterDb("upgrade");
    expect(v2.version).toBe(SCHEMA_VERSION);
    expect((await listCaptures(v2)).map((c) => c.text)).toEqual(["SYNTHETIC from v1"]);
    const snapshot = await loadSnapshot(v2);
    expect(snapshot.destinations).toEqual([]);
    expect(snapshot.handoffs).toEqual([]);
    v2.close();
  });

  it("tells an older open tab to step aside when a newer version opens", async () => {
    const events: string[] = [];
    const old = await openWriteLaterDb("tabs", (e) => events.push(e), 1);
    const newer = await openWriteLaterDb("tabs");
    expect(events).toEqual(["versionchange"]);
    expect(newer.version).toBe(SCHEMA_VERSION);
    old.close();
    newer.close();
  });
});

describe("destinations", () => {
  it("creates destinations once per ID and trims names", async () => {
    const db = await openWriteLaterDb("test");
    await createDestinations(db, [{ id: "p", name: "  Planner ", kind: "paper", section: " " }]);
    await createDestinations(db, [{ id: "p", name: "Renamed", kind: "paper" }]);
    const { destinations } = await loadSnapshot(db);
    expect(destinations).toHaveLength(1);
    expect(destinations[0]).toMatchObject({ name: "Planner", rev: 1 });
    expect(destinations[0].section).toBeUndefined();
    db.close();
  });

  it("rejects a blank name without writing", async () => {
    const db = await openWriteLaterDb("test");
    await expect(createDestinations(db, [{ id: "x", name: " ", kind: "paper" }])).rejects.toThrow();
    expect((await loadSnapshot(db)).destinations).toEqual([]);
    db.close();
  });
});

describe("assignCapture", () => {
  it("moves a capture from Unsorted to a destination queue", async () => {
    const db = await setup();
    const today = localDate();
    expect(buildReview(await loadSnapshot(db), today).unsorted).toHaveLength(2);

    await assign(db, "c1", "planner");
    const review = buildReview(await loadSnapshot(db), today);
    expect(review.unsorted.map((c) => c.id)).toEqual(["c2"]);
    expect(review.queues[0].pending.map((i) => i.capture.text)).toEqual(["SYNTHETIC one"]);
    expect(review.waitingCount).toBe(2);
    db.close();
  });

  it("is idempotent for the same operation ID", async () => {
    const db = await setup();
    const input = { opId: "same-op", captureId: "c1", destinationId: "planner" };
    const [a, b] = await Promise.all([assignCapture(db, input), assignCapture(db, input)]);
    expect(a.status).toBe("ok");
    expect(b.status).toBe("ok");
    expect((await loadSnapshot(db)).handoffs).toHaveLength(1);
    db.close();
  });

  it("refuses to sort a capture that another tab already sorted", async () => {
    const db = await setup();
    await assignCapture(db, { opId: "tab-a", captureId: "c1", destinationId: "planner" });
    const tabB = await assignCapture(db, { opId: "tab-b", captureId: "c1", destinationId: "vault" });
    expect(tabB.status).toBe("stale");
    const { handoffs } = await loadSnapshot(db);
    expect(handoffs.map((h) => h.destinationId)).toEqual(["planner"]);
    db.close();
  });

  it("reports missing captures and destinations", async () => {
    const db = await setup();
    expect((await assignCapture(db, { opId: "x", captureId: "nope", destinationId: "planner" })).status).toBe("missing");
    expect((await assignCapture(db, { opId: "y", captureId: "c1", destinationId: "nope" })).status).toBe("missing");
    db.close();
  });

  it("lets a capture go from Unsorted, and undo brings it back", async () => {
    const db = await setup();
    const write = await assign(db, "c1", null);
    expect(write.handoff).toMatchObject({ state: "discarded", destinationId: null });
    let review = buildReview(await loadSnapshot(db), localDate());
    expect(review.unsorted.map((c) => c.id)).toEqual(["c2"]);
    expect(review.unsortedDoneToday).toHaveLength(1);

    ok(await undoHandoffWrite(db, write.undo));
    review = buildReview(await loadSnapshot(db), localDate());
    expect(review.unsorted.map((c) => c.id)).toEqual(["c1", "c2"]);
    db.close();
  });
});

describe("resolve, defer, move, and undo", () => {
  async function pending(db: WriteLaterDb): Promise<HandoffWrite> {
    return assign(db, "c1", "planner");
  }

  it("marks Written and undo restores the pending item", async () => {
    const db = await setup();
    const { handoff } = await pending(db);
    const written = ok(await resolveHandoff(db, handoff.id, handoff.rev, "written"));
    expect(written.handoff).toMatchObject({ state: "completed", resolvedVia: "written", rev: 2 });

    let queue = buildReview(await loadSnapshot(db), localDate()).queues[0];
    expect(queue.pending).toHaveLength(0);
    expect(queue.doneToday).toHaveLength(1);

    ok(await undoHandoffWrite(db, written.undo));
    queue = buildReview(await loadSnapshot(db), localDate()).queues[0];
    expect(queue.pending).toHaveLength(1);
    expect(queue.pending[0].handoff.resolvedAt).toBeUndefined();
    expect(queue.pending[0].handoff.rev).toBe(3);
    db.close();
  });

  it("refuses a write based on a stale revision", async () => {
    const db = await setup();
    const { handoff } = await pending(db);
    ok(await resolveHandoff(db, handoff.id, handoff.rev, "written"));
    const staleTab = await deferHandoff(db, handoff.id, handoff.rev, "2030-01-01");
    expect(staleTab.status).toBe("stale");
    expect((await loadSnapshot(db)).handoffs[0].state).toBe("completed");
    db.close();
  });

  it("never lets undo reverse a newer change", async () => {
    const db = await setup();
    const { handoff } = await pending(db);
    const written = ok(await resolveHandoff(db, handoff.id, handoff.rev, "written"));
    // Another tab changes it after the Written.
    ok(await reactivateHandoff(db, handoff.id, written.handoff.rev));
    expect((await undoHandoffWrite(db, written.undo)).status).toBe("stale");
    expect((await loadSnapshot(db)).handoffs[0]).toMatchObject({ state: "pending", rev: 3 });
    db.close();
  });

  it("hides a deferred item until its local date, then returns it to the queue", async () => {
    const db = await setup();
    const { handoff } = await pending(db);
    ok(await deferHandoff(db, handoff.id, handoff.rev, "2030-03-10"));

    const before = buildReview(await loadSnapshot(db), "2030-03-09");
    expect(before.queues[0].pending).toHaveLength(0);
    expect(before.deferred).toHaveLength(1);
    expect(before.waitingCount).toBe(1); // only c2 in Unsorted

    const on = buildReview(await loadSnapshot(db), "2030-03-10");
    expect(on.queues[0].pending).toHaveLength(1);
    expect(on.deferred).toHaveLength(0);
    db.close();
  });

  it("rejects a malformed defer date", async () => {
    const db = await setup();
    const { handoff } = await pending(db);
    await expect(deferHandoff(db, handoff.id, handoff.rev, "next week")).rejects.toThrow();
    db.close();
  });

  it("moves a handoff to another destination and keeps it pending", async () => {
    const db = await setup();
    const { handoff } = await pending(db);
    const moved = ok(await moveHandoff(db, handoff.id, handoff.rev, "vault"));
    expect(moved.handoff).toMatchObject({ destinationId: "vault", state: "pending" });
    const review = buildReview(await loadSnapshot(db), localDate());
    expect(review.queues.map((q) => q.pending.length)).toEqual([0, 1]);
    db.close();
  });

  it("completing one item leaves the others in the queue", async () => {
    const db = await setup();
    const first = await assign(db, "c1", "planner");
    await assign(db, "c2", "planner");
    ok(await resolveHandoff(db, first.handoff.id, first.handoff.rev, "written"));
    const queue = buildReview(await loadSnapshot(db), localDate()).queues[0];
    expect(queue.pending.map((i) => i.capture.text)).toEqual(["SYNTHETIC two"]);
    db.close();
  });

  it("sends a pending item back to Unsorted, and undo restores it", async () => {
    const db = await setup();
    const { handoff } = await pending(db);
    const unsorted = ok(await unsortHandoff(db, handoff.id, handoff.rev));
    let review = buildReview(await loadSnapshot(db), localDate());
    expect(review.unsorted.map((c) => c.id)).toEqual(["c1", "c2"]);

    ok(await undoHandoffWrite(db, unsorted.undo));
    review = buildReview(await loadSnapshot(db), localDate());
    expect(review.unsorted.map((c) => c.id)).toEqual(["c2"]);
    expect(review.queues[0].pending).toHaveLength(1);
    db.close();
  });

  it("won't undo an unsort after the capture was sorted again", async () => {
    const db = await setup();
    const { handoff } = await pending(db);
    const unsorted = ok(await unsortHandoff(db, handoff.id, handoff.rev));
    ok(await assignCapture(db, { opId: "resort", captureId: "c1", destinationId: "vault" }));
    expect((await undoHandoffWrite(db, unsorted.undo)).status).toBe("stale");
    const { handoffs } = await loadSnapshot(db);
    expect(handoffs.map((h) => h.destinationId)).toEqual(["vault"]);
    db.close();
  });
});
