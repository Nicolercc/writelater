import { describe, expect, it } from "vitest";
import { openWriteLaterDb, type WriteLaterDb } from "./db";
import { saveCapture } from "./captures";
import {
  archiveDestination,
  assignCapture,
  createDestinations,
  deferHandoff,
  loadSnapshot,
  markHandoffCopied,
  renameDestination,
  resolveHandoff,
  restoreDestination,
  type WriteResult,
} from "./handoffs";
import { buildReview, localDate } from "../lib/review";

function ok<T>(result: WriteResult<T>): T {
  if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
  return result.value;
}

/** planner: pending p1, deferred p2, completed p3. vault: pending v1. */
async function setup(): Promise<WriteLaterDb> {
  const db = await openWriteLaterDb("test");
  await createDestinations(db, [
    { id: "planner", name: "Weekly Planner", kind: "paper", section: "This Week" },
    { id: "vault", name: "Obsidian", kind: "digital" },
  ]);
  let t = Date.now() - 100_000;
  for (const [id, dest] of [["p1", "planner"], ["p2", "planner"], ["p3", "planner"], ["v1", "vault"]]) {
    await saveCapture(db, { opId: id, text: `SYNTHETIC ${id}` }, () => new Date((t += 1000)));
    await assignCapture(db, { opId: `h-${id}`, captureId: id, destinationId: dest });
  }
  await deferHandoff(db, "h-p2", 1, "2030-01-01");
  await resolveHandoff(db, "h-p3", 1, "written");
  return db;
}

async function handoffOf(db: WriteLaterDb, id: string) {
  return (await loadSnapshot(db)).handoffs.find((h) => h.id === id);
}

describe("renameDestination", () => {
  it("renames, trims, clears an emptied section, and keeps the ID", async () => {
    const db = await setup();
    const renamed = ok(await renameDestination(db, "planner", 1, { name: "  Hobonichi ", section: " " }));
    expect(renamed).toMatchObject({ id: "planner", name: "Hobonichi", rev: 2 });
    expect(renamed.section).toBeUndefined();
    const queue = buildReview(await loadSnapshot(db), localDate()).queues[0];
    expect(queue.destination.name).toBe("Hobonichi");
    expect(queue.pending.map((i) => i.capture.id)).toEqual(["p1"]);
    db.close();
  });

  it("refuses a stale rename and a blank name", async () => {
    const db = await setup();
    ok(await renameDestination(db, "planner", 1, { name: "First" }));
    expect((await renameDestination(db, "planner", 1, { name: "Second" })).status).toBe("stale");
    await expect(renameDestination(db, "planner", 2, { name: "  " })).rejects.toThrow();
    expect((await loadSnapshot(db)).destinations[0].name).toBe("First");
    db.close();
  });
});

describe("archiveDestination", () => {
  it("moves waiting items to another destination and keeps history", async () => {
    const db = await setup();
    await markHandoffCopied(db, "h-p1", 1);
    const result = ok(await archiveDestination(db, "planner", 1, "vault"));
    expect(result.moved).toBe(2);
    expect(result.destination.archivedAt).toBeDefined();

    expect(await handoffOf(db, "h-p1")).toMatchObject({ destinationId: "vault", state: "pending" });
    expect((await handoffOf(db, "h-p1"))?.copiedAt).toBeUndefined();
    expect(await handoffOf(db, "h-p2")).toMatchObject({ destinationId: "vault", state: "deferred", revisitOn: "2030-01-01" });
    expect(await handoffOf(db, "h-p3")).toMatchObject({ destinationId: "planner", state: "completed" });

    const review = buildReview(await loadSnapshot(db), "2030-01-01");
    expect(review.queues.map((q) => q.destination.id)).toEqual(["vault"]);
    expect(review.queues[0].pending.map((i) => i.capture.id)).toEqual(["p1", "p2", "v1"]);
    db.close();
  });

  it("returns waiting items to Unsorted when no destination is chosen", async () => {
    const db = await setup();
    ok(await archiveDestination(db, "planner", 1, null));
    const review = buildReview(await loadSnapshot(db), localDate());
    expect(review.unsorted.map((c) => c.id)).toEqual(["p1", "p2"]);
    expect(await handoffOf(db, "h-p3")).toMatchObject({ state: "completed" });
    db.close();
  });

  it("refuses stale, archived, or invalid targets without changing anything", async () => {
    const db = await setup();
    expect((await archiveDestination(db, "planner", 99, null)).status).toBe("stale");
    expect((await archiveDestination(db, "planner", 1, "nope")).status).toBe("missing");
    await expect(archiveDestination(db, "planner", 1, "planner")).rejects.toThrow();
    ok(await archiveDestination(db, "vault", 1, null));
    expect((await archiveDestination(db, "planner", 1, "vault")).status).toBe("missing");
    expect(await handoffOf(db, "h-p1")).toMatchObject({ destinationId: "planner", rev: 1 });
    db.close();
  });
});

describe("restoreDestination", () => {
  it("makes an archived destination active again, empty", async () => {
    const db = await setup();
    const { destination } = ok(await archiveDestination(db, "planner", 1, "vault"));
    const restored = ok(await restoreDestination(db, "planner", destination.rev));
    expect(restored.archivedAt).toBeUndefined();
    const review = buildReview(await loadSnapshot(db), localDate());
    const planner = review.queues.find((q) => q.destination.id === "planner");
    expect(planner?.pending).toEqual([]);
    expect(planner?.doneToday.map((i) => i.capture.id)).toEqual(["p3"]);
    db.close();
  });

  it("reports missing for an active destination", async () => {
    const db = await setup();
    expect((await restoreDestination(db, "planner", 1)).status).toBe("missing");
    db.close();
  });
});
