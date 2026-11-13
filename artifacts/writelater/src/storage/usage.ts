import type { StoredEvent, UsageEventType, WriteLaterDb } from "./db";
import { localDate } from "../lib/review";

export const USAGE_SUMMARY_FORMAT = "writelater-usage-summary";

const CONFIRM_TYPES: UsageEventType[] = ["handoff_confirmed_paper", "handoff_confirmed_digital"];

function newEventId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Records one usage event. Holds a type and a time only. */
export async function logEvent(
  db: WriteLaterDb,
  type: UsageEventType,
  now: Date = new Date(),
): Promise<void> {
  const tx = db.transaction("events", "readwrite");
  await tx.store.add({ id: newEventId(), type, at: now.toISOString() });
  await tx.done;
}

export async function listEvents(db: WriteLaterDb): Promise<StoredEvent[]> {
  return db.getAllFromIndex("events", "by_at");
}

export interface UsageSummary {
  format: typeof USAGE_SUMMARY_FORMAT;
  version: 1;
  /** Local date the summary was made. */
  generatedOn: string;
  firstDay: string | null;
  lastDay: string | null;
  /** Days with any recorded activity. */
  activeDays: number;
  /** Days with at least one confirmed transfer (a completed review session). */
  reviewDays: number;
  /** Distinct calendar weeks (Monday start) with a completed review session. */
  reviewWeeks: number;
  totals: Partial<Record<UsageEventType, number>>;
  /** Per local day: counts only, no times of day. */
  days: Array<{ day: string; counts: Partial<Record<UsageEventType, number>> }>;
}

/** Monday of the week containing a local YYYY-MM-DD date. */
function weekOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const offset = (date.getDay() + 6) % 7;
  return localDate(new Date(y, m - 1, d - offset));
}

/**
 * Aggregates events into counts per local day. Contains no writing, titles,
 * destination names, or times of day, so participants can share it.
 */
export function buildUsageSummary(events: StoredEvent[], now: Date = new Date()): UsageSummary {
  const byDay = new Map<string, Partial<Record<UsageEventType, number>>>();
  const totals: Partial<Record<UsageEventType, number>> = {};

  for (const event of events) {
    const day = localDate(new Date(event.at));
    const counts = byDay.get(day) ?? {};
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    byDay.set(day, counts);
    totals[event.type] = (totals[event.type] ?? 0) + 1;
  }

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, counts]) => ({ day, counts }));
  const reviewDayList = days
    .filter(({ counts }) => CONFIRM_TYPES.some((t) => (counts[t] ?? 0) > 0))
    .map(({ day }) => day);

  return {
    format: USAGE_SUMMARY_FORMAT,
    version: 1,
    generatedOn: localDate(now),
    firstDay: days[0]?.day ?? null,
    lastDay: days[days.length - 1]?.day ?? null,
    activeDays: days.length,
    reviewDays: reviewDayList.length,
    reviewWeeks: new Set(reviewDayList.map(weekOf)).size,
    totals,
    days,
  };
}
