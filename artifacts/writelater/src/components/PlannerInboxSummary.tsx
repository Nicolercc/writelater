import React from "react";
import { CaptureItem } from "../types/planner";

interface PlannerInboxSummaryProps {
  items: CaptureItem[];
}

export function PlannerInboxSummary({ items }: PlannerInboxSummaryProps) {
  const inboxItems = items.filter((i) => i.status === "inbox");
  const todayCount = inboxItems.filter((i) => i.timeframe === "today").length;
  const weekCount = inboxItems.filter((i) => i.timeframe === "this-week").length;
  const notesCount = inboxItems.filter(
    (i) => i.type === "note" || i.type === "reflection",
  ).length;

  return (
    <div className="bg-[var(--surface-elevated)] border border-[var(--paper-border)] rounded-2xl p-4">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Planner inbox
      </div>
      <div className="flex gap-4 items-center">
        <div className="flex flex-col">
          <span className="font-serif text-3xl text-primary leading-none">
            {inboxItems.length}
          </span>
          <span className="text-xs text-muted-foreground mt-1">
            thoughts waiting
          </span>
        </div>
        <div className="w-px h-10 bg-[var(--paper-border)]/60 mx-1" />
        <div className="flex flex-col gap-1.5 justify-center flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full bg-[var(--accent-clay)]"
              aria-hidden
            />
            <span className="text-xs text-muted-foreground">
              {todayCount} for today
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full bg-[var(--accent-sage)]"
              aria-hidden
            />
            <span className="text-xs text-muted-foreground">
              {weekCount} for this week
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full bg-[var(--accent-butter)]"
              aria-hidden
            />
            <span className="text-xs text-muted-foreground">
              {notesCount} {notesCount === 1 ? "note" : "notes"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
