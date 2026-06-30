import React from "react";

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-5 pt-6 pb-2 space-y-1">
      <h1 className="font-serif text-2xl font-medium text-foreground leading-snug">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{subtitle}</p>}
    </div>
  );
}
