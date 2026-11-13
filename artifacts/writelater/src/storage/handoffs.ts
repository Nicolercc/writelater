import type {
  DestinationKind,
  HandoffResolution,
  StoredCapture,
  StoredDestination,
  StoredHandoff,
  WriteLaterDb,
} from "./db";

/**
 * Result of a write that may race with another tab.
 * - `stale`: the record changed since the caller read it; nothing was written.
 * - `missing`: a referenced record no longer exists; nothing was written.
 */
export type WriteResult<T> =
  | { status: "ok"; value: T }
  | { status: "stale" }
  | { status: "missing" };

/**
 * Enough to reverse one handoff write, but only if nothing changed it since.
 * `before: null` means the write created the handoff, so undo deletes it.
 */
export interface UndoToken {
  handoffId: string;
  before: StoredHandoff | null;
  afterRev: number;
}

export interface HandoffWrite {
  handoff: StoredHandoff;
  undo: UndoToken;
}

type Clock = () => Date;
const systemClock: Clock = () => new Date();

function omit<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...obj };
  for (const key of keys) delete copy[key];
  return copy;
}

// ---------------------------------------------------------------------------
// Destinations

export interface CreateDestinationInput {
  id: string;
  name: string;
  kind: DestinationKind;
  section?: string;
}

/** Creates destinations in one transaction. Existing IDs are left untouched. */
export async function createDestinations(
  db: WriteLaterDb,
  inputs: CreateDestinationInput[],
  now: Clock = systemClock,
): Promise<StoredDestination[]> {
  const tx = db.transaction("destinations", "readwrite");
  const created: StoredDestination[] = [];
  for (const input of inputs) {
    const name = input.name.trim();
    if (!name) throw new Error("A destination needs a name.");
    const existing = await tx.store.get(input.id);
    if (existing) continue;
    const section = input.section?.trim();
    const destination: StoredDestination = {
      id: input.id,
      name,
      kind: input.kind,
      ...(section ? { section } : {}),
      createdAt: now().toISOString(),
      rev: 1,
    };
    await tx.store.add(destination);
    created.push(destination);
  }
  await tx.done;
  return created;
}

/** Renames a destination. Its ID stays stable, so every queue follows. */
export async function renameDestination(
  db: WriteLaterDb,
  id: string,
  expectedRev: number,
  input: { name: string; section?: string },
): Promise<WriteResult<StoredDestination>> {
  const name = input.name.trim();
  if (!name) throw new Error("A destination needs a name.");
  const tx = db.transaction("destinations", "readwrite");
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    return { status: "missing" };
  }
  if (current.rev !== expectedRev) {
    await tx.done;
    return { status: "stale" };
  }
  const section = input.section?.trim();
  const next: StoredDestination = {
    ...omit(current, "section"),
    name,
    ...(section ? { section } : {}),
    rev: current.rev + 1,
  };
  await tx.store.put(next);
  await tx.done;
  return { status: "ok", value: next };
}

export interface ArchiveResult {
  destination: StoredDestination;
  /** Waiting items moved to the other destination or back to Unsorted. */
  moved: number;
}

/**
 * Archives a destination and, in the same transaction, moves every waiting
 * (pending or deferred) handoff to `reassignTo`, or back to Unsorted when
 * `reassignTo` is null. Completed and let-go handoffs keep pointing at the
 * archived destination as history.
 */
export async function archiveDestination(
  db: WriteLaterDb,
  id: string,
  expectedRev: number,
  reassignTo: string | null,
  now: Clock = systemClock,
): Promise<WriteResult<ArchiveResult>> {
  if (reassignTo === id) throw new Error("Can't move items into the destination being archived.");
  const tx = db.transaction(["destinations", "handoffs"], "readwrite");
  const destinations = tx.objectStore("destinations");
  const handoffs = tx.objectStore("handoffs");

  const current = await destinations.get(id);
  if (!current || current.archivedAt) {
    await tx.done;
    return { status: "missing" };
  }
  if (current.rev !== expectedRev) {
    await tx.done;
    return { status: "stale" };
  }
  if (reassignTo !== null) {
    const target = await destinations.get(reassignTo);
    if (!target || target.archivedAt) {
      await tx.done;
      return { status: "missing" };
    }
  }

  const timestamp = now().toISOString();
  const waiting = (await handoffs.getAll()).filter(
    (h) => h.destinationId === id && (h.state === "pending" || h.state === "deferred"),
  );
  for (const handoff of waiting) {
    if (reassignTo === null) {
      await handoffs.delete(handoff.id);
    } else {
      await handoffs.put({
        ...omit(handoff, "copiedAt"),
        destinationId: reassignTo,
        updatedAt: timestamp,
        rev: handoff.rev + 1,
      });
    }
  }

  const archived: StoredDestination = { ...current, archivedAt: timestamp, rev: current.rev + 1 };
  await destinations.put(archived);
  await tx.done;
  return { status: "ok", value: { destination: archived, moved: waiting.length } };
}

