import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CaptureItem } from "../types/planner";
import { Check } from "lucide-react";

interface RitualGroupProps {
  title: string;
  items: CaptureItem[];
  onItemCheck: (id: string) => void;
}

export function RitualGroup({ title, items, onItemCheck }: RitualGroupProps) {
  if (items.length === 0) return null;

  return (
    <div className="mb-6 bg-[var(--surface)] border border-[var(--paper-border)] rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface-elevated)] border-b border-[var(--paper-border)]">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="space-y-0 divide-y divide-[var(--paper-border)]/50">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 1, height: "auto", marginTop: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0, overflow: "hidden" }}
              transition={{ duration: 0.3 }}
              className="px-4 py-3 flex items-center gap-3 bg-[var(--surface)]"
            >
              <button
                type="button"
                onClick={() => onItemCheck(item.id)}
                className="flex-shrink-0 w-5 h-5 rounded-md border border-primary/50 flex items-center justify-center text-transparent hover:text-primary-foreground hover:bg-primary transition-colors"
              >
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{item.title}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
