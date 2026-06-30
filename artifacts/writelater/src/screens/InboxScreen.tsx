import React, { useState } from "react";
import { Header } from "../components/Header";
import { ItemCard } from "../components/ItemCard";
import { Chip } from "../components/Chip";
import { EmptyState } from "../components/EmptyState";
import { CaptureItem, ItemStatus } from "../types/planner";
import { Inbox } from "lucide-react";
import { motion } from "framer-motion";

interface InboxScreenProps {
  items: CaptureItem[];
  onUpdateStatus: (id: string, status: ItemStatus) => void;
}

type FilterType = "All" | "Today" | "This Week" | "Later" | "Needs Placement";

export function InboxScreen({ items, onUpdateStatus }: InboxScreenProps) {
  const [filter, setFilter] = useState<FilterType>("All");

  const inboxItems = items.filter((item) => item.status === "inbox");

  const filteredItems = inboxItems.filter((item) => {
    if (filter === "All") return true;
    if (filter === "Today") return item.timeframe === "today";
    if (filter === "This Week") return item.timeframe === "this-week";
    if (filter === "Later") return item.timeframe === "later";
    if (filter === "Needs Placement") return true;
    return true;
  });

  const FILTERS: FilterType[] = ["All", "Today", "This Week", "Later", "Needs Placement"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="pb-24 flex flex-col h-full"
    >
      <Header
        title="Inbox"
        subtitle="Unsorted thoughts waiting for planner time."
      />

      <div className="px-5 mb-5 mx-0">
        <div className="bg-card border border-card-border rounded-2xl p-4">
          <div className="grid grid-cols-3 divide-x divide-border/50">
            <div className="flex flex-col items-center justify-center">
              <span className="font-serif text-2xl text-foreground leading-none">{inboxItems.length}</span>
              <span className="text-xs text-muted-foreground mt-1">waiting</span>
            </div>
            <div className="flex flex-col items-center justify-center">
              <span className="font-serif text-2xl text-foreground leading-none">{inboxItems.filter(i => i.timeframe === "today").length}</span>
              <span className="text-xs text-muted-foreground mt-1">for today</span>
            </div>
            <div className="flex flex-col items-center justify-center">
              <span className="font-serif text-2xl text-foreground leading-none">{inboxItems.filter(i => i.timeframe === "later").length}</span>
              <span className="text-xs text-muted-foreground mt-1">can wait</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mb-4">
        <div className="flex flex-wrap gap-2 px-1">
          {FILTERS.map((f) => (
            <Chip
              key={f}
              selected={filter === f}
              onClick={() => setFilter(f)}
              className="whitespace-nowrap"
            >
              {f}
            </Chip>
          ))}
        </div>
      </div>

      <div className="px-5 flex-1">
        {filteredItems.length === 0 ? (
          <EmptyState
            icon={Inbox}
            heading="Nothing waiting."
            subtext="Your planner brain is clear. Go enjoy your day."
          />
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
              >
                <ItemCard item={item} onUpdateStatus={onUpdateStatus} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
