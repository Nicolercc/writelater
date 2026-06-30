import React from "react";
import { cn } from "@/lib/utils";

interface PaperCardProps extends React.HTMLAttributes<HTMLDivElement> {
  ruled?: boolean;
}

export function PaperCard({ children, ruled, className, ...props }: PaperCardProps) {
  return (
    <div
      className={cn(
        "bg-[#FCFAF7] rounded-lg shadow-sm border border-[#EBE3D5] overflow-hidden",
        ruled && "bg-[linear-gradient(transparent_95%,_#EBE3D5_100%)] bg-[length:100%_2rem]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
