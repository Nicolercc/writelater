import React from "react";
import type { ReviewController } from "../../hooks/useReviewController";

/**
 * The status region for every Review result, with an Undo offer. Always
 * mounted so screen readers announce changes; stays while it has focus.
 */
export function AnnouncementBar({ controller }: { controller: ReviewController }) {
  const { announcement, busy, undo, dismiss, scheduleDismiss, undoRegionRef } = controller;
  return (
    <div
      ref={undoRegionRef}
      onBlur={() => announcement && scheduleDismiss()}
      className="fixed left-1/2 -translate-x-1/2 bottom-24 w-[calc(100%-2.5rem)] max-w-[390px] z-20 pointer-events-none"
    >
      <div
        className={
          announcement
            ? "pointer-events-auto flex items-center gap-3 rounded-2xl bg-foreground text-background px-4 py-2 shadow-lg"
            : "sr-only"
        }
      >
        <p role="status" aria-live="polite" className="flex-1 text-sm py-2">
          {announcement?.message ?? ""}
        </p>
        {announcement?.undo && (
          <button
            type="button"
            disabled={busy}
            onClick={() => announcement.undo && undo(announcement.undo)}
            className="min-h-[44px] px-3 rounded-xl text-sm font-semibold underline underline-offset-2"
          >
            Undo
          </button>
        )}
        {announcement && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss message"
            className="min-h-[44px] min-w-[44px] text-sm"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
