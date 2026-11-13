import React, { useState } from "react";
import type { Review } from "../../../lib/review";
import type { StoredCapture, StoredDestination } from "../../../storage/db";
import type { WriteLaterActions } from "../../../hooks/useWriteLater";
import type { ReviewController } from "../../../hooks/useReviewController";
import { DeleteConfirm } from "../DeleteConfirm";
import { DoneTodayList } from "../DoneTodayList";
import { BackButton, CaptureText, cardClass, nextIdAfter, secondaryButton, ViewHeading } from "../shared";

interface UnsortedQueueProps {
  review: Review;
  activeDestinations: StoredDestination[];
  controller: ReviewController;
  actions: WriteLaterActions;
}

const primaryId = (c: StoredCapture) => `sort-${c.id}`;

/** Captures with no destination yet: send each one somewhere, let it go, or delete it. */
export function UnsortedQueue({ review, activeDestinations, controller, actions }: UnsortedQueueProps) {
  const { go, act, busy } = controller;
  const items = review.unsorted;
  // Capture awaiting a permanent-delete confirmation.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <>
      <BackButton onClick={() => go({ kind: "home" })} />
      <ViewHeading title={`Unsorted · ${items.length}`} subtitle="Send each thought where it belongs." />
      {activeDestinations.length === 0 && (
        <div className={`${cardClass} mb-4`}>
          <p className="text-sm text-foreground">Add a destination to sort into.</p>
          <button type="button" onClick={() => go({ kind: "home" })} className={`${secondaryButton} mt-3`}>
            Set up destinations
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Nothing to sort.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((capture, index) => {
            const nextId = nextIdAfter(items, index, primaryId);
            return (
              <li key={capture.id} className={cardClass}>
                <CaptureText capture={capture} />
                <div role="group" aria-label="Send to" className="mt-3 flex flex-wrap gap-2">
                  {activeDestinations.map((d, i) => (
                    <button
                      key={d.id}
                      id={i === 0 ? primaryId(capture) : undefined}
                      type="button"
                      disabled={busy}
                      onClick={() => act(() => actions.assign(capture.id, d.id), `Sent to ${d.name}.`, nextId)}
                      className={secondaryButton}
                    >
                      {d.name}
                    </button>
                  ))}
                  <button
                    id={activeDestinations.length === 0 ? primaryId(capture) : undefined}
                    type="button"
                    disabled={busy}
                    onClick={() => act(() => actions.assign(capture.id, null), "Let go.", nextId)}
                    className={`${secondaryButton} ml-auto`}
                  >
                    Let go
                  </button>
                </div>
                {confirmDelete === capture.id ? (
                  <DeleteConfirm
                    capture={capture}
                    nextFocusId={nextId}
                    controller={controller}
                    actions={actions}
                    onCancel={() => setConfirmDelete(null)}
                  />
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmDelete(capture.id)}
                    className={`${secondaryButton} mt-2`}
                  >
                    Delete…
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <DoneTodayList items={review.unsortedDoneToday} title="Let go today" controller={controller} actions={actions} />
    </>
  );
}
