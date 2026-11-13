import React from "react";
import { cn } from "@/lib/utils";

interface CaptureComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
  onRetry: () => void;
  /** False while storage is opening or unavailable. Typing still works. */
  storageReady: boolean;
  saving: boolean;
  /** Polite status text, e.g. "Saved." Rendered in an always-mounted live region. */
  statusMessage: string;
  /** Assertive error text. When set, a Retry button is shown. */
  errorMessage: string | null;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  retryRef: React.RefObject<HTMLButtonElement | null>;
}

export function CaptureComposer({
  value,
  onChange,
  onSave,
  onClear,
  onRetry,
  storageReady,
  saving,
  statusMessage,
  errorMessage,
  textareaRef,
  retryRef,
}: CaptureComposerProps) {
  const hasText = value.trim().length > 0;
  const canSave = hasText && storageReady && !saving;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canSave) onSave();
    }
  };

  return (
    <div className="mx-5 space-y-3">
      <div className="bg-[var(--surface)] border border-[var(--paper-border)] rounded-2xl p-4">
        <label
          htmlFor="capture-title"
          className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block"
        >
          Quick capture
        </label>
        <textarea
          id="capture-title"
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buy travel adapter before the trip…"
          aria-describedby="capture-hint"
          className="min-h-[120px] bg-transparent border-none outline-none resize-none text-foreground text-base leading-relaxed placeholder:text-muted-foreground/50 w-full focus:ring-2 focus:ring-primary/30 focus:ring-offset-0 rounded-md"
        />
        <p id="capture-hint" className="text-xs text-muted-foreground italic mt-2">
          Messy is fine. Sorting comes later.
        </p>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="bg-destructive/10 border border-destructive/30 rounded-2xl px-4 py-3 flex items-center gap-3"
        >
          <span className="text-sm text-foreground flex-1">{errorMessage}</span>
          <button
            ref={retryRef}
            type="button"
            onClick={onRetry}
            disabled={saving || !storageReady}
            className="text-sm font-medium px-3 py-2 min-h-[44px] rounded-lg bg-background border border-[var(--paper-border)] text-foreground"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-col pt-1">
        {/* Stays mounted so focus is never dropped to <body> after saving. */}
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          aria-busy={saving}
          className={cn(
            "w-full py-3.5 rounded-2xl font-medium transition-all",
            canSave
              ? "bg-primary text-primary-foreground shadow-sm hover:opacity-95 active:scale-[0.99]"
              : "bg-primary/60 text-primary-foreground/80 opacity-50 cursor-not-allowed",
          )}
        >
          {saving ? "Saving…" : "Save to planner inbox"}
        </button>

        {/* Always mounted so screen readers announce changes reliably. */}
        <p
          role="status"
          aria-live="polite"
          className="min-h-[1.5rem] text-center text-sm text-foreground mt-2"
        >
          {statusMessage}
        </p>

        <button
          type="button"
          onClick={onClear}
          className="text-center text-xs text-muted-foreground mt-1 p-2 hover:text-foreground transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
