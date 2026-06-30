import React from "react";
import { PlannerDestination, DESTINATION_LABELS } from "../types/planner";
import { cn } from "@/lib/utils";

const DEST_STYLES: Record<PlannerDestination, string> = {
  "today-page": "bg-[#D98E76]/15 text-[#B76558] border-[#D98E76]/30",
  "weekly-spread": "bg-[#A8B8A0]/15 text-[#7A9E7A] border-[#A8B8A0]/30",
  "monthly-view": "bg-[#C9B8D9]/15 text-[#9B7EC8] border-[#C9B8D9]/30",
  "notes-page": "bg-[#F2D98D]/20 text-[#A68920] border-[#F2D98D]/40",
  "archive": "bg-muted text-muted-foreground border-border",
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
