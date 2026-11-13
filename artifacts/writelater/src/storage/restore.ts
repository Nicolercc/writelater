import type { StoredCapture, StoredDestination, StoredHandoff, WriteLaterDb } from "./db";
import type { Snapshot } from "./handoffs";
import type { ParsedBackup } from "./restoreParse";

// Planning and applying a restore. Parsing and validation are in
// restoreParse.ts, which pulls in zod and is loaded on demand.

/** Key-order-independent JSON, so equal records compare equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export type RecordKind = "capture" | "destination" | "status";

export interface RestoreConflict {
  kind: RecordKind;
  id: string;
  reason: string;
}

export interface RestorePlan {
  exportedAt: string;
  add: {
    captures: StoredCapture[];
    destinations: StoredDestination[];
    handoffs: StoredHandoff[];
  };
  /** Records already on this device, unchanged. Skipped. */
  identical: number;
  /** Records that differ from this device's copy, or would break an invariant. Skipped, never overwritten. */
  conflicts: RestoreConflict[];
  /** Problems that make the whole file unsafe to restore. When non-empty, nothing is restored. */
  errors: string[];
}

/**
 * Decides what a restore would do, without writing. Existing records are
 * never overwritten: identical ones are skipped and differing ones are
 * reported as conflicts.
 */
export function planRestore(current: Snapshot, backup: ParsedBackup): RestorePlan {
  const plan: RestorePlan = {
    exportedAt: backup.exportedAt,
    add: { captures: [], destinations: [], handoffs: [] },
    identical: 0,
    conflicts: [],
    errors: [],
  };

  const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]));
  const currentCaptures = byId(current.captures);
  const currentDestinations = byId(current.destinations);
  const currentHandoffs = byId(current.handoffs);

  /** Classify one record against this device's copy. Returns true if it should be added. */
  const classify = <T extends { id: string }>(kind: RecordKind, record: T, existing: T | undefined) => {
    if (!existing) return true;
    if (canonical(existing) === canonical(record)) plan.identical += 1;
    else plan.conflicts.push({ kind, id: record.id, reason: "differs from the copy on this device" });
    return false;
  };

  const conflictingCaptureIds = new Set<string>();
  for (const capture of backup.captures) {
    if (classify("capture", capture, currentCaptures.get(capture.id))) plan.add.captures.push(capture);
    else if (currentCaptures.has(capture.id) && canonical(currentCaptures.get(capture.id)) !== canonical(capture)) {
      conflictingCaptureIds.add(capture.id);
    }
  }
  for (const destination of backup.destinations) {
    if (classify("destination", destination, currentDestinations.get(destination.id))) {
      plan.add.destinations.push(destination);
    }
  }

  const backupCaptureIds = new Set(backup.captures.map((c) => c.id));
  const backupDestinationIds = new Set(backup.destinations.map((d) => d.id));
  // One handoff per capture: track which captures are already sorted.
  const sortedCaptureIds = new Set(current.handoffs.map((h) => h.captureId));

  for (const handoff of backup.handoffs) {
    const captureKnown = backupCaptureIds.has(handoff.captureId) || currentCaptures.has(handoff.captureId);
    const destinationKnown =
      handoff.destinationId === null ||
      backupDestinationIds.has(handoff.destinationId) ||
      currentDestinations.has(handoff.destinationId);
    if (!captureKnown || !destinationKnown) {
      plan.errors.push("A status in the backup refers to a capture or destination that isn't in the file.");
      break;
    }

    if (!classify("status", handoff, currentHandoffs.get(handoff.id))) continue;
    if (conflictingCaptureIds.has(handoff.captureId)) {
      plan.conflicts.push({ kind: "status", id: handoff.id, reason: "its capture differs on this device" });
      continue;
    }
    if (sortedCaptureIds.has(handoff.captureId)) {
      plan.conflicts.push({ kind: "status", id: handoff.id, reason: "its capture is already sorted on this device" });
      continue;
    }
    sortedCaptureIds.add(handoff.captureId);
    plan.add.handoffs.push(handoff);
  }

  if (plan.errors.length > 0) {
    plan.add = { captures: [], destinations: [], handoffs: [] };
  }
  return plan;
}

export type ApplyResult =
  | { status: "ok"; added: number }
  /** Something changed on this device after the preview. Nothing was written. */
  | { status: "stale" };

/**
 * Writes a plan's additions in one transaction. Uses add(), so any record
 * that appeared since the preview aborts the whole restore, and re-checks the
 * one-handoff-per-capture rule inside the transaction.
 */
export async function applyRestore(db: WriteLaterDb, plan: RestorePlan): Promise<ApplyResult> {
  if (plan.errors.length > 0) throw new Error("Refusing to apply a plan with errors.");
  const tx = db.transaction(["captures", "destinations", "handoffs"], "readwrite");
  const captures = tx.objectStore("captures");
  const destinations = tx.objectStore("destinations");
  const handoffs = tx.objectStore("handoffs");

  try {
    for (const c of plan.add.captures) await captures.add(c);
    for (const d of plan.add.destinations) await destinations.add(d);
    for (const h of plan.add.handoffs) {
      const sorted = await handoffs.index("by_capture").count(h.captureId);
      if (sorted > 0) throw new DOMException("Capture already sorted", "ConstraintError");
      if (h.destinationId !== null && !(await destinations.get(h.destinationId))) {
        throw new DOMException("Destination missing", "ConstraintError");
      }
      if (!(await captures.get(h.captureId))) {
        throw new DOMException("Capture missing", "ConstraintError");
      }
      await handoffs.add(h);
    }
    await tx.done;
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // Already aborted by the failed request.
    }
    await tx.done.catch(() => {});
    if (err instanceof DOMException && err.name === "ConstraintError") return { status: "stale" };
    throw err;
  }
  return {
    status: "ok",
    added: plan.add.captures.length + plan.add.destinations.length + plan.add.handoffs.length,
  };
}
