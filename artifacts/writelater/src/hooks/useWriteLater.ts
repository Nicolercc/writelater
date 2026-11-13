import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEMO_DB_NAME,
  openWriteLaterDb,
  type DbLifecycleEvent,
  type HandoffResolution,
  type UsageEventType,
  type StoredCapture,
  type StoredDestination,
  type StoredHandoff,
  type WriteLaterDb,
} from "../storage/db";
import { deleteCapture, eraseAll, saveCapture, type SaveCaptureInput } from "../storage/captures";
import {
  archiveDestination,
  assignCapture,
  createDestinations,
  renameDestination,
  restoreDestination,
  deferHandoff,
  loadSnapshot,
  markHandoffCopied,
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
import { clearLocalState, newOpId } from "../storage/draft";
import { applyRestore, type ApplyResult, type RestorePlan } from "../storage/restore";
import { requestPersistence } from "../storage/persist";
import { seedDemo } from "../data/demo";
import { buildUsageSummary, listEvents, logEvent, type UsageSummary } from "../storage/usage";

/**
 * - `blocked`: this tab is upgrading the database but an older tab still has
 *   it open. Opening finishes (and status becomes `ready`) once that tab closes.
 * - `stale`: a newer version opened elsewhere and this connection closed.
 */
export type StoreStatus = "loading" | "blocked" | "ready" | "error" | "stale";

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
  /** Records a successful copy; the handoff stays pending. */
  markCopied: (handoff: StoredHandoff) => Promise<ActionOutcome>;
  /** Sends a handoff back to Unsorted. */
  unsort: (handoff: StoredHandoff) => Promise<ActionOutcome>;
  undo: (token: UndoToken) => Promise<ActionOutcome>;
  renameDestination: (
    destination: StoredDestination,
    input: { name: string; section?: string },
  ) => Promise<ActionOutcome>;
  /** Archives, moving waiting items to `reassignTo` or back to Unsorted (null). */
  archiveDestination: (
    destination: StoredDestination,
    reassignTo: string | null,
  ) => Promise<ActionOutcome & { moved?: number }>;
  restoreDestination: (destination: StoredDestination) => Promise<ActionOutcome>;
  /** Permanently deletes a capture and its handoffs. False if it was already gone. */
  deleteCapture: (captureId: string) => Promise<boolean>;
  /** Permanently clears every store and this database's local state. */
  eraseEverything: () => Promise<void>;
  /** Writes a previewed restore plan atomically. */
  restoreBackup: (plan: RestorePlan) => Promise<ApplyResult>;
  /** Records a usage event. Best-effort: never throws. */
  logUsage: (type: UsageEventType) => void;
  usageSummary: () => Promise<UsageSummary>;
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
  // Ask for durable storage once per session, after the first real save:
  // that's when there is something worth keeping and the person is engaged.
  const persistAskedRef = useRef(false);

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
      if (cancelled) return;
      if (event === "versionchange") setStatus("stale");
      if (event === "blocked") setStatus((s) => (s === "loading" ? "blocked" : s));
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

  /**
   * Re-reads after a write. A failed re-read must never turn a committed
   * write into an error, so it's swallowed: the write stands, and the next
   * successful read (another write, another tab, a reload) catches the view up.
   */
  const refresh = useCallback(() => reload().catch(() => {}), [reload]);

  const withDb = useCallback(async <T,>(fn: (db: WriteLaterDb) => Promise<T>): Promise<T> => {
    const dbPromise = dbRef.current;
    if (!dbPromise) throw new Error("Storage is not open.");
    return fn(await dbPromise);
  }, []);

  /** Usage logging must never affect the user's action, so failures are ignored. */
  const logUsage = useCallback(
    (type: UsageEventType) => {
      void withDb((db) => logEvent(db, type)).catch(() => {});
    },
    [withDb],
  );

  /**
   * Runs a write, logs `event` if it succeeded, then re-reads (also after
   * `stale`, to show the latest).
   */
  const run = useCallback(
    async (
      fn: (db: WriteLaterDb) => Promise<WriteResult<HandoffWrite | null>>,
      event?: UsageEventType,
    ) => {
      const result = await withDb(fn);
      if (result.status === "ok") {
        channelRef.current?.postMessage("changed");
        if (event) logUsage(event);
      }
      await refresh();
      return toOutcome(result);
    },
    [withDb, refresh, logUsage],
  );

  /** Runs a write that has no undo token (destination changes). */
  const runPlain = useCallback(
    async <T,>(fn: (db: WriteLaterDb) => Promise<WriteResult<T>>) => {
      const result = await withDb(fn);
      if (result.status === "ok") channelRef.current?.postMessage("changed");
      await refresh();
      return result;
    },
    [withDb, refresh],
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
        if (result.status === "created") {
          logUsage("capture_saved");
          if (!persistAskedRef.current && dbName !== DEMO_DB_NAME) {
            persistAskedRef.current = true;
            void requestPersistence();
          }
        }
        channelRef.current?.postMessage("changed");
        await refresh();
        return { status: result.status, capture: result.capture };
      },
      [withDb, refresh, logUsage, dbName],
    ),
    createDestinations: useCallback(
      async (inputs) => {
        await withDb((db) =>
          createDestinations(db, inputs.map((input) => ({ ...input, id: newOpId() }))),
        );
        channelRef.current?.postMessage("changed");
        await refresh();
      },
      [withDb, refresh],
    ),
    assign: useCallback(
      (captureId, destinationId) =>
        run(
          (db) => assignCapture(db, { opId: newOpId(), captureId, destinationId }),
          destinationId === null ? "handoff_let_go" : "handoff_sorted",
        ),
      [run],
    ),
    resolve: useCallback(
      (handoff, via) =>
        run(
          (db) => resolveHandoff(db, handoff.id, handoff.rev, via),
          via === "written"
            ? "handoff_confirmed_paper"
            : via === "added"
              ? "handoff_confirmed_digital"
              : "handoff_let_go",
        ),
      [run],
    ),
    defer: useCallback(
      (handoff, revisitOn) =>
        run((db) => deferHandoff(db, handoff.id, handoff.rev, revisitOn), "handoff_deferred"),
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
    markCopied: useCallback(
      (handoff) => run((db) => markHandoffCopied(db, handoff.id, handoff.rev), "copy_succeeded"),
      [run],
    ),
    unsort: useCallback(
      (handoff) => run((db) => unsortHandoff(db, handoff.id, handoff.rev)),
      [run],
    ),
    undo: useCallback((token) => run((db) => undoHandoffWrite(db, token), "undo"), [run]),
    renameDestination: useCallback(
      async (destination, input) => {
        const result = await runPlain((db) => renameDestination(db, destination.id, destination.rev, input));
        return result.status === "ok" ? { status: "ok", undo: null } : result;
      },
      [runPlain],
    ),
    archiveDestination: useCallback(
      async (destination, reassignTo) => {
        const result = await runPlain((db) =>
          archiveDestination(db, destination.id, destination.rev, reassignTo),
        );
        return result.status === "ok"
          ? { status: "ok", undo: null, moved: result.value.moved }
          : result;
      },
      [runPlain],
    ),
    restoreDestination: useCallback(
      async (destination) => {
        const result = await runPlain((db) => restoreDestination(db, destination.id, destination.rev));
        return result.status === "ok" ? { status: "ok", undo: null } : result;
      },
      [runPlain],
    ),
    deleteCapture: useCallback(
      async (captureId) => {
        const deleted = await withDb((db) => deleteCapture(db, captureId));
        channelRef.current?.postMessage("changed");
        await refresh();
        return deleted;
      },
      [withDb, refresh],
    ),
    eraseEverything: useCallback(async () => {
      await withDb((db) => eraseAll(db));
      clearLocalState(dbName);
      channelRef.current?.postMessage("changed");
      await refresh();
    }, [withDb, refresh, dbName]),
    restoreBackup: useCallback(
      async (plan) => {
        const result = await withDb((db) => applyRestore(db, plan));
        if (result.status === "ok") channelRef.current?.postMessage("changed");
        await refresh();
        return result;
      },
      [withDb, refresh],
    ),
    logUsage,
    usageSummary: useCallback(
      async () => buildUsageSummary(await withDb((db) => listEvents(db))),
      [withDb],
    ),
  };

  return { status, snapshot, actions };
}
