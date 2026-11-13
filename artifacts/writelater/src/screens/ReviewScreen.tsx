import React, { useEffect, useMemo, useState } from "react";
import { buildReview } from "../lib/review";
import { copyText as defaultCopyText } from "../lib/clipboard";
import { downloadFile } from "../lib/export";
import type { Download } from "../components/review/DataPanel";
import type { DestinationDraft } from "../components/review/DestinationForms";
import type { Snapshot } from "../storage/handoffs";
import type { StoreStatus, WriteLaterActions } from "../hooks/useWriteLater";
import { useReviewController } from "../hooks/useReviewController";
import { AnnouncementBar } from "../components/review/AnnouncementBar";
import { ReviewHome } from "../components/review/views/ReviewHome";
import { UnsortedQueue } from "../components/review/views/UnsortedQueue";
import { DestinationQueueView } from "../components/review/views/DestinationQueueView";
import { DeferredQueue } from "../components/review/views/DeferredQueue";
import { ManageView } from "../components/review/views/ManageView";

interface ReviewScreenProps {
  dbName: string;
  status: StoreStatus;
  snapshot: Snapshot;
  actions: WriteLaterActions;
  /** Local date (YYYY-MM-DD); injectable for tests. */
  today: string;
  onCapture: () => void;
  /** Injectable for tests; resolves false when copying fails. */
  copyText?: (text: string) => Promise<boolean>;
  /** Injectable for tests; triggers a file download. */
  download?: Download;
}

function setupSkippedKey(dbName: string) {
  return `writelater:setup-skipped:${dbName}`;
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * Review: routes between its views and owns what spans them (first-run
 * setup, erasing everything). Each view lives in components/review/views;
 * the shared machinery (focus, one write at a time, announcements) lives in
 * useReviewController.
 */
export function ReviewScreen({
  dbName,
  status,
  snapshot,
  actions,
  today,
  onCapture,
  copyText = defaultCopyText,
  download = downloadFile,
}: ReviewScreenProps) {
  const review = useMemo(() => buildReview(snapshot, today), [snapshot, today]);
  const controller = useReviewController(dbName, snapshot, actions);
  const { view, setView, announce, focus, exclusive } = controller;
  const [setupSkipped, setSetupSkipped] = useState(() => readFlag(setupSkippedKey(dbName)));

  const activeDestinations = useMemo(
    () => snapshot.destinations.filter((d) => !d.archivedAt),
    [snapshot.destinations],
  );
  const currentQueue =
    view.kind === "destination" ? review.queues.find((q) => q.destination.id === view.id) : undefined;

  // If the open destination disappears (e.g. archived elsewhere), go home.
  useEffect(() => {
    if (view.kind === "destination" && status === "ready" && !currentQueue) setView({ kind: "home" });
  }, [view, status, currentQueue, setView]);

  const saveDestinations = async (drafts: DestinationDraft[]) => {
    await actions.createDestinations(drafts);
    announce(drafts.length === 1 ? "Destination added." : "Destinations added.");
    focus(null);
  };

  const skipSetup = () => {
    try {
      localStorage.setItem(setupSkippedKey(dbName), "1");
    } catch {
      // Not remembered across reloads; harmless.
    }
    setSetupSkipped(true);
    focus(null);
  };

  const eraseEverything = async () => {
    const done = await exclusive(async () => {
      await actions.eraseEverything();
      return true;
    });
    if (!done) return;
    setSetupSkipped(false);
    setView({ kind: "home" });
    announce("Everything was erased from WriteLater on this device.");
    focus(null);
  };

  return (
    <div className="px-5 pt-5 pb-28">
      {status === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
      {status === "error" && (
        <p role="alert" className="text-sm text-foreground">
          Storage isn't available in this browser, so nothing can be reviewed here.
        </p>
      )}
      {status === "blocked" && (
        <p role="alert" className="text-sm text-foreground">
          WriteLater is updating, but another tab still has the old version open.
          Close other WriteLater tabs to finish.
        </p>
      )}
      {status === "stale" && (
        <p role="alert" className="text-sm text-foreground mb-3">
          WriteLater was updated in another tab. Reload to keep reviewing.
        </p>
      )}
      {(status === "ready" || status === "stale") && (
        <>
          {view.kind === "home" && (
            <ReviewHome
              review={review}
              snapshot={snapshot}
              actions={actions}
              controller={controller}
              showSetup={activeDestinations.length === 0 && !setupSkipped}
              onSaveDestinations={saveDestinations}
              onSkipSetup={skipSetup}
              onErase={eraseEverything}
              onCapture={onCapture}
              download={download}
            />
          )}
          {view.kind === "unsorted" && (
            <UnsortedQueue
              review={review}
              activeDestinations={activeDestinations}
              controller={controller}
              actions={actions}
            />
          )}
          {view.kind === "destination" && currentQueue && (
            <DestinationQueueView
              key={currentQueue.destination.id}
              queue={currentQueue}
              unsortedCount={review.unsorted.length}
              activeDestinations={activeDestinations}
              controller={controller}
              actions={actions}
              today={today}
              copyText={copyText}
            />
          )}
          {view.kind === "deferred" && (
            <DeferredQueue
              items={review.deferred}
              destinations={snapshot.destinations}
              controller={controller}
              actions={actions}
              today={today}
            />
          )}
          {view.kind === "manage" && (
            <ManageView
              snapshot={snapshot}
              controller={controller}
              actions={actions}
              onSaveDestinations={saveDestinations}
            />
          )}
        </>
      )}

      <AnnouncementBar controller={controller} />
    </div>
  );
}
