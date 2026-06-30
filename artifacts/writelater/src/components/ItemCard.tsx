import React from "react";
import { CaptureItem, ItemStatus } from "../types/planner";
import { PlannerDestinationBadge } from "./PlannerDestinationBadge";
import { cn } from "@/lib/utils";

interface ItemCardProps {
  item: CaptureItem;
  onUpdateStatus?: (id: string, status: ItemStatus) => void;
}

export function ItemCard({ item, onUpdateStatus }: ItemCardProps) {
  return (
    <div
      className={cn(
        "bg-[#FFFCF7] rounded-2xl p-4 shadow-sm border border-[#E8DCCF] flex flex-col transition-all",
        item.isUrgent && "border-l-[3px] border-l-[#B76558]"
      )}
    >
      <div className="flex items-start">
        <h4 className="font-medium text-foreground text-[15px] leading-snug flex-1">
          {item.title}
        </h4>
        {item.isUrgent && (
          <span className="w-1.5 h-1.5 bg-[#B76558] rounded-full ml-2 mt-1.5 flex-shrink-0" />
        )}
      </div>
      
      {item.note && (
        <p className="mt-1.5 text-sm text-muted-foreground line-clamp-1">{item.note}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="capitalize bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded-md font-medium">
          {item.type}
        </span>
        <span className="capitalize bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded-md font-medium">
          {item.timeframe.replace("-", " ")}
        </span>
        <PlannerDestinationBadge destination={item.plannerDestination} />
      </div>

      {onUpdateStatus && (
        <div className="mt-3 pt-3 border-t border-[#E8DCCF]/60 flex items-center gap-2">
          <button
            onClick={() => onUpdateStatus(item.id, "placed")}
            className="text-xs font-medium px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
          >
            Place
          </button>
          <button
            onClick={() => onUpdateStatus(item.id, "done")}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            Done
          </button>
          <button
            onClick={() => onUpdateStatus(item.id, "later")}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-muted transition-colors ml-auto"
          >
            Can wait
          </button>
        </div>
      )}
    </div>
  );
}
