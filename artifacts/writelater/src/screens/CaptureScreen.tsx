import React, { useState } from "react";
import { motion } from "framer-motion";
import { CaptureItem, ItemType, Timeframe } from "../types/planner";
import { getSuggestedPlacement } from "../lib/placementHeuristic";
import { CaptureComposer } from "../components/CaptureComposer";
import { PlannerInboxSummary } from "../components/PlannerInboxSummary";
import { RecentCaptureCard } from "../components/RecentCaptureCard";

interface CaptureScreenProps {
  onSave: (item: Omit<CaptureItem, "id" | "createdAt" | "status">) => void;
  items: CaptureItem[];
}

export function CaptureScreen({ onSave, items }: CaptureScreenProps) {
  const [title, setTitle] = useState("");
  const [selectedType, setSelectedType] = useState<ItemType | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState<string | undefined>();

  const dateLine =
    new Date().toLocaleDateString("en-US", { weekday: "long" }) +
    " · Planner away mode";

  const recentItems = items.filter((i) => i.status === "inbox").slice(0, 3);

  const handleSave = () => {
    if (!title.trim()) return;

    const type = selectedType ?? "note";
    const timeframe = selectedTimeframe ?? "later";
    const { destination } = getSuggestedPlacement({
      type: selectedType,
      timeframe: selectedTimeframe,
      title,
    });

    onSave({
      title: title.trim(),
      type,
      timeframe,
      plannerDestination: destination,
    });

    setTitle("");
    setSelectedType(null);
    setSelectedTimeframe(null);
    setConfirmation("Saved. It's waiting for planner time.");
    setTimeout(() => setConfirmation(undefined), 2000);
  };

  const handleClear = () => {
    setTitle("");
    setSelectedType(null);
    setSelectedTimeframe(null);
    setConfirmation(undefined);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="pb-24"
    >
      {/* A. Header */}
      <div className="px-5 pt-5 pb-2">
        <div className="text-xs text-muted-foreground tracking-wide mb-2">
          {dateLine}
        </div>
        <h1 className="font-serif text-2xl font-medium text-foreground leading-snug">
          What do you need to write later?
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          Catch the thought now. We'll help you place it later.
        </p>
      </div>

      {/* B. Capture composer (capture → chips → placement → CTA) */}
      <CaptureComposer
        title={title}
        selectedType={selectedType}
        selectedTimeframe={selectedTimeframe}
        onTitleChange={setTitle}
        onTypeSelect={setSelectedType}
        onTimeframeSelect={setSelectedTimeframe}
        onSave={handleSave}
        onClear={handleClear}
        confirmation={confirmation}
      />

      {/* C. Planner inbox summary — below CTA */}
      <div className="mx-5 mt-5">
        <PlannerInboxSummary items={items} />
      </div>

      {/* D. Recently captured */}
      {recentItems.length > 0 && (
        <div className="mx-5 mt-5 mb-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Recently captured
          </div>
          <div className="space-y-2">
            {recentItems.map((item) => (
              <RecentCaptureCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
