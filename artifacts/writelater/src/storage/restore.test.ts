import { describe, expect, it } from "vitest";
import { openWriteLaterDb, SCHEMA_VERSION, type WriteLaterDb } from "./db";
import { saveCapture } from "./captures";
import { assignCapture, createDestinations, loadSnapshot, resolveHandoff } from "./handoffs";
import { buildBackup } from "../lib/export";
import { applyRestore, planRestore } from "./restore";
import { MAX_BACKUP_RECORDS, parseBackup, type ParsedBackup } from "./restoreParse";

async function populated(name: string): Promise<WriteLaterDb> {
  const db = await openWriteLaterDb(name);
  await createDestinations(db, [
    { id: "p", name: "Planner", kind: "paper", section: "This Week" },
    { id: "v", name: "Vault", kind: "digital" },
  ]);
  await saveCapture(db, { opId: "c1", text: "SYNTHETIC one", sourceRef: "https://example.test" }, () => new Date("2030-01-01T10:00:00Z"));
  await saveCapture(db, { opId: "c2", text: "SYNTHETIC two" }, () => new Date("2030-01-01T10:01:00Z"));
  await saveCapture(db, { opId: "c3", text: "SYNTHETIC three" }, () => new Date("2030-01-01T10:02:00Z"));
  await assignCapture(db, { opId: "h1", captureId: "c1", destinationId: "p" });
  await assignCapture(db, { opId: "h2", captureId: "c2", destinationId: "v" });
  await resolveHandoff(db, "h2", 1, "added");
  return db;
}

async function backupText(db: WriteLaterDb): Promise<string> {
  return JSON.stringify(buildBackup(await loadSnapshot(db)));
}

function parsed(text: string): ParsedBackup {
  const result = parseBackup(text);
  if (!result.ok) throw new Error(result.error);
  return result.backup;
}

