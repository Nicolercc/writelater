import React, { useState, useEffect } from "react";
import { CaptureItem, ItemType, Timeframe, PlannerDestination, DESTINATION_LABELS } from "../types/planner";
import { Chip } from "../components/Chip";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface CaptureScreenProps {
  onSave: (item: Omit<CaptureItem, "id" | "createdAt" | "status">) => void;
  items: CaptureItem[];
}

const ITEM_TYPES: ItemType[] = ["task", "event", "note", "errand", "money", "travel", "reflection"];
const TIMEFRAMES: Timeframe[] = ["today", "tomorrow", "this-week", "later"];

function getDestinationFromInputs(type: ItemType | null, timeframe: Timeframe | null): { dest: PlannerDestination; reason: string } {
  if (timeframe === "today" || timeframe === "tomorrow") return { dest: "today-page", reason: "Looks like something for today's page." };
  if (timeframe === "this-week") return { dest: "weekly-spread", reason: "This week's spread would hold it well." };
  if (type === "reflection" || type === "note") return { dest: "notes-page", reason: "This feels like a notes page item." };
  if (type === "event") return { dest: "monthly-view", reason: "Events often belong in the monthly view." };
  if (type === "money") return { dest: "weekly-spread", reason: "Money reminders fit the weekly spread." };
  if (type === "travel") return { dest: "notes-page", reason: "Travel thoughts work well in the notes section." };
  return { dest: "notes-page", reason: "We'll sort this when you're back at your planner." };
}

