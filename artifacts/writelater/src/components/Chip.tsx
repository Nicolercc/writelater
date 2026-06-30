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
        "inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-150 cursor-pointer whitespace-nowrap select-none",
        selected
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-muted/60 text-muted-foreground border-transparent hover:border-border hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
