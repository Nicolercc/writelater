import React from "react";
import { PenLine, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabType = "capture" | "review";

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  /** Shown on the Review tab when items are waiting. */
  waitingCount: number;
}

export function BottomNav({ activeTab, onTabChange, waitingCount }: BottomNavProps) {
  const tabs = [
    { id: "capture" as const, label: "Capture", icon: PenLine },
    { id: "review" as const, label: "Review", icon: ListChecks },
  ];

  return (
    <nav
      aria-label="Main"
      className="flex items-center justify-around bg-[var(--surface)]/80 backdrop-blur-sm pb-safe pt-2 px-4 relative border-t border-[var(--paper-border)] shadow-[0_-4px_24px_-8px_rgba(80,50,30,0.08)]"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const showCount = tab.id === "review" && waitingCount > 0;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            data-testid={`nav-${tab.id}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-col items-center justify-center min-h-[56px] w-24 gap-1 transition-colors duration-200",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground/70",
            )}
          >
            <div className="relative flex flex-col items-center">
              {isActive && <span className="absolute -top-3 w-6 h-1 bg-primary rounded-full" aria-hidden />}
              <Icon className="w-5 h-5 mt-1" strokeWidth={isActive ? 2.5 : 2} aria-hidden />
            </div>
            <span className="text-xs font-medium">
              {tab.label}
              {showCount && <span className="ml-1">({waitingCount})</span>}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
