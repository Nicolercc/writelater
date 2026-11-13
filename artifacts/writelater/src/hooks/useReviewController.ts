import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot, UndoToken } from "../storage/handoffs";
import type { ActionOutcome, WriteLaterActions } from "./useWriteLater";
import { HEADING_ID } from "../components/review/shared";

export type ReviewView =
  | { kind: "home" }
  | { kind: "unsorted" }
  | { kind: "destination"; id: string }
  | { kind: "deferred" }
  | { kind: "manage" };

export interface Announcement {
  message: string;
  undo: UndoToken | null;
}

const UNDO_MS = 8000;

function viewKey(dbName: string) {
  return `writelater:review-view:${dbName}`;
}

/** The last open queue, so returning after an interruption lands in place. */
function readView(dbName: string): ReviewView {
  try {
    const parsed = JSON.parse(localStorage.getItem(viewKey(dbName)) ?? "null") as ReviewView | null;
    if (
      parsed &&
      (parsed.kind === "home" ||
        parsed.kind === "unsorted" ||
        parsed.kind === "deferred" ||
        parsed.kind === "manage" ||
        (parsed.kind === "destination" && typeof parsed.id === "string"))
    ) {
      return parsed;
    }
  } catch {
    // Fall through to home.
  }
  return { kind: "home" };
}

/**
 * Review's shared machinery: which view is open (remembered across reloads),
 * where focus goes next, one write at a time, and the announcement with its
 * undo offer.
 */
export function useReviewController(dbName: string, snapshot: Snapshot, actions: WriteLaterActions) {
  const [view, setView] = useState<ReviewView>(() => readView(dbName));
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // State updates land a render later, so two taps in one frame both see
  // busy=false. The ref closes that gap; the state drives disabled styling.
  const busyRef = useRef(false);
  const undoRegionRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(viewKey(dbName), JSON.stringify(view));
    } catch {
      // Not remembered; harmless.
    }
  }, [dbName, view]);

  // Move focus after view changes and actions, once the DOM reflects them.
  useEffect(() => {
    if (!focusTarget) return;
    const el = document.getElementById(focusTarget) ?? document.getElementById(HEADING_ID);
    el?.focus();
    setFocusTarget(null);
  }, [focusTarget, snapshot, view]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  // Auto-dismiss the message and its undo offer, but never while focus is
  // inside it. The resolved-today lists remain a persistent way back.
  const scheduleDismiss = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (undoRegionRef.current?.contains(document.activeElement)) return;
      setAnnouncement(null);
    }, UNDO_MS);
  }, []);

  const announce = useCallback(
    (message: string, undo: UndoToken | null = null) => {
      setAnnouncement({ message, undo });
      scheduleDismiss();
    },
    [scheduleDismiss],
  );

  /** Moves focus to an element ID, or to the view heading. */
  const focus = useCallback((id: string | null) => setFocusTarget(id ?? HEADING_ID), []);

  const go = useCallback((next: ReviewView) => {
    setView(next);
    setFocusTarget(HEADING_ID);
  }, []);

  /** Runs one write at a time; a second call while one is in flight is ignored. */
  const exclusive = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  /** True while a write is in flight (read synchronously, for handlers that start async work). */
  const isBusy = useCallback(() => busyRef.current, []);

  /**
   * Runs one review action, announces the result, and moves focus to the
   * next item in the list (or the heading when the list empties).
   */
  const act = useCallback(
    async (run: () => Promise<ActionOutcome>, success: string, nextFocusId: string | null) => {
      try {
        const outcome = await exclusive(run);
        if (!outcome) return; // A tap while another action was in flight.
        if (outcome.status === "ok") {
          announce(success, outcome.undo);
          focus(nextFocusId);
        } else if (outcome.status === "stale") {
          announce("That item changed in another tab. Showing the latest.");
        } else {
          announce("That item no longer exists. Showing the latest.");
        }
      } catch {
        announce("Couldn't save that change. Nothing was changed. Try again.");
      }
    },
    [exclusive, announce, focus],
  );

  const undo = useCallback(
    async (token: UndoToken) => {
      try {
        const outcome = await exclusive(() => actions.undo(token));
        if (!outcome) return;
        announce(
          outcome.status === "ok" ? "Undone." : "Can't undo: that item changed since. Showing the latest.",
        );
      } catch {
        announce("Couldn't undo. Try again.");
      }
    },
    [exclusive, actions, announce],
  );

  const dismiss = useCallback(() => setAnnouncement(null), []);

  return {
    view,
    setView,
    go,
    focus,
    busy,
    isBusy,
    exclusive,
    act,
    announce,
    announcement,
    undo,
    dismiss,
    scheduleDismiss,
    undoRegionRef,
  };
}

export type ReviewController = ReturnType<typeof useReviewController>;
