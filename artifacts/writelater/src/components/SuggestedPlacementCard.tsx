import React from "react";
import { BookOpen } from "lucide-react";

interface SuggestedPlacementCardProps {
  destinationLabel: string;
  reason: string;
}

export function SuggestedPlacementCard({
  destinationLabel,
  reason,
}: SuggestedPlacementCardProps) {
  return (
    <div className="bg-[var(--surface-elevated)] border border-[var(--paper-border)] rounded-xl px-4 py-3 flex items-start gap-3 border-l-[3px] border-l-[var(--accent-sage)]">
      <BookOpen
        className="w-4 h-4 text-[var(--accent-sage)] flex-shrink-0 mt-0.5"
        aria-hidden
      />
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Likely planner home
        </span>
        <span className="text-sm font-medium text-foreground mt-0.5">
          {destinationLabel}
        </span>
        <span className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {reason}
        </span>
      </div>
    </div>
  );
}