/** Makes an archived destination active again. Items moved away stay where they went. */
export async function restoreDestination(
  db: WriteLaterDb,
  id: string,
  expectedRev: number,
): Promise<WriteResult<StoredDestination>> {
  const tx = db.transaction("destinations", "readwrite");
  const current = await tx.store.get(id);
  if (!current || !current.archivedAt) {
    await tx.done;
    return { status: "missing" };
  }
  if (current.rev !== expectedRev) {
    await tx.done;
    return { status: "stale" };
  }
  const next: StoredDestination = { ...omit(current, "archivedAt"), rev: current.rev + 1 };
  await tx.store.put(next);
  await tx.done;
  return { status: "ok", value: next };
}

// ---------------------------------------------------------------------------
// Handoffs

export interface AssignInput {
  /** Operation ID for this assignment; becomes the handoff ID. */
  opId: string;
  captureId: string;
  /** A destination, or null to let the capture go without a destination. */
  destinationId: string | null;
}

/**
 * Sorts an Unsorted capture: to a destination (pending) or let go (discarded).
 * Idempotent per operation ID. Refuses if the capture was already sorted,
 * e.g. in another tab.
 */
export async function assignCapture(
  db: WriteLaterDb,
  input: AssignInput,
  now: Clock = systemClock,
): Promise<WriteResult<HandoffWrite>> {
  const tx = db.transaction(["captures", "destinations", "handoffs"], "readwrite");
  const handoffs = tx.objectStore("handoffs");

  const replay = await handoffs.get(input.opId);
  if (replay) {
    await tx.done;
    return {
      status: "ok",
      value: { handoff: replay, undo: { handoffId: replay.id, before: null, afterRev: replay.rev } },
    };
  }

  const capture = await tx.objectStore("captures").get(input.captureId);
  if (!capture) {
    await tx.done;
    return { status: "missing" };
  }
  if (input.destinationId !== null) {
    const destination = await tx.objectStore("destinations").get(input.destinationId);
    if (!destination || destination.archivedAt) {
      await tx.done;
      return { status: "missing" };
    }
  }
  const existing = await handoffs.index("by_capture").getAll(input.captureId);
  if (existing.length > 0) {
    await tx.done;
    return { status: "stale" };
  }

  const timestamp = now().toISOString();
  const handoff: StoredHandoff =
    input.destinationId === null
      ? {
          id: input.opId,
          captureId: input.captureId,
          destinationId: null,
          state: "discarded",
          resolvedAt: timestamp,
          resolvedVia: "discarded",
          createdAt: timestamp,
          updatedAt: timestamp,
          rev: 1,
        }
      : {
          id: input.opId,
          captureId: input.captureId,
          destinationId: input.destinationId,
          state: "pending",
          createdAt: timestamp,
          updatedAt: timestamp,
          rev: 1,
        };
  await handoffs.add(handoff);
  await tx.done;
  return {
    status: "ok",
    value: { handoff, undo: { handoffId: handoff.id, before: null, afterRev: 1 } },
  };
}

/**
 * Read-check-write on one handoff. Refuses if its revision moved since the
 * caller read it, so a stale tab can't overwrite a newer change.
 */
async function updateHandoff(
  db: WriteLaterDb,
  id: string,
  expectedRev: number,
  change: (current: StoredHandoff) => StoredHandoff,
  now: Clock,
): Promise<WriteResult<HandoffWrite>> {
  const tx = db.transaction("handoffs", "readwrite");
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    return { status: "missing" };
  }
  if (current.rev !== expectedRev) {
    await tx.done;
    return { status: "stale" };
  }
  const next: StoredHandoff = {
    ...change(current),
    id: current.id,
    updatedAt: now().toISOString(),
    rev: current.rev + 1,
  };
  await tx.store.put(next);
  await tx.done;
  return {
    status: "ok",
    value: { handoff: next, undo: { handoffId: id, before: current, afterRev: next.rev } },
  };
}

/** Confirms the transfer (Written / Added) or lets the item go. */
export function resolveHandoff(
  db: WriteLaterDb,
  id: string,
  expectedRev: number,
  via: HandoffResolution,
  now: Clock = systemClock,
): Promise<WriteResult<HandoffWrite>> {
  return updateHandoff(
    db,
    id,
    expectedRev,
    (current) => ({
      ...omit(current, "revisitOn"),
      state: via === "discarded" ? "discarded" : "completed",
      resolvedAt: now().toISOString(),
      resolvedVia: via,
    }),
    now,
  );
}

/** Hides a handoff until a local date (YYYY-MM-DD). */
export function deferHandoff(
  db: WriteLaterDb,
  id: string,
  expectedRev: number,
  revisitOn: string,
  now: Clock = systemClock,
): Promise<WriteResult<HandoffWrite>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(revisitOn)) {
    return Promise.reject(new Error("revisitOn must be YYYY-MM-DD."));
  }
  return updateHandoff(
    db,
    id,
    expectedRev,
    (current) => ({
      ...omit(current, "resolvedAt", "resolvedVia"),
      state: "deferred",
      revisitOn,
    }),
    now,
  );
}

