import React from "react";
import { CaptureItem } from "../types/planner";
import { PlannerDestinationBadge } from "./PlannerDestinationBadge";

interface RecentCaptureCardProps {
  item: CaptureItem;
}

export function RecentCaptureCard({ item }: RecentCaptureCardProps) {
  return (
    <div className="relative bg-[var(--surface-elevated)] border border-[var(--paper-border)] rounded-xl px-3 py-2.5 pl-3.5 overflow-hidden">
      <span
        className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-[var(--accent-clay)]/50"
        aria-hidden
      />
      <div className="text-sm text-foreground/90 font-medium truncate leading-snug">
        {item.title}
      </div>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground capitalize">
          {item.type}
        </span>
        <PlannerDestinationBadge destination={item.plannerDestination} />
      </div>
    </div>
  );
}
