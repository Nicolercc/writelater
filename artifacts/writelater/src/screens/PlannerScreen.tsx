import React, { useState } from "react";
import { Header } from "../components/Header";
import { PaperCard } from "../components/PaperCard";
import { CaptureItem } from "../types/planner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PlannerScreenProps {
  items: CaptureItem[];
}

type TabType = "Today" | "Week" | "Month" | "Notes";
const TABS: TabType[] = ["Today", "Week", "Month", "Notes"];

export function PlannerScreen({ items }: PlannerScreenProps) {
  const [activeTab, setActiveTab] = useState<TabType>("Today");

  const getItems = (dest: string) => items.filter((i) => i.plannerDestination === dest && i.status !== "done" && i.status !== "archive");

  const todayItems = getItems("today-page");
  const weekItems = getItems("weekly-spread");
  const monthItems = getItems("monthly-view");
  const notesItems = getItems("notes-page");

  const renderTodayTab = () => (
    <div className="space-y-6">
      <PaperCard ruled className="p-6 min-h-[500px] flex flex-col gap-6">
        <h3 className="font-serif text-xl font-medium text-foreground mb-2 text-center border-b border-border/50 pb-4">
          Today
        </h3>
        
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Top 3</h4>
          <ul className="space-y-3">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex gap-2 items-end text-sm text-foreground border-b border-border/30 pb-1">
                <span className="w-3 h-3 rounded border border-primary mb-1 inline-block"></span>
                <span className="flex-1"></span>
              </li>
            ))}
          </ul>
        </div>
        
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Appointments</h4>
          <ul className="space-y-3">
            {[8, 12, 16].map((hour) => (
              <li key={hour} className="flex gap-2 items-end text-sm text-foreground border-b border-border/30 pb-1">
                <span className="text-xs text-muted-foreground w-12">{hour > 12 ? hour - 12 : hour}:00</span>
                <span className="flex-1"></span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">To Write</h4>
          {todayItems.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nothing captured for today.</p>
          ) : (
            <ul className="space-y-2">
              {todayItems.map((item) => (
                <li key={item.id} className="flex gap-2 items-start text-sm text-foreground">
                  <span className="text-primary mt-0.5">•</span>
                  <span className={cn(item.status === "placed" && "line-through text-muted-foreground")}>
                    {item.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PaperCard>
    </div>
  );

  const renderWeekTab = () => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return (
      <div className="space-y-3">
        <PaperCard className="p-4 mb-4">
          <h4 className="text-sm font-medium text-foreground mb-3">Captured for this week</h4>
          {weekItems.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Empty.</p>
          ) : (
            <ul className="space-y-2">
              {weekItems.map((item) => (
                <li key={item.id} className="text-sm text-foreground flex gap-2">
                  <span className="text-muted-foreground">-</span>
                  <span className={cn(item.status === "placed" && "line-through text-muted-foreground")}>
                    {item.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PaperCard>

        <div className="grid grid-cols-1 gap-2">
          {days.map((day) => (
            <PaperCard key={day} className="p-3">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                {day}
              </div>
              <div className="h-8 border-b border-border/30"></div>
            </PaperCard>
          ))}
        </div>
      </div>
    );
  };

  const renderMonthTab = () => (
    <PaperCard className="p-4 min-h-[300px]">
      <h3 className="font-serif text-lg font-medium text-foreground mb-4">Month Overview</h3>
      {monthItems.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No items for the monthly view.</p>
      ) : (
        <ul className="space-y-3">
          {monthItems.map((item) => (
            <li key={item.id} className="text-sm text-foreground flex items-center gap-2 border-b border-border/30 pb-2">
              <span className="w-2 h-2 rounded-full border border-primary"></span>
              <span className={cn(item.status === "placed" && "line-through text-muted-foreground")}>
                {item.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PaperCard>
  );

  const renderNotesTab = () => {
    const grouped: Record<string, CaptureItem[]> = {};
    notesItems.forEach((item) => {
      if (!grouped[item.type]) grouped[item.type] = [];
      grouped[item.type].push(item);
    });

    return (
      <div className="space-y-4">
        {Object.keys(grouped).length === 0 ? (
          <PaperCard className="p-6 text-center">
            <p className="text-sm text-muted-foreground italic">Notebook is empty.</p>
          </PaperCard>
        ) : (
          Object.entries(grouped).map(([type, items]) => (
            <PaperCard key={type} className="overflow-hidden border-l-[4px] border-l-primary/40" ruled>
              <div className="px-4 py-2 bg-muted/30 border-b border-border/50">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground capitalize">
                  {type}
                </h4>
              </div>
              <ul className="p-4 space-y-3">
                {items.map((item) => (
                  <li key={item.id} className="text-sm text-foreground leading-relaxed">
                    <span className={cn(item.status === "placed" && "text-muted-foreground")}>
                      {item.title}
                    </span>
                    {item.note && <div className="text-xs text-muted-foreground mt-1 ml-2 border-l-2 border-border pl-2">{item.note}</div>}
                  </li>
                ))}
              </ul>
            </PaperCard>
          ))
        )}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="pb-24"
    >
      <Header
        title="Planner"
        subtitle="Your digital staging area before ink."
      />

      <div className="px-4 mt-2">
        <div className="bg-muted/40 rounded-2xl p-1 grid grid-cols-4 gap-1 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "text-sm font-medium py-1.5 rounded-xl transition-colors",
                activeTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {activeTab === "Today" && renderTodayTab()}
          {activeTab === "Week" && renderWeekTab()}
          {activeTab === "Month" && renderMonthTab()}
          {activeTab === "Notes" && renderNotesTab()}
        </div>
      </div>
    </motion.div>
  );
}
