import React from "react";
import type { QueueItem } from "../../lib/review";
import type { WriteLaterActions } from "../../hooks/useWriteLater";
import type { ReviewController } from "../../hooks/useReviewController";
import { secondaryButton } from "./shared";

interface DoneTodayListProps {
  items: QueueItem[];
  title: string;
  controller: ReviewController;
  actions: WriteLaterActions;
}

/** Resolved-today list: a persistent undo path that doesn't rely on the announcement. */
export function DoneTodayList({ items, title, controller, actions }: DoneTodayListProps) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="done-today" className="mt-6">
      <h2 id="done-today" className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.handoff.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-muted/40">
            <span className="flex-1 min-w-0 text-sm text-muted-foreground truncate">
              <span className="sr-only">{item.handoff.resolvedVia === "discarded" ? "Let go: " : "Done: "}</span>
              {item.capture.text}
            </span>
            <button
              type="button"
              disabled={controller.busy}
              className={secondaryButton}
              aria-label={`Bring back: ${item.capture.text}`}
              onClick={() =>
                controller.act(
                  () =>
                    item.handoff.destinationId === null
                      ? actions.unsort(item.handoff)
                      : actions.reactivate(item.handoff),
                  "Brought back.",
                  null,
                )
              }
            >
              Bring back
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
