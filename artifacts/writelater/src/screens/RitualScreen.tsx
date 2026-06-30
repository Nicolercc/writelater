import React, { useState } from "react";
import { Header } from "../components/Header";
import { RitualGroup } from "../components/RitualGroup";
import { EmptyState } from "../components/EmptyState";
import { CaptureItem, DESTINATION_LABELS, PlannerDestination } from "../types/planner";
import { Sparkles, Copy, Clock, ListChecks } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface RitualScreenProps {
  items: CaptureItem[];
  onUpdateStatus: (id: string, status: "placed") => void;
}

export function RitualScreen({ items, onUpdateStatus }: RitualScreenProps) {
  const [started, setStarted] = useState(false);

  const inboxItems = items.filter((item) => item.status === "inbox");
  const laterItems = items.filter((item) => item.status === "later");
  const placedItems = items.filter((item) => item.status === "placed");
  const toPlaceCount = inboxItems.length;

  const handleCopySummary = () => {
    const summaryText = inboxItems.map((i) => `- ${i.title} (${i.plannerDestination})`).join("\n");
    navigator.clipboard.writeText(summaryText);
    toast("Summary copied to clipboard.", {
      style: {
        background: "hsl(var(--card))",
        color: "hsl(var(--foreground))",
        border: "1px solid hsl(var(--border))",
      }
    });
  };

  const getItemsForDestination = (dest: PlannerDestination) => {
    return inboxItems.filter((i) => i.plannerDestination === dest);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="pb-24"
    >
      <Header
        title="Planner Update Ritual"
        subtitle="A few minutes to move life from your phone back onto paper."
      />

      <div className="px-5 space-y-6 mt-2">
        {toPlaceCount === 0 ? (
          <EmptyState
            icon={Sparkles}
            heading="All caught up"
            subtext="Everything has a place in your planner. Take a breath."
          />
        ) : !started ? (
          <>
            <div className="bg-[#FFF8EF] border border-[#E8DCCF] rounded-2xl p-5">
              <h2 className="font-serif text-xl text-foreground">Tonight's transfer</h2>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span>~{Math.max(1, Math.ceil(toPlaceCount * 0.75))} min</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ListChecks className="w-3.5 h-3.5" />
                  <span>{toPlaceCount} items</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="bg-background rounded-xl p-2 text-center flex flex-col items-center justify-center">
                  <span className="font-serif text-xl text-primary">{toPlaceCount}</span>
                  <span className="text-[10px] text-muted-foreground">ready to write</span>
                </div>
                <div className="bg-background rounded-xl p-2 text-center flex flex-col items-center justify-center">
                  <span className="font-serif text-xl text-primary">{laterItems.length}</span>
                  <span className="text-[10px] text-muted-foreground">can wait</span>
                </div>
                <div className="bg-background rounded-xl p-2 text-center flex flex-col items-center justify-center">
                  <span className="font-serif text-xl text-primary">{placedItems.length}</span>
                  <span className="text-[10px] text-muted-foreground">placed</span>
                </div>
              </div>
            </div>
            
            <p className="mt-5 text-sm text-muted-foreground italic leading-relaxed">
              "You do not have to plan your whole life. Just give each thought a place."
            </p>

            <button
              onClick={() => setStarted(true)}
              className="mt-4 w-full bg-primary text-primary-foreground font-medium py-3.5 rounded-2xl transition-opacity"
            >
              Begin planner time
            </button>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 pt-2"
          >
            {(Object.keys(DESTINATION_LABELS) as PlannerDestination[]).map((dest) => {
              const destItems = getItemsForDestination(dest);
              if (destItems.length === 0) return null;
              
              let title = "";
              if (dest === "today-page") title = "Write on today's page";
              else if (dest === "weekly-spread") title = "Add to weekly spread";
              else if (dest === "monthly-view") title = "Add to monthly view";
              else if (dest === "notes-page") title = "Add to notes page";
              else title = "Let go / Archive";

              return (
                <RitualGroup
                  key={dest}
                  title={title}
                  items={destItems}
                  onItemCheck={(id) => onUpdateStatus(id, "placed")}
                />
              );
            })}

            {toPlaceCount > 0 && (
              <div className="pt-4 border-t border-[#E8DCCF]/50">
                <button
                  onClick={handleCopySummary}
                  className="w-full flex items-center justify-center gap-2 bg-muted text-muted-foreground font-medium py-3.5 rounded-2xl transition-colors hover:bg-muted/80 hover:text-foreground"
                >
                  <Copy className="w-4 h-4" />
                  Copy planner summary
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
