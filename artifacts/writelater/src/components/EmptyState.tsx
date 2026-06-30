import React from "react";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  heading: string;
  subtext: string;
}

export function EmptyState({ icon: Icon, heading, subtext }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <h3 className="font-serif text-lg font-medium text-foreground mb-1">{heading}</h3>
      <p className="text-sm text-muted-foreground max-w-[250px] mx-auto">{subtext}</p>
    </div>
  );
}
