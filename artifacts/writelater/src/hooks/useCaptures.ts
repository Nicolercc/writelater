import { useCallback, useEffect, useRef, useState } from "react";
import {
  openWriteLaterDb,
  type DbLifecycleEvent,
  type StoredCapture,
  type WriteLaterDb,
} from "../storage/db";
import {
  listCaptures,
  saveCapture,
  type SaveCaptureInput,
} from "../storage/captures";
import { newOpId } from "../storage/draft";

export type CapturesStatus = "loading" | "ready" | "error" | "stale";

export interface SaveOutcome {
  status: "created" | "already-saved";
  capture: StoredCapture;
}

export interface UseCaptures {
  captures: StoredCapture[];
  status: CapturesStatus;
  /** Rejects if the write fails; the caller keeps the draft and offers retry. */
  save: (input: SaveCaptureInput) => Promise<SaveOutcome>;
}

export function useCaptures(dbName: string): UseCaptures {
  const [captures, setCaptures] = useState<StoredCapture[]>([]);
  const [status, setStatus] = useState<CapturesStatus>("loading");
  const dbRef = useRef<Promise<WriteLaterDb> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    const onLifecycle = (event: DbLifecycleEvent) => {
      if (!cancelled && event === "versionchange") setStatus("stale");
    };

    const dbPromise = openWriteLaterDb(dbName, onLifecycle);
    dbRef.current = dbPromise;

    dbPromise
      .then((db) => listCaptures(db))
      .then((loaded) => {
        if (cancelled) return;
        setCaptures(loaded);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      dbRef.current = null;
      dbPromise.then((db) => db.close()).catch(() => {});
    };
  }, [dbName]);

  const save = useCallback(async (input: SaveCaptureInput): Promise<SaveOutcome> => {
    const dbPromise = dbRef.current;
    if (!dbPromise) throw new Error("Storage is not open.");
    const db = await dbPromise;

    let result = await saveCapture(db, input);
    if (result.status === "id-conflict") {
      // The draft's ID was already used for different text (e.g. a draft shared
      // across tabs). This is a new intent, so it gets a new ID.
      result = await saveCapture(db, { ...input, opId: newOpId() });
    }
    if (result.status === "id-conflict") {
      throw new Error("Could not allocate a capture ID.");
    }

    const saved = result.capture;
    setCaptures((prev) =>
      prev.some((c) => c.id === saved.id) ? prev : [saved, ...prev],
    );
    return { status: result.status, capture: saved };
  }, []);

  return { captures, status, save };
}
