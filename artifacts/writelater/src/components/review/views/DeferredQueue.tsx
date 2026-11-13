import React from "react";
import type { QueueItem } from "../../../lib/review";
import type { StoredDestination } from "../../../storage/db";
import type { WriteLaterActions } from "../../../hooks/useWriteLater";
import type { ReviewController } from "../../../hooks/useReviewController";
import { BackButton, CaptureText, cardClass, formatDay, nextIdAfter, secondaryButton, ViewHeading } from "../shared";

interface DeferredQueueProps {
  items: QueueItem[];
  destinations: StoredDestination[];
  controller: ReviewController;
  actions: WriteLaterActions;
  today: string;
}

const primaryId = (i: QueueItem) => `bring-${i.handoff.id}`;

/** Items set aside until a date. Each returns to its queue on that date, or now on request. */
export function DeferredQueue({ items, destinations, controller, actions, today }: DeferredQueueProps) {
  const { go, act, busy } = controller;
  const nameOf = (id: string | null) => destinations.find((d) => d.id === id)?.name ?? "Unsorted";

  return (
    <>
      <BackButton onClick={() => go({ kind: "home" })} />
      <ViewHeading title={`Later · ${items.length}`} subtitle="Each item returns to its queue on its date." />
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Nothing set aside.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li key={item.handoff.id} className={cardClass}>
              <CaptureText capture={item.capture} />
              <p className="text-xs text-muted-foreground mt-1">
                {nameOf(item.handoff.destinationId)} · returns {formatDay(item.handoff.revisitOn ?? today)}
              </p>
              <button
                id={primaryId(item)}
                type="button"
                disabled={busy}
                onClick={() =>
                  act(() => actions.reactivate(item.handoff), "Brought back.", nextIdAfter(items, index, primaryId))
                }
                className={`${secondaryButton} mt-3`}
              >
                Bring back now
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
