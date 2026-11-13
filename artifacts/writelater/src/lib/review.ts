import type { StoredCapture, StoredDestination, StoredHandoff } from "../storage/db";
import type { Snapshot } from "../storage/handoffs";

export interface QueueItem {
  handoff: StoredHandoff;
  capture: StoredCapture;
}

export interface DestinationQueue {
  destination: StoredDestination;
  /** Pending plus deferred items whose date has arrived, oldest first. */
  pending: QueueItem[];
  /** Resolved today (local date), newest first, so they can be undone. */
  doneToday: QueueItem[];
}

export interface Review {
  /** Captures with no handoff yet, oldest first. */
  unsorted: StoredCapture[];
  /** Captures let go straight from Unsorted today. */
  unsortedDoneToday: QueueItem[];
  queues: DestinationQueue[];
  /** Deferred items whose date hasn't arrived, soonest first. */
  deferred: QueueItem[];
  /** Unsorted plus every pending item: what still needs attention. */
  waitingCount: number;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar date as YYYY-MM-DD. */
export function localDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + days));
}

function isDue(handoff: StoredHandoff, today: string): boolean {
  return handoff.state === "deferred" && !!handoff.revisitOn && handoff.revisitOn <= today;
}

function resolvedOn(handoff: StoredHandoff, today: string): boolean {
  return (
    (handoff.state === "completed" || handoff.state === "discarded") &&
    !!handoff.resolvedAt &&
    localDate(new Date(handoff.resolvedAt)) === today
  );
}

// Ties fall back to ID so the order is stable across renders and tabs.
const byCreated = (a: QueueItem, b: QueueItem) =>
  a.handoff.createdAt.localeCompare(b.handoff.createdAt) ||
  a.handoff.id.localeCompare(b.handoff.id);
const byResolvedDesc = (a: QueueItem, b: QueueItem) =>
  (b.handoff.resolvedAt ?? "").localeCompare(a.handoff.resolvedAt ?? "");

export function buildReview(snapshot: Snapshot, today: string): Review {
  const captureById = new Map(snapshot.captures.map((c) => [c.id, c]));
  const sortedCaptureIds = new Set(snapshot.handoffs.map((h) => h.captureId));

  const items: QueueItem[] = [];
  for (const handoff of snapshot.handoffs) {
    const capture = captureById.get(handoff.captureId);
    if (capture) items.push({ handoff, capture });
  }

  const unsorted = snapshot.captures
    .filter((c) => !sortedCaptureIds.has(c.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  const unsortedDoneToday = items
    .filter((i) => i.handoff.destinationId === null && resolvedOn(i.handoff, today))
    .sort(byResolvedDesc);

  const queues = snapshot.destinations
    .filter((d) => !d.archivedAt)
    .map((destination) => {
      const mine = items.filter((i) => i.handoff.destinationId === destination.id);
      return {
        destination,
        pending: mine
          .filter((i) => i.handoff.state === "pending" || isDue(i.handoff, today))
          .sort(byCreated),
        doneToday: mine.filter((i) => resolvedOn(i.handoff, today)).sort(byResolvedDesc),
      };
    });

  const deferred = items
    .filter((i) => i.handoff.state === "deferred" && !isDue(i.handoff, today))
    .sort((a, b) => (a.handoff.revisitOn ?? "").localeCompare(b.handoff.revisitOn ?? ""));

  const waitingCount =
    unsorted.length + queues.reduce((sum, q) => sum + q.pending.length, 0);

  return { unsorted, unsortedDoneToday, queues, deferred, waitingCount };
}

/** "Written in Weekly Planner" or "Added to Obsidian". */
export function confirmLabel(destination: StoredDestination): string {
  return destination.kind === "paper"
    ? `Written in ${destination.name}`
    : `Added to ${destination.name}`;
}