export function CaptureScreen({ onSave, items }: CaptureScreenProps) {
  const [title, setTitle] = useState("");
  const [selectedType, setSelectedType] = useState<ItemType | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const dateLine = new Date().toLocaleDateString('en-US', { weekday: 'long' }) + ' · Planner away mode';
  const inboxCount = items.filter(i => i.status === "inbox").length;
  
  const todayCount = items.filter(i => i.status === "inbox" && i.timeframe === "today").length;
  const weekCount = items.filter(i => i.status === "inbox" && i.timeframe === "this-week").length;
  const notesCount = items.filter(i => i.status === "inbox" && (i.type === "note" || i.type === "reflection")).length;

  const handleSave = () => {
    if (!title.trim()) return;

    const type = selectedType || "note";
    const timeframe = selectedTimeframe || "later";
    const { dest } = getDestinationFromInputs(selectedType, selectedTimeframe);

    onSave({
      title: title.trim(),
      type,
      timeframe,
      plannerDestination: dest,
    });

    setTitle("");
    setSelectedType(null);
    setSelectedTimeframe(null);
    
    setShowConfirmation(true);
    setTimeout(() => setShowConfirmation(false), 2000);
  };

  const showPreview = selectedType !== null || selectedTimeframe !== null || title.trim().length > 3;
  const preview = showPreview ? getDestinationFromInputs(selectedType, selectedTimeframe) : null;
  const recentItems = items.filter(i => i.status === "inbox").slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="pb-24"
    >
      {/* A. Header zone */}
      <div className="px-5 pt-5 pb-3">
        <div className="text-xs text-muted-foreground tracking-wide mb-2">{dateLine}</div>
        <h1 className="font-serif text-2xl font-medium text-foreground leading-snug">What do you need to write later?</h1>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          Catch the thought now. We'll help you place it when you're back with your planner.
        </p>
      </div>

      {/* B. Inbox summary card */}
      <div className="mx-5 mt-4 bg-[#FFF8EF] border border-[#E8DCCF] rounded-2xl p-4">
        <div className="flex gap-4 items-center">
          <div className="flex flex-col">
            <span className="font-serif text-3xl text-primary leading-none">{inboxCount}</span>
            <span className="text-xs text-muted-foreground mt-1">in planner inbox</span>
          </div>
          <div className="w-px h-10 bg-[#E8DCCF]/50 mx-2"></div>
          <div className="flex flex-col gap-1.5 justify-center flex-1">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D98E76]"></span>
              <span className="text-xs text-muted-foreground">{todayCount} for today</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A8B8A0]"></span>
              <span className="text-xs text-muted-foreground">{weekCount} for this week</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F2D98D]"></span>
              <span className="text-xs text-muted-foreground">{notesCount} notes</span>
            </div>
          </div>
        </div>
      </div>

      {/* C. Capture card */}
      <div className="mx-5 mt-5 bg-[#FFFCF7] border border-[#E8DCCF] rounded-2xl p-4 shadow-sm">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Quick capture</div>
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Buy travel adapter before Spain…"
          className="min-h-[100px] bg-transparent border-none outline-none resize-none text-foreground text-base leading-relaxed placeholder:text-muted-foreground/50 w-full focus:outline-none"
        />
        <div className="text-xs text-muted-foreground italic mt-2">Messy is fine. Sorting comes later.</div>
      </div>

      {/* D. Chip sections */}
      <div className="mx-5 mt-5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">What is this?</div>
        <div className="flex flex-wrap gap-2">
          {ITEM_TYPES.map(type => (
            <Chip
              key={type}
              selected={selectedType === type}
              onClick={() => setSelectedType(type)}
              className="capitalize"
            >
              {type}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mx-5 mt-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">When does it matter?</div>
        <div className="flex flex-wrap gap-2">
          {TIMEFRAMES.map(tf => (
            <Chip
              key={tf}
              selected={selectedTimeframe === tf}
              onClick={() => setSelectedTimeframe(tf)}
              className="capitalize"
            >
              {tf.replace("-", " ")}
            </Chip>
          ))}
        </div>
      </div>

      {/* E. Suggested placement preview */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="mx-5 overflow-hidden"
          >
            <div className="bg-[#A8B8A0]/10 border border-[#A8B8A0]/30 rounded-xl px-4 py-3 flex items-center gap-3">
              <BookOpen className="w-4 h-4 text-[#A8B8A0] flex-shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Likely planner home</span>
                <span className="text-sm font-medium text-foreground">{DESTINATION_LABELS[preview.dest]}</span>
                <span className="text-xs text-muted-foreground italic mt-0.5">{preview.reason}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* F. CTA buttons */}
      <div className="mx-5 mt-5 flex flex-col">
        <AnimatePresence mode="wait">
          {showConfirmation ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-[#A8B8A0]/20 border border-[#A8B8A0]/40 rounded-2xl px-4 py-3.5 flex items-center justify-center gap-2"
            >
              <span className="text-sm text-foreground font-medium">Saved. It's waiting for planner time.</span>
            </motion.div>
          ) : (
            <motion.button
              key="save"
              onClick={handleSave}
              disabled={!title.trim()}
              className={cn(
                "w-full bg-primary text-primary-foreground py-3.5 rounded-2xl font-medium transition-all",
                !title.trim() && "opacity-40 cursor-not-allowed"
              )}
            >
              Save to planner inbox
            </motion.button>
          )}
        </AnimatePresence>
        <button
          onClick={() => {
            setTitle("");
            setSelectedType(null);
            setSelectedTimeframe(null);
          }}
          className="text-center text-xs text-muted-foreground mt-3 p-2"
        >
          Clear
        </button>
      </div>

      {/* G. Recent captures strip */}
      {recentItems.length > 0 && (
        <div className="mx-5 mt-6 mb-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Recently captured</div>
          <div className="space-y-2">
            {recentItems.map(item => (
              <div key={item.id} className="bg-card border border-card-border rounded-xl px-3 py-2.5">
                <div className="text-sm text-foreground font-medium truncate">{item.title}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground capitalize">{item.type}</span>
                  <span className="text-[10px] text-muted-foreground border px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                    {DESTINATION_LABELS[item.plannerDestination]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </motion.div>
  );
}