describe("parseBackup", () => {
  it("accepts a backup this app exported", async () => {
    const db = await populated("src");
    const result = parseBackup(await backupText(db));
    expect(result.ok).toBe(true);
    db.close();
  });

  it.each([
    ["not json", "The file isn't valid JSON."],
    [JSON.stringify({ hello: 1 }), "The file isn't a WriteLater backup."],
    [JSON.stringify({ format: "writelater-backup", schemaVersion: SCHEMA_VERSION + 1, exportedAt: "2030-01-01T00:00:00Z" }), "newer version"],
    [JSON.stringify({ format: "writelater-backup", schemaVersion: 3, exportedAt: "2030-01-01T00:00:00Z", captures: [{ id: "x", text: "", createdAt: "2030-01-01T00:00:00Z", updatedAt: "2030-01-01T00:00:00Z", rev: 1 }] }), "invalid value at captures.0.text"],
    [JSON.stringify({ format: "writelater-backup", schemaVersion: 3, exportedAt: "nope" }), "invalid value at exportedAt"],
  ])("rejects %s", (text, message) => {
    const result = parseBackup(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it("rejects duplicate IDs and oversized backups", () => {
    const capture = { id: "dup", text: "SYNTHETIC", createdAt: "2030-01-01T00:00:00Z", updatedAt: "2030-01-01T00:00:00Z", rev: 1 };
    const base = { format: "writelater-backup", schemaVersion: 3, exportedAt: "2030-01-01T00:00:00Z" };
    const dup = parseBackup(JSON.stringify({ ...base, captures: [capture, capture] }));
    expect(dup.ok === false && dup.error).toContain("same capture twice");

    const many = Array.from({ length: MAX_BACKUP_RECORDS + 1 }, (_, i) => ({ ...capture, id: `c${i}` }));
    const big = parseBackup(JSON.stringify({ ...base, captures: many }));
    expect(big.ok === false && big.error).toContain("more than");
  });

  it("never echoes file content in its error", () => {
    const result = parseBackup('{"format":"writelater-backup","schemaVersion":3,"exportedAt":"2030-01-01T00:00:00Z","captures":[{"id":"x","text":"SYNTHETIC SECRET","createdAt":"bad","updatedAt":"bad","rev":1}]}');
    expect(result.ok === false && result.error).not.toContain("SECRET");
  });
});

describe("planRestore and applyRestore", () => {
  it("round-trips a backup into an empty database exactly", async () => {
    const source = await populated("src");
    const text = await backupText(source);
    const target = await openWriteLaterDb("dst");

    const plan = planRestore(await loadSnapshot(target), parsed(text));
    expect(plan.errors).toEqual([]);
    expect(plan.add.captures).toHaveLength(3);
    expect(await applyRestore(target, plan)).toEqual({ status: "ok", added: 7 });
    expect(await loadSnapshot(target)).toEqual(await loadSnapshot(source));
    source.close();
    target.close();
  });

  it("skips identical records and reports differing ones without overwriting", async () => {
    const db = await populated("same");
    const backup = parsed(await backupText(db));
    backup.captures[0] = { ...backup.captures[0], text: "SYNTHETIC edited elsewhere" }; // c3 (newest first)

    const plan = planRestore(await loadSnapshot(db), backup);
    expect(plan.add).toEqual({ captures: [], destinations: [], handoffs: [] });
    expect(plan.identical).toBe(6);
    expect(plan.conflicts).toEqual([{ kind: "capture", id: "c3", reason: "differs from the copy on this device" }]);
    db.close();
  });

  it("refuses a status for a capture already sorted on this device", async () => {
    const db = await populated("sorted");
    const backup = parsed(await backupText(db));
    backup.handoffs = [{ ...backup.handoffs[0], id: "other-h", destinationId: "v" }]; // second status for c1
    const plan = planRestore(await loadSnapshot(db), backup);
    expect(plan.add.handoffs).toEqual([]);
    expect(plan.conflicts).toContainEqual({ kind: "status", id: "other-h", reason: "its capture is already sorted on this device" });
    db.close();
  });

  it("skips statuses whose capture differs on this device", async () => {
    const source = await populated("src2");
    const backup = parsed(await backupText(source));
    const target = await openWriteLaterDb("dst2");
    await saveCapture(target, { opId: "c1", text: "SYNTHETIC different text" });

    const plan = planRestore(await loadSnapshot(target), backup);
    expect(plan.conflicts.map((c) => `${c.kind}:${c.id}`)).toEqual(["capture:c1", "status:h1"]);
    expect(plan.add.handoffs.map((h) => h.id)).toEqual(["h2"]);
    source.close();
    target.close();
  });

  it("rejects the whole file when a status points at a missing record", async () => {
    const db = await populated("refs");
    const backup = parsed(await backupText(db));
    backup.captures = backup.captures.filter((c) => c.id !== "c1");
    const empty = await openWriteLaterDb("empty");
    const plan = planRestore(await loadSnapshot(empty), backup);
    expect(plan.errors).toHaveLength(1);
    expect(plan.add).toEqual({ captures: [], destinations: [], handoffs: [] });
    await expect(applyRestore(empty, plan)).rejects.toThrow();
    db.close();
    empty.close();
  });

  it("writes nothing if the device changed after the preview", async () => {
    const source = await populated("src3");
    const backup = parsed(await backupText(source));
    const target = await openWriteLaterDb("dst3");
    const plan = planRestore(await loadSnapshot(target), backup);

    // Another tab saves a capture with one of the backup's IDs before Restore is pressed.
    await saveCapture(target, { opId: "c3", text: "SYNTHETIC raced in" });

    expect(await applyRestore(target, plan)).toEqual({ status: "stale" });
    const after = await loadSnapshot(target);
    expect(after.captures.map((c) => c.text)).toEqual(["SYNTHETIC raced in"]);
    expect(after.destinations).toEqual([]);
    expect(after.handoffs).toEqual([]);
    source.close();
    target.close();
  });
});

describe("every saved capture is restorable", () => {
  it("round-trips a capture at the save limit through export and restore", async () => {
    const { MAX_CAPTURE_CHARS } = await import("./limits");
    const source = await openWriteLaterDb("limit-src");
    await saveCapture(source, { opId: "big", text: "x".repeat(MAX_CAPTURE_CHARS) });
    const text = await backupText(source);

    const result = parseBackup(text);
    expect(result.ok).toBe(true);
    const target = await openWriteLaterDb("limit-dst");
    const plan = planRestore(await loadSnapshot(target), parsed(text));
    expect(await applyRestore(target, plan)).toEqual({ status: "ok", added: 1 });
    expect((await loadSnapshot(target)).captures[0].text).toHaveLength(MAX_CAPTURE_CHARS);
    source.close();
    target.close();
  });

  it("restores text saved before the limit existed", async () => {
    const { MAX_CAPTURE_CHARS } = await import("./limits");
    const source = await openWriteLaterDb("legacy-src");
    // Written directly, as an older build without the limit could have.
    const at = new Date().toISOString();
    await source.put("captures", { id: "legacy", text: "y".repeat(MAX_CAPTURE_CHARS + 5_000), createdAt: at, updatedAt: at, rev: 1 });
    const text = await backupText(source);

    expect(parseBackup(text).ok).toBe(true);
    const target = await openWriteLaterDb("legacy-dst");
    expect(await applyRestore(target, planRestore(await loadSnapshot(target), parsed(text)))).toEqual({ status: "ok", added: 1 });
    source.close();
    target.close();
  });
});
