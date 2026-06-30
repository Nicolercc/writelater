import React from "react";
import { PlannerDestination } from "../types/planner";
import { DESTINATION_LABELS } from "../lib/placementHeuristic";
import { cn } from "@/lib/utils";

const DEST_STYLES: Record<PlannerDestination, string> = {
  "today-page":
    "bg-primary/15 text-[var(--accent-clay)] border-primary/30",
  "weekly-spread":
    "bg-[var(--accent-sage)]/15 text-[#7A9E7A] border-[var(--accent-sage)]/30",
  "monthly-view":
    "bg-[var(--accent-lavender)]/15 text-[#9B7EC8] border-[var(--accent-lavender)]/30",
  "notes-page":
    "bg-[var(--accent-butter)]/20 text-[#A68920] border-[var(--accent-butter)]/40",
  archive: "bg-muted text-muted-foreground border-border",
};

export function PlannerDestinationBadge({ destination }: { destination: PlannerDestination }) {
  return (
    <span
      className={cn(
        "text-[10px] font-medium px-2 py-0.5 rounded-md border inline-flex items-center uppercase tracking-wider",
        DEST_STYLES[destination]
      )}
    >
      {DESTINATION_LABELS[destination]}
    </span>
  );
}
