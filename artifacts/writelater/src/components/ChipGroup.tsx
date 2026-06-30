import React from "react";
import { Chip } from "./Chip";

interface ChipGroupProps {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string | null;
  onSelect: (value: string) => void;
}

export function ChipGroup({ label, options, selected, onSelect }: ChipGroupProps) {
  return (
    <div>
      <div
        id={`chip-group-${label.replace(/\s+/g, "-").toLowerCase()}`}
        className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5"
      >
        {label}
      </div>
      <div
        role="group"
        aria-labelledby={`chip-group-${label.replace(/\s+/g, "-").toLowerCase()}`}
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => (
          <Chip
            key={option.value}
            selected={selected === option.value}
            onClick={() => onSelect(option.value)}
            aria-pressed={selected === option.value}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
