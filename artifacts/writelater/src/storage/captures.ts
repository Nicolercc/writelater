import type { StoredCapture, WriteLaterDb } from "./db";
import { CaptureTooLongError, MAX_CAPTURE_CHARS } from "./limits";

export interface SaveCaptureInput {
  /** Operation ID for this save intent; becomes the capture's primary key. */
  opId: string;
  text: string;
  sourceLabel?: string;
  sourceRef?: string;
}

/**
 * - `created`: a new capture was committed.
 * - `already-saved`: this operation already committed (e.g. the UI lost the
 *   acknowledgement and the user retried). Nothing new was written.
 * - `id-conflict`: the ID belongs to a different capture (e.g. a stale draft
 *   shared across tabs). Nothing was written; retry with a fresh operation ID.
 */
export type SaveCaptureResult =
  | { status: "created"; capture: StoredCapture }
  | { status: "already-saved"; capture: StoredCapture }
  | { status: "id-conflict" };

/**
 * Saves a capture idempotently. Resolves only after the transaction commits,
 * so callers can treat resolution as a durable acknowledgement.
 */
export async function saveCapture(
  db: WriteLaterDb,
  input: SaveCaptureInput,
  now: () => Date = () => new Date(),
): Promise<SaveCaptureResult> {
  const text = input.text.trim();
  if (!text) throw new Error("Cannot save an empty capture.");
  if (text.length > MAX_CAPTURE_CHARS) throw new CaptureTooLongError(text.length);

  // Read-then-add inside one readwrite transaction. IndexedDB serializes
  // readwrite transactions on the same store, so two saves with the same ID
  // cannot both see "missing" and both write.
  const tx = db.transaction("captures", "readwrite");
  const existing = await tx.store.get(input.opId);

  let result: SaveCaptureResult;
  if (existing) {
    result =
      existing.text === text
        ? { status: "already-saved", capture: existing }
        : { status: "id-conflict" };
  } else {
    const timestamp = now().toISOString();
    const capture: StoredCapture = {
      id: input.opId,
      text,
      ...(input.sourceLabel ? { sourceLabel: input.sourceLabel } : {}),
      ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
      rev: 1,
    };
    await tx.store.add(capture);
    result = { status: "created", capture };
  }

  await tx.done;
  return result;
}

/** All captures, newest first. */
export async function listCaptures(db: WriteLaterDb): Promise<StoredCapture[]> {
  const captures = await db.getAllFromIndex("captures", "by_createdAt");
  return captures.reverse();
}

/**
 * Permanently deletes a capture and every handoff that refers to it, in one
 * transaction, so no handoff is ever left pointing at a missing capture.
 * Returns false if the capture didn't exist.
 */
export async function deleteCapture(db: WriteLaterDb, id: string): Promise<boolean> {
  const tx = db.transaction(["captures", "handoffs"], "readwrite");
  const captures = tx.objectStore("captures");
  const handoffs = tx.objectStore("handoffs");
  const existing = await captures.get(id);
  if (existing) {
    for (const key of await handoffs.index("by_capture").getAllKeys(id)) {
      await handoffs.delete(key);
    }
    await captures.delete(id);
  }
  await tx.done;
  return !!existing;
}

/**
 * Permanently clears every store (captures, destinations, handoffs, usage
 * events) in one transaction. Exported files and anything copied elsewhere
 * are outside WriteLater and unaffected.
 */
export async function eraseAll(db: WriteLaterDb): Promise<void> {
  const tx = db.transaction(["captures", "destinations", "handoffs", "events"], "readwrite");
  await Promise.all([
    tx.objectStore("captures").clear(),
    tx.objectStore("destinations").clear(),
    tx.objectStore("handoffs").clear(),
    tx.objectStore("events").clear(),
    tx.done,
  ]);
}