/** Returns a deferred handoff to its queue now. */
export function reactivateHandoff(
  db: WriteLaterDb,
  id: string,
  expectedRev: number,
  now: Clock = systemClock,
): Promise<WriteResult<HandoffWrite>> {
  return updateHandoff(
    db,
    id,
    expectedRev,
    (current) => ({
      ...omit(current, "revisitOn", "resolvedAt", "resolvedVia"),
      state: "pending",
    }),
    now,
  );
}

/** Records that the text was copied. The handoff stays pending until confirmed. */
export function markHandoffCopied(
  db: WriteLaterDb,
  id: string,
  expectedRev: number,
  now: Clock = systemClock,
): Promise<WriteResult<HandoffWrite>> {
  return updateHandoff(
    db,
    id,
    expectedRev,
    (current) => ({ ...current, copiedAt: now().toISOString() }),
    now,
  );
}

/** Moves a pending handoff to another active destination. */
export async function moveHandoff(
  db: WriteLaterDb,
  id: string,
  expectedRev: number,
  destinationId: string,
  now: Clock = systemClock,
): Promise<WriteResult<HandoffWrite>> {
  const destination = await db.get("destinations", destinationId);
  if (!destination || destination.archivedAt) return { status: "missing" };
  return updateHandoff(
    db,
    id,
    expectedRev,
    (current) => ({
      ...omit(current, "revisitOn", "resolvedAt", "resolvedVia", "copiedAt"),
      destinationId,
      state: "pending",
    }),
    now,
  );
}

/**
 * Returns a capture to Unsorted by removing its handoff, if the handoff is
 * unchanged since the caller read it. Undo recreates it.
 */
export async function unsortHandoff(
  db: WriteLaterDb,
  id: string,
  expectedRev: number,
): Promise<WriteResult<HandoffWrite>> {
  const tx = db.transaction("handoffs", "readwrite");
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    return { status: "missing" };
  }
  if (current.rev !== expectedRev) {
    await tx.done;
    return { status: "stale" };
  }
  await tx.store.delete(id);
  await tx.done;
  // afterRev 0: undo recreates the record only while it is still absent.
  return { status: "ok", value: { handoff: current, undo: { handoffId: id, before: current, afterRev: 0 } } };
}

/**
 * Reverses one write if the handoff is still exactly as that write left it.
 * Never reverses a newer edit (e.g. one made in another tab).
 */
export async function undoHandoffWrite(
  db: WriteLaterDb,
  token: UndoToken,
  now: Clock = systemClock,
): Promise<WriteResult<null>> {
  const tx = db.transaction(["handoffs", "captures"], "readwrite");
  const handoffs = tx.objectStore("handoffs");
  const current = await handoffs.get(token.handoffId);

  if (token.afterRev === 0) {
    // Undoing an unsort: recreate only if it's still gone and the capture
    // hasn't been sorted again meanwhile.
    const before = token.before;
    const capture = before ? await tx.objectStore("captures").get(before.captureId) : undefined;
    const resorted = before
      ? (await handoffs.index("by_capture").getAll(before.captureId)).length > 0
      : true;
    if (current || !before || !capture || resorted) {
      await tx.done;
      return { status: "stale" };
    }
    await handoffs.add({ ...before, updatedAt: now().toISOString(), rev: before.rev + 1 });
    await tx.done;
    return { status: "ok", value: null };
  }

  if (!current || current.rev !== token.afterRev) {
    await tx.done;
    return { status: "stale" };
  }
  if (token.before === null) {
    await handoffs.delete(token.handoffId);
  } else {
    await handoffs.put({
      ...token.before,
      updatedAt: now().toISOString(),
      // Revisions only move forward, so other tabs still see a change.
      rev: current.rev + 1,
    });
  }
  await tx.done;
  return { status: "ok", value: null };
}

// ---------------------------------------------------------------------------
// Snapshot

export interface Snapshot {
  /** Newest first. */
  captures: StoredCapture[];
  /** Oldest first. */
  destinations: StoredDestination[];
  handoffs: StoredHandoff[];
}

/** Reads everything in one transaction so the view is never half-updated. */
export async function loadSnapshot(db: WriteLaterDb): Promise<Snapshot> {
  const tx = db.transaction(["captures", "destinations", "handoffs"], "readonly");
  const [captures, destinations, handoffs] = await Promise.all([
    tx.objectStore("captures").index("by_createdAt").getAll(),
    tx.objectStore("destinations").getAll(),
    tx.objectStore("handoffs").getAll(),
  ]);
  await tx.done;
  destinations.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { captures: captures.reverse(), destinations, handoffs };
}
