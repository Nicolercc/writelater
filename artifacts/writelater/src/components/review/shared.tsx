import React from "react";
import { ChevronLeft } from "lucide-react";
import type { StoredCapture, StoredDestination } from "../../storage/db";

/** Building blocks shared by the Review views. */

export const HEADING_ID = "review-view-heading";

export const cardClass = "bg-[var(--surface)] border border-[var(--paper-border)] rounded-2xl p-4";
export const primaryButton =
  "min-h-[44px] px-4 rounded-xl bg-primary text-primary-foreground font-medium text-sm";
export const secondaryButton =
  "min-h-[44px] px-3 rounded-xl border border-[var(--paper-border)] bg-background text-foreground text-sm";

/** The view's h1. Focus moves here on navigation and when a list empties. */
export function ViewHeading({ title, subtitle }: { title: React.ReactNode; subtitle?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h1
        id={HEADING_ID}
        tabIndex={-1}
        className="font-serif text-2xl font-medium text-foreground leading-snug focus:outline-none"
      >
        {title}
      </h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 min-h-[44px] -ml-2 px-2 text-sm text-foreground"
    >
      <ChevronLeft className="w-4 h-4" aria-hidden />
      Review
    </button>
  );
}

/** Plain-text capture body. Never rendered as HTML. */
export function CaptureText({ capture }: { capture: StoredCapture }) {
  return (
    <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
      {capture.text}
    </p>
  );
}

export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function destinationLabel(d: StoredDestination): string {
  return d.section ? `${d.name} · ${d.section}` : d.name;
}

/** ID of the control to focus after removing items[index] from a list. */
export function nextIdAfter<T>(items: T[], index: number, idOf: (item: T) => string): string | null {
  const neighbour = items[index + 1] ?? items[index - 1];
  return neighbour ? idOf(neighbour) : null;
}
