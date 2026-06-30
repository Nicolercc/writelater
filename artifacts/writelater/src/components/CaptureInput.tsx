import React from "react";
import { cn } from "@/lib/utils";

interface CaptureInputProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  // any extra props
}

export const CaptureInput = React.forwardRef<HTMLTextAreaElement, CaptureInputProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full min-h-[120px] resize-none bg-card text-card-foreground p-4 rounded-xl border border-input focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60 text-lg font-medium",
          className
        )}
        {...props}
      />
    );
  }
);
CaptureInput.displayName = "CaptureInput";
