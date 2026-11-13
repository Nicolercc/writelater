import React, { useEffect, useRef, useState } from "react";
import {
  addDays,
  captureToMarkdown,
  confirmLabel,
  type DestinationQueue,
  type QueueItem,
} from "../../../lib/review";
import type { StoredDestination } from "../../../storage/db";
import type { WriteLaterActions } from "../../../hooks/useWriteLater";
import type { ReviewController } from "../../../hooks/useReviewController";
import { DeleteConfirm } from "../DeleteConfirm";
import { DoneTodayList } from "../DoneTodayList";
import {
  BackButton,
  CaptureText,
  cardClass,
  formatDay,
  nextIdAfter,
  primaryButton,
  secondaryButton,
  ViewHeading,
} from "../shared";

interface DestinationQueueViewProps {
  queue: DestinationQueue;
  unsortedCount: number;
  activeDestinations: StoredDestination[];
  controller: ReviewController;
  actions: WriteLaterActions;
  today: string;
  copyText: (text: string) => Promise<boolean>;
}

const primaryId = (i: QueueItem) => `confirm-${i.handoff.id}`;

/**
 * One destination's queue. Paper items confirm with Written; digital items
 * copy Markdown first, then confirm with Added. Copying never completes one.
 */
export function DestinationQueueView({
  queue,
  unsortedCount,
  activeDestinations,
  controller,
  actions,
  today,
  copyText,
}: DestinationQueueViewProps) {
  const { go, act, busy, isBusy } = controller;
  const { destination, pending, doneToday } = queue;
  const others = activeDestinations.filter((d) => d.id !== destination.id);
  const verb = destination.kind === "paper" ? "to write" : "to add";
  const isDigital = destination.kind === "digital";

  // Text shown for manual copying after the clipboard refused.
  const [copyFallback, setCopyFallback] = useState<{ handoffId: string; text: string } | null>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  // Capture awaiting a permanent-delete confirmation.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (copyFallback) {
      fallbackRef.current?.focus();
      fallbackRef.current?.select();
    }
  }, [copyFallback]);

  const copy = async (item: QueueItem) => {
    if (isBusy()) return;
    const markdown = captureToMarkdown(item.capture);
    if (await copyText(markdown)) {
      setCopyFallback(null);
      // Copy alone never completes the handoff.
      await act(
        () => actions.markCopied(item.handoff),
        `Copied. Paste it into ${destination.name}, then confirm.`,
        // Once copied, Added becomes this item's primary control.
        primaryId(item),
      );
    } else {
      actions.logUsage("copy_failed");
      setCopyFallback({ handoffId: item.handoff.id, text: markdown });
    }
  };

  return (
    <>
      <BackButton onClick={() => go({ kind: "home" })} />
      <ViewHeading
        title={destination.name}
        subtitle={[destination.section, `${pending.length} ${verb}`].filter(Boolean).join(" · ")}
      />
      {pending.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">Nothing waiting for {destination.name}.</p>
          {unsortedCount > 0 && (
            <button type="button" onClick={() => go({ kind: "unsorted" })} className={`${secondaryButton} mt-3`}>
              Sort {unsortedCount} unsorted
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {pending.map((item, index) => {
            const nextId = nextIdAfter(pending, index, primaryId);
            const { handoff, capture } = item;
            const awaitingCopy = isDigital && !handoff.copiedAt;
            return (
              <li key={handoff.id} className={cardClass}>
                <CaptureText capture={capture} />
                {handoff.state === "deferred" && handoff.revisitOn && (
                  <p className="text-xs text-muted-foreground mt-1">Back from {formatDay(handoff.revisitOn)}</p>
                )}
                {handoff.copiedAt && (
                  <p className="text-xs text-foreground mt-2">
                    Copied. Paste it into {destination.name}, then confirm.
                  </p>
                )}
                {copyFallback?.handoffId === handoff.id && (
                  <div className="mt-3">
                    <p role="alert" className="text-sm text-foreground mb-2">
                      Copy didn't work. The text is selected: press ⌘C, or long-press and choose Copy.
                    </p>
                    <label htmlFor={`fallback-${handoff.id}`} className="sr-only">
                      Text to copy
                    </label>
                    <textarea
                      id={`fallback-${handoff.id}`}
                      ref={fallbackRef}
                      readOnly
                      value={copyFallback.text}
                      rows={Math.min(6, copyFallback.text.split("\n").length + 1)}
                      className="w-full rounded-xl border border-[var(--paper-border)] bg-background p-2 text-sm text-foreground"
                    />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-start gap-2">
                  {awaitingCopy && (
                    <button
                      id={primaryId(item)}
                      type="button"
                      disabled={busy}
                      onClick={() => copy(item)}
                      className={primaryButton}
                    >
                      Copy Markdown
                    </button>
                  )}
                  <button
                    id={awaitingCopy ? `added-${handoff.id}` : primaryId(item)}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () => actions.resolve(handoff, isDigital ? "added" : "written"),
                        `Marked ${isDigital ? "added" : "written"}.`,
                        nextId,
                      )
                    }
                    className={awaitingCopy ? secondaryButton : primaryButton}
                  >
                    {confirmLabel(destination)}
                  </button>
                  <details className="group">
                    <summary className={`${secondaryButton} inline-flex items-center cursor-pointer list-none`}>
                      More<span className="sr-only"> options for this item</span>
                    </summary>
                    <div className="mt-2 flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        className={secondaryButton}
                        onClick={() => act(() => actions.defer(handoff, addDays(today, 1)), "Moved to tomorrow.", nextId)}
                      >
                        Later: tomorrow
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className={secondaryButton}
                        onClick={() => act(() => actions.defer(handoff, addDays(today, 7)), "Moved to next week.", nextId)}
                      >
                        Later: next week
                      </button>
                      {others.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          disabled={busy}
                          className={secondaryButton}
                          onClick={() => act(() => actions.move(handoff, d.id), `Moved to ${d.name}.`, nextId)}
                        >
                          Move to {d.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={busy}
                        className={secondaryButton}
                        onClick={() => act(() => actions.unsort(handoff), "Sent back to Unsorted.", nextId)}
                      >
                        Back to Unsorted
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className={secondaryButton}
                        onClick={() => act(() => actions.resolve(handoff, "discarded"), "Let go.", nextId)}
                      >
                        Let go
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className={secondaryButton}
                        onClick={() => setConfirmDelete(capture.id)}
                      >
                        Delete permanently…
                      </button>
                    </div>
                  </details>
                </div>
                {confirmDelete === capture.id && (
                  <DeleteConfirm
                    capture={capture}
                    nextFocusId={nextId}
                    controller={controller}
                    actions={actions}
                    onCancel={() => setConfirmDelete(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <DoneTodayList items={doneToday} title="Done today" controller={controller} actions={actions} />
    </>
  );
}
