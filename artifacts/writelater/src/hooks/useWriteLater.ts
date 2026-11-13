import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEMO_DB_NAME,
  openWriteLaterDb,
  type DbLifecycleEvent,
  type HandoffResolution,
  type StoredCapture,
  type StoredHandoff,
  type WriteLaterDb,
} from "../storage/db";
import { saveCapture, type SaveCaptureInput } from "../storage/captures";
import {
  assignCapture,
  createDestinations,
  deferHandoff,
  loadSnapshot,
  moveHandoff,
  reactivateHandoff,
  resolveHandoff,
  undoHandoffWrite,
  unsortHandoff,
  type CreateDestinationInput,
  type HandoffWrite,
  type Snapshot,
  type UndoToken,
  type WriteResult,
} from "../storage/handoffs";
import { newOpId } from "../storage/draft";
import { seedDemo } from "../data/demo";

export type StoreStatus = "loading" | "ready" | "error" | "stale";

export interface SaveOutcome {
  status: "created" | "already-saved";
  capture: StoredCapture;
}

/** What a review action did, so the UI can announce it and offer undo. */
export type ActionOutcome =
  | { status: "ok"; undo: UndoToken | null }
  | { status: "stale" }
  | { status: "missing" };

export interface WriteLaterActions {
  /** Rejects if the write fails; the caller keeps the draft and offers retry. */
  saveCapture: (input: SaveCaptureInput) => Promise<SaveOutcome>;
  createDestinations: (inputs: Omit<CreateDestinationInput, "id">[]) => Promise<void>;
  assign: (captureId: string, destinationId: string | null) => Promise<ActionOutcome>;
  resolve: (handoff: StoredHandoff, via: HandoffResolution) => Promise<ActionOutcome>;
  defer: (handoff: StoredHandoff, revisitOn: string) => Promise<ActionOutcome>;
  reactivate: (handoff: StoredHandoff) => Promise<ActionOutcome>;
  move: (handoff: StoredHandoff, destinationId: string) => Promise<ActionOutcome>;
  /** Sends a handoff back to Unsorted. */
  unsort: (handoff: StoredHandoff) => Promise<ActionOutcome>;
  undo: (token: UndoToken) => Promise<ActionOutcome>;
}

export interface UseWriteLater {
  status: StoreStatus;
  snapshot: Snapshot;
  actions: WriteLaterActions;
}

const EMPTY: Snapshot = { captures: [], destinations: [], handoffs: [] };

function toOutcome(result: WriteResult<HandoffWrite | null>): ActionOutcome {
  if (result.status !== "ok") return result;
  return { status: "ok", undo: result.value ? result.value.undo : null };
}

export function useWriteLater(dbName: string): UseWriteLater {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [status, setStatus] = useState<StoreStatus>("loading");
  const dbRef = useRef<Promise<WriteLaterDb> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const reload = useCallback(async () => {
    const dbPromise = dbRef.current;
    if (!dbPromise) return;
    const next = await loadSnapshot(await dbPromise);
    if (dbRef.current === dbPromise) setSnapshot(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    const onLifecycle = (event: DbLifecycleEvent) => {
      if (!cancelled && event === "versionchange") setStatus("stale");
    };
    const dbPromise = openWriteLaterDb(dbName, onLifecycle);
    dbRef.current = dbPromise;

    // Other tabs announce writes here so this tab re-reads instead of
    // acting on stale data.
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(`writelater:${dbName}`);
    channelRef.current = channel;
    if (channel) channel.onmessage = () => void reload().catch(() => {});

    dbPromise
      .then(async (db) => {
        if (dbName === DEMO_DB_NAME) await seedDemo(db);
        return loadSnapshot(db);
      })
      .then((loaded) => {
        if (cancelled) return;
        setSnapshot(loaded);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      dbRef.current = null;
      channelRef.current = null;
      channel?.close();
      dbPromise.then((db) => db.close()).catch(() => {});
    };
  }, [dbName, reload]);

  const withDb = useCallback(async <T,>(fn: (db: WriteLaterDb) => Promise<T>): Promise<T> => {
    const dbPromise = dbRef.current;
    if (!dbPromise) throw new Error("Storage is not open.");
    return fn(await dbPromise);
  }, []);

  /** Runs a write, then re-reads (also after `stale`, to show the latest). */
  const run = useCallback(
    async (fn: (db: WriteLaterDb) => Promise<WriteResult<HandoffWrite | null>>) => {
      const result = await withDb(fn);
      if (result.status === "ok") channelRef.current?.postMessage("changed");
      await reload();
      return toOutcome(result);
    },
    [withDb, reload],
  );

  const actions: WriteLaterActions = {
    saveCapture: useCallback(
      async (input) => {
        let result = await withDb((db) => saveCapture(db, input));
        if (result.status === "id-conflict") {
          // The draft's ID was already used for different text (e.g. a draft
          // shared across tabs). This is a new intent, so it gets a new ID.
          result = await withDb((db) => saveCapture(db, { ...input, opId: newOpId() }));
        }
        if (result.status === "id-conflict") throw new Error("Could not allocate a capture ID.");
        channelRef.current?.postMessage("changed");
        await reload();
        return { status: result.status, capture: result.capture };
      },
      [withDb, reload],
    ),
    createDestinations: useCallback(
      async (inputs) => {
        await withDb((db) =>
          createDestinations(db, inputs.map((input) => ({ ...input, id: newOpId() }))),
        );
        channelRef.current?.postMessage("changed");
        await reload();
      },
      [withDb, reload],
    ),
    assign: useCallback(
      (captureId, destinationId) =>
        run((db) => assignCapture(db, { opId: newOpId(), captureId, destinationId })),
      [run],
    ),
    resolve: useCallback(
      (handoff, via) => run((db) => resolveHandoff(db, handoff.id, handoff.rev, via)),
      [run],
    ),
    defer: useCallback(
      (handoff, revisitOn) => run((db) => deferHandoff(db, handoff.id, handoff.rev, revisitOn)),
      [run],
    ),
    reactivate: useCallback(
      (handoff) => run((db) => reactivateHandoff(db, handoff.id, handoff.rev)),
      [run],
    ),
    move: useCallback(
      (handoff, destinationId) =>
        run((db) => moveHandoff(db, handoff.id, handoff.rev, destinationId)),
      [run],
    ),
    unsort: useCallback(
      (handoff) => run((db) => unsortHandoff(db, handoff.id, handoff.rev)),
      [run],
    ),
    undo: useCallback((token) => run((db) => undoHandoffWrite(db, token)), [run]),
  };

  return { status, snapshot, actions };
}
