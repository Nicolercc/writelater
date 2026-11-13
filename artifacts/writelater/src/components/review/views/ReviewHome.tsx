import React from "react";
import { ChevronRight } from "lucide-react";
import type { Review } from "../../../lib/review";
import type { Snapshot } from "../../../storage/handoffs";
import type { WriteLaterActions } from "../../../hooks/useWriteLater";
import type { ReviewController } from "../../../hooks/useReviewController";
import { AddDestinationForm, DestinationSetup, type DestinationDraft } from "../DestinationForms";
import { DataPanel, type Download } from "../DataPanel";
import { UsageControls } from "../UsageControls";
import { destinationLabel, secondaryButton, ViewHeading } from "../shared";

interface ReviewHomeProps {
  review: Review;
  snapshot: Snapshot;
  actions: WriteLaterActions;
  controller: ReviewController;
  showSetup: boolean;
  onSaveDestinations: (drafts: DestinationDraft[]) => Promise<void>;
  onSkipSetup: () => void;
  onErase: () => Promise<void>;
  onCapture: () => void;
  download: Download;
}

function QueueRow({
  label,
  count,
  hint,
  onClick,
}: {
  label: React.ReactNode;
  count: number;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 min-h-[56px] px-4 py-3 text-left bg-[var(--surface)] border border-[var(--paper-border)] rounded-2xl"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-medium text-foreground truncate">{label}</span>
          {hint && <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>}
        </span>
        <span className="font-serif text-xl text-foreground" aria-label={`${count} waiting`}>
          {count}
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}

/** Review's first screen: Unsorted, each destination with its count, then Later. */
export function ReviewHome({
  review,
  snapshot,
  actions,
  controller,
  showSetup,
  onSaveDestinations,
  onSkipSetup,
  onErase,
  onCapture,
  download,
}: ReviewHomeProps) {
  const { go, announce, exclusive } = controller;
  const nothingAtAll =
    review.unsorted.length === 0 &&
    review.queues.every((q) => q.pending.length === 0) &&
    review.deferred.length === 0;

  return (
    <>
      <ViewHeading title="Review" subtitle={`${review.waitingCount} waiting`} />
      {showSetup && (
        <div className="mb-5">
          <DestinationSetup onSave={onSaveDestinations} onSkip={onSkipSetup} />
        </div>
      )}
      <ul className="space-y-2" aria-label="Queues">
        <QueueRow
          label="Unsorted"
          count={review.unsorted.length}
          hint="Choose where each thought goes"
          onClick={() => go({ kind: "unsorted" })}
        />
        {review.queues.map((q) => (
          <QueueRow
            key={q.destination.id}
            label={destinationLabel(q.destination)}
            count={q.pending.length}
            hint={q.destination.kind === "paper" ? "Paper" : "Digital"}
            onClick={() => go({ kind: "destination", id: q.destination.id })}
          />
        ))}
        {review.deferred.length > 0 && (
          <QueueRow
            label="Later"
            count={review.deferred.length}
            hint="Returns on its date"
            onClick={() => go({ kind: "deferred" })}
          />
        )}
      </ul>
      {nothingAtAll && !showSetup && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">Nothing waiting. New thoughts land in Unsorted.</p>
          <button type="button" onClick={onCapture} className={`${secondaryButton} mt-3`}>
            Capture a thought
          </button>
        </div>
      )}
      {!showSetup && (
        <div className="mt-5 flex flex-col gap-2">
          <AddDestinationForm onAdd={(d) => onSaveDestinations([d])} />
          {snapshot.destinations.length > 0 && (
            <button type="button" onClick={() => go({ kind: "manage" })} className={secondaryButton}>
              Manage destinations
            </button>
          )}
        </div>
      )}
      <DataPanel
        snapshot={snapshot}
        download={download}
        onAnnounce={(m) => announce(m)}
        onErase={onErase}
        onRestore={(plan) => exclusive(() => actions.restoreBackup(plan))}
      >
        <UsageControls
          loadSummary={actions.usageSummary}
          download={download}
          onWantedOtherDevice={() => actions.logUsage("wanted_other_device")}
          onAnnounce={(m) => announce(m)}
        />
      </DataPanel>
    </>
  );
}
