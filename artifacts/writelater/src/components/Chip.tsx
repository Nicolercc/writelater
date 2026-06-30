import React from "react";
import { cn } from "@/lib/utils";

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  children: React.ReactNode;
}

export function Chip({ selected, children, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-full text-sm font-medium border transition-all duration-150 cursor-pointer whitespace-nowrap select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1",
        selected
          ? "bg-primary/12 text-foreground border-primary/45"
          : "bg-muted/50 text-muted-foreground border-transparent hover:border-[var(--paper-border)] hover:text-foreground/80",
        className,
      )}
      {...props}
    >
      {selected && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}
