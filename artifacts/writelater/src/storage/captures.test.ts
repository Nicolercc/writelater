import { describe, expect, it } from "vitest";
import { openWriteLaterDb } from "./db";
import { deleteCapture, listCaptures, saveCapture } from "./captures";

describe("saveCapture", () => {
  it("commits a capture that a fresh connection can read (survives reload)", async () => {
    const db = await openWriteLaterDb("test");
    const result = await saveCapture(db, { opId: "op-a", text: "  SYNTHETIC A  " });
    expect(result.status).toBe("created");
    db.close();

    const reopened = await openWriteLaterDb("test");
    const captures = await listCaptures(reopened);
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({ id: "op-a", text: "SYNTHETIC A", rev: 1 });
    reopened.close();
  });

  it("is idempotent for concurrent saves with the same operation ID", async () => {
    const db = await openWriteLaterDb("test");
    const results = await Promise.all([
      saveCapture(db, { opId: "op-c", text: "SYNTHETIC C" }),
      saveCapture(db, { opId: "op-c", text: "SYNTHETIC C" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["already-saved", "created"]);
    expect(await listCaptures(db)).toHaveLength(1);
    db.close();
  });

  it("reports already-saved when retrying after a lost acknowledgement", async () => {
    const db = await openWriteLaterDb("test");
    await saveCapture(db, { opId: "op-d", text: "SYNTHETIC D" });
    const retry = await saveCapture(db, { opId: "op-d", text: "SYNTHETIC D" });
    expect(retry.status).toBe("already-saved");
    expect(await listCaptures(db)).toHaveLength(1);
    db.close();
  });

  it("keeps two deliberately identical notes as two records", async () => {
    const db = await openWriteLaterDb("test");
    await saveCapture(db, { opId: "op-e1", text: "SYNTHETIC E" });
    await saveCapture(db, { opId: "op-e2", text: "SYNTHETIC E" });
    expect(await listCaptures(db)).toHaveLength(2);
    db.close();
  });

  it("refuses to overwrite a different capture that already uses the ID", async () => {
    const db = await openWriteLaterDb("test");
    await saveCapture(db, { opId: "op-f", text: "SYNTHETIC F original" });
    const result = await saveCapture(db, { opId: "op-f", text: "SYNTHETIC F edited" });
    expect(result.status).toBe("id-conflict");
    const captures = await listCaptures(db);
    expect(captures).toHaveLength(1);
    expect(captures[0].text).toBe("SYNTHETIC F original");
    db.close();
  });

  it("rejects empty text without writing", async () => {
    const db = await openWriteLaterDb("test");
    await expect(saveCapture(db, { opId: "op-g", text: "   " })).rejects.toThrow();
    expect(await listCaptures(db)).toHaveLength(0);
    db.close();
  });

  it("lists newest first and deletes by ID", async () => {
    const db = await openWriteLaterDb("test");
    await saveCapture(db, { opId: "old", text: "older" }, () => new Date("2026-01-01T00:00:00Z"));
    await saveCapture(db, { opId: "new", text: "newer" }, () => new Date("2026-01-02T00:00:00Z"));
    expect((await listCaptures(db)).map((c) => c.id)).toEqual(["new", "old"]);
    await deleteCapture(db, "old");
    expect((await listCaptures(db)).map((c) => c.id)).toEqual(["new"]);
    db.close();
  });

  it("keeps demo and real databases separate", async () => {
    const real = await openWriteLaterDb("writelater");
    const demo = await openWriteLaterDb("writelater-demo");
    await saveCapture(demo, { opId: "demo-op", text: "SYNTHETIC demo" });
    expect(await listCaptures(real)).toHaveLength(0);
    real.close();
    demo.close();
  });
});
