import React, { useMemo } from "react";
import type { Snapshot } from "../../../storage/handoffs";
import type { WriteLaterActions } from "../../../hooks/useWriteLater";
import type { ReviewController } from "../../../hooks/useReviewController";
import { AddDestinationForm, type DestinationDraft } from "../DestinationForms";
import { ManageDestinations } from "../ManageDestinations";
import { BackButton, ViewHeading } from "../shared";

interface ManageViewProps {
  snapshot: Snapshot;
  controller: ReviewController;
  actions: WriteLaterActions;
  onSaveDestinations: (drafts: DestinationDraft[]) => Promise<void>;
}

/** Rename, archive, restore, and add destinations. */
export function ManageView({ snapshot, controller, actions, onSaveDestinations }: ManageViewProps) {
  const { go, busy, exclusive, announce, focus } = controller;

  // Pending plus deferred items per destination.
  const waitingCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of snapshot.handoffs) {
      if (h.destinationId && (h.state === "pending" || h.state === "deferred")) {
        counts.set(h.destinationId, (counts.get(h.destinationId) ?? 0) + 1);
      }
    }
    return counts;
  }, [snapshot.handoffs]);

  return (
    <>
      <BackButton onClick={() => go({ kind: "home" })} />
      <ViewHeading title="Destinations" subtitle="Rename, archive, or restore where your writing goes." />
      <ManageDestinations
        destinations={snapshot.destinations}
        waitingCounts={waitingCounts}
        busy={busy}
        rename={(d, input) => exclusive(() => actions.renameDestination(d, input))}
        archive={(d, target) => exclusive(() => actions.archiveDestination(d, target))}
        restore={(d) => exclusive(() => actions.restoreDestination(d))}
        onResult={(message, focusId) => {
          announce(message);
          focus(focusId ?? null);
        }}
      />
      <div className="mt-5">
        <AddDestinationForm onAdd={(d) => onSaveDestinations([d])} />
      </div>
    </>
  );
}
