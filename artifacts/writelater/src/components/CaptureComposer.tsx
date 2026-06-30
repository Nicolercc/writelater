import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CaptureItem, ItemType, Timeframe } from "../types/planner";
import { getSuggestedPlacement } from "../lib/placementHeuristic";
import { ChipGroup } from "./ChipGroup";
import { SuggestedPlacementCard } from "./SuggestedPlacementCard";
import { cn } from "@/lib/utils";

const CAPTURE_TYPES: ItemType[] = [
  "task",
  "event",
  "note",
  "errand",
  "money",
  "travel",
  "reflection",
];

const TYPE_OPTIONS = CAPTURE_TYPES.map((type) => ({
  value: type,
  label: type.charAt(0).toUpperCase() + type.slice(1),
}));

const TIMEFRAME_OPTIONS: Array<{ value: Timeframe; label: string }> = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this-week", label: "This Week" },
  { value: "later", label: "Later" },
];

interface CaptureComposerProps {
  title: string;
  selectedType: CaptureItem["type"] | null;
  selectedTimeframe: CaptureItem["timeframe"] | null;
  onTitleChange: (value: string) => void;
  onTypeSelect: (type: CaptureItem["type"]) => void;
  onTimeframeSelect: (timeframe: CaptureItem["timeframe"]) => void;
  onSave: () => void;
  onClear: () => void;
  confirmation?: string;
}

export function CaptureComposer({
  title,
  selectedType,
  selectedTimeframe,
  onTitleChange,
  onTypeSelect,
  onTimeframeSelect,
  onSave,
  onClear,
  confirmation,
}: CaptureComposerProps) {
  const placement = getSuggestedPlacement({
    type: selectedType,
    timeframe: selectedTimeframe,
    title,
  });

  const canSave = title.trim().length > 0;

  return (
    <div className="mx-5 space-y-4">
      {/* Quick capture card */}
      <div className="bg-[var(--surface)] border border-[var(--paper-border)] rounded-2xl p-4">
        <label
          htmlFor="capture-title"
          className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block"
        >
          Quick capture
        </label>
        <textarea
          id="capture-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Buy travel adapter before Spain…"
          className="min-h-[120px] bg-transparent border-none outline-none resize-none text-foreground text-base leading-relaxed placeholder:text-muted-foreground/50 w-full focus:ring-2 focus:ring-primary/30 focus:ring-offset-0 rounded-md"
        />
        <p className="text-xs text-muted-foreground italic mt-2">
          Messy is fine. Sorting comes later.
        </p>
      </div>

      {/* Type chips */}
      <ChipGroup
        label="What is this?"
        options={TYPE_OPTIONS}
        selected={selectedType}
        onSelect={(value) => onTypeSelect(value as ItemType)}
      />

      {/* Timeframe chips — single section only */}
      <ChipGroup
        label="When does it matter?"
        options={TIMEFRAME_OPTIONS}
        selected={selectedTimeframe}
        onSelect={(value) => onTimeframeSelect(value as Timeframe)}
      />

      {/* Suggested placement — always visible */}
      <SuggestedPlacementCard
        destinationLabel={placement.label}
        reason={placement.reason}
      />

      {/* Save / confirmation */}
      <div className="flex flex-col pt-1">
        <AnimatePresence mode="wait">
          {confirmation ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-[var(--accent-sage)]/15 border border-[var(--accent-sage)]/30 rounded-2xl px-4 py-3.5 flex items-center justify-center"
              role="status"
            >
              <span className="text-sm text-foreground font-medium">
                {confirmation}
              </span>
            </motion.div>
          ) : (
            <motion.button
              key="save"
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className={cn(
                "w-full py-3.5 rounded-2xl font-medium transition-all",
                canSave
                  ? "bg-primary text-primary-foreground shadow-sm hover:opacity-95 active:scale-[0.99]"
                  : "bg-primary/60 text-primary-foreground/80 opacity-50 cursor-not-allowed",
              )}
            >
              Save to planner inbox
            </motion.button>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={onClear}
          className="text-center text-xs text-muted-foreground mt-3 p-2 hover:text-foreground transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
