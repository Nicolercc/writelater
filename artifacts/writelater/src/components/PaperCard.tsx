import React from "react";
import { cn } from "@/lib/utils";

interface PaperCardProps extends React.HTMLAttributes<HTMLDivElement> {
  ruled?: boolean;
}

export function PaperCard({ children, ruled, className, ...props }: PaperCardProps) {
  return (
    <div
      className={cn(
        "bg-[var(--surface)] rounded-lg shadow-sm border border-[var(--paper-rule)] overflow-hidden",
        ruled &&
          "bg-[linear-gradient(transparent_95%,var(--paper-rule)_100%)] bg-[length:100%_2rem]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
