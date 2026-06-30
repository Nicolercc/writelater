import React from "react";
import { PenLine, Inbox, Sparkles, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabType = "capture" | "inbox" | "ritual" | "planner";

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs = [
    { id: "capture" as const, label: "Capture", icon: PenLine },
    { id: "inbox" as const, label: "Inbox", icon: Inbox },
    { id: "ritual" as const, label: "Ritual", icon: Sparkles },
    { id: "planner" as const, label: "Planner", icon: BookOpen },
  ];

  return (
    <div 
      className="flex items-center justify-around bg-[var(--surface)]/80 backdrop-blur-sm pb-safe pt-2 px-4 relative"
      style={{
        borderTop: "1px solid #E8DCCF",
        boxShadow: "0 -4px 24px -8px rgba(80,50,30,0.08)"
      }}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            data-testid={`nav-${tab.id}`}
            className={cn(
              "flex flex-col items-center justify-center min-h-[56px] w-16 gap-1 transition-colors duration-200",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground/70"
            )}
          >
            <div className="relative flex flex-col items-center">
              {isActive && (
                <span className="absolute -top-3 w-6 h-1 bg-primary rounded-full" />
              )}
              <Icon className="w-5 h-5 mt-1" strokeWidth={isActive ? 2.5 : 2} />
            </div>
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
