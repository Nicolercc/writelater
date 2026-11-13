import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildReview,
  addDays,
  captureToMarkdown,
  confirmLabel,
  type QueueItem,
} from "../lib/review";
import { copyText as defaultCopyText } from "../lib/clipboard";
import { downloadFile } from "../lib/export";
import { DataPanel, type Download } from "../components/review/DataPanel";
import { UsageControls } from "../components/review/UsageControls";
import { ManageDestinations } from "../components/review/ManageDestinations";
import type { Snapshot, UndoToken } from "../storage/handoffs";
import type { StoredCapture, StoredDestination } from "../storage/db";
import type { ActionOutcome, StoreStatus, WriteLaterActions } from "../hooks/useWriteLater";
import {
  AddDestinationForm,
  DestinationSetup,
  type DestinationDraft,
} from "../components/review/DestinationForms";

type View =
  | { kind: "home" }
  | { kind: "unsorted" }
  | { kind: "destination"; id: string }
  | { kind: "deferred" }
  | { kind: "manage" };

interface Announcement {
  message: string;
  undo: UndoToken | null;
}

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

const UNDO_MS = 8000;
const HEADING_ID = "review-view-heading";

const cardClass =
  "bg-[var(--surface)] border border-[var(--paper-border)] rounded-2xl p-4";
const primaryButton =
  "min-h-[44px] px-4 rounded-xl bg-primary text-primary-foreground font-medium text-sm";
const secondaryButton =
  "min-h-[44px] px-3 rounded-xl border border-[var(--paper-border)] bg-background text-foreground text-sm";

function setupSkippedKey(dbName: string) {
  return `writelater:setup-skipped:${dbName}`;
}

function viewKey(dbName: string) {
  return `writelater:review-view:${dbName}`;
}

/** The last open queue, so returning after an interruption lands in place. */
function readView(dbName: string): View {
  try {
    const parsed = JSON.parse(localStorage.getItem(viewKey(dbName)) ?? "null") as View | null;
    if (
      parsed &&
      (parsed.kind === "home" ||
        parsed.kind === "unsorted" ||
        parsed.kind === "deferred" ||
        parsed.kind === "manage" ||
        (parsed.kind === "destination" && typeof parsed.id === "string"))
    ) {
      return parsed;
    }
  } catch {
    // Fall through to home.
  }
  return { kind: "home" };
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function destinationLabel(d: StoredDestination) {
  return d.section ? `${d.name} · ${d.section}` : d.name;
}

/** Plain-text capture body. Never rendered as HTML. */
function CaptureText({ capture }: { capture: StoredCapture }) {
  return (
    <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
      {capture.text}
    </p>
  );
}

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
  const [view, setView] = useState<View>(() => readView(dbName));
  /** Text shown for manual copying after the clipboard refused. */
  const [copyFallback, setCopyFallback] = useState<{ handoffId: string; text: string } | null>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(viewKey(dbName), JSON.stringify(view));
    } catch {
      // Not remembered; harmless.
    }
  }, [dbName, view]);

  useEffect(() => {
    if (copyFallback) {
      fallbackRef.current?.focus();
      fallbackRef.current?.select();
    }
  }, [copyFallback]);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupSkipped, setSetupSkipped] = useState(() => readFlag(setupSkippedKey(dbName)));
  const undoRegionRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const activeDestinations = snapshot.destinations.filter((d) => !d.archivedAt);
  const currentQueue =
    view.kind === "destination" ? review.queues.find((q) => q.destination.id === view.id) : undefined;

  // If the open destination disappears (e.g. archived elsewhere), go home.
  useEffect(() => {
    if (view.kind === "destination" && status === "ready" && !currentQueue) setView({ kind: "home" });
  }, [view, status, currentQueue]);

  // Move focus after view changes and actions, once the DOM reflects them.
  useEffect(() => {
    if (!focusTarget) return;
    const el =
      document.getElementById(focusTarget) ?? document.getElementById(HEADING_ID);
    el?.focus();
    setFocusTarget(null);
  }, [focusTarget, snapshot, view]);

  // Auto-dismiss the message and its undo offer, but never while focus is
  // inside it. The resolved-today lists remain a persistent way back.
  const scheduleDismiss = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (undoRegionRef.current?.contains(document.activeElement)) return;
      setAnnouncement(null);
    }, UNDO_MS);
  };
  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const announce = (message: string, undo: UndoToken | null = null) => {
    setAnnouncement({ message, undo });
    scheduleDismiss();
  };

  const go = (next: View) => {
    setCopyFallback(null);
    setView(next);
    setFocusTarget(HEADING_ID);
  };

  /**
   * Runs one review action, announces the result, and moves focus to the
   * next item in the list (or the heading when the list empties).
   */
  const act = async (
    run: () => Promise<ActionOutcome>,
    success: string,
    nextFocusId: string | null,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await run();
      if (outcome.status === "ok") {
        announce(success, outcome.undo);
        setFocusTarget(nextFocusId ?? HEADING_ID);
      } else if (outcome.status === "stale") {
        announce("That item changed in another tab. Showing the latest.");
      } else {
        announce("That item no longer exists. Showing the latest.");
      }
    } catch {
      announce("Couldn't save that change. Nothing was changed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async (token: UndoToken) => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await actions.undo(token);
      announce(
        outcome.status === "ok"
          ? "Undone."
          : "Can't undo: that item changed since. Showing the latest.",
      );
    } catch {
      announce("Couldn't undo. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /** ID of the control to focus after removing items[index] from a list. */
  function nextIdAfter<T>(items: T[], index: number, idOf: (item: T) => string): string | null {
    const neighbour = items[index + 1] ?? items[index - 1];
    return neighbour ? idOf(neighbour) : null;
  }

  const saveDestinations = async (drafts: DestinationDraft[]) => {
    await actions.createDestinations(drafts);
    announce(drafts.length === 1 ? "Destination added." : "Destinations added.");
    setFocusTarget(HEADING_ID);
  };

  const skipSetup = () => {
    try {
      localStorage.setItem(setupSkippedKey(dbName), "1");
    } catch {
      // Not remembered across reloads; harmless.
    }
    setSetupSkipped(true);
    setFocusTarget(HEADING_ID);
  };

  // ---------------------------------------------------------------- views

  const backButton = (
    <button
      type="button"
      onClick={() => go({ kind: "home" })}
      className="inline-flex items-center gap-1 min-h-[44px] -ml-2 px-2 text-sm text-foreground"
    >
      <ChevronLeft className="w-4 h-4" aria-hidden />
      Review
    </button>
  );

  const heading = (text: React.ReactNode, sub?: React.ReactNode) => (
    <div className="mb-4">
      <h1
        id={HEADING_ID}
        tabIndex={-1}
        className="font-serif text-2xl font-medium text-foreground leading-snug focus:outline-none"
      >
        {text}
      </h1>
      {sub && <p className="text-sm text-muted-foreground mt-1">{sub}</p>}
    </div>
  );

  function renderHome() {
    const showSetup = activeDestinations.length === 0 && !setupSkipped;
    const nothingAtAll =
      review.unsorted.length === 0 &&
      review.queues.every((q) => q.pending.length === 0) &&
      review.deferred.length === 0;

    const row = (
      key: string,
      label: React.ReactNode,
      count: number,
      onClick: () => void,
      hint?: string,
    ) => (
      <li key={key}>
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

    return (
      <>
        {heading("Review", `${review.waitingCount} waiting`)}
        {showSetup && (
          <div className="mb-5">
            <DestinationSetup onSave={saveDestinations} onSkip={skipSetup} />
          </div>
        )}
        <ul className="space-y-2" aria-label="Queues">
          {row("unsorted", "Unsorted", review.unsorted.length, () => go({ kind: "unsorted" }), "Choose where each thought goes")}
          {review.queues.map((q) =>
            row(
              q.destination.id,
              destinationLabel(q.destination),
              q.pending.length,
              () => go({ kind: "destination", id: q.destination.id }),
              q.destination.kind === "paper" ? "Paper" : "Digital",
            ),
          )}
          {review.deferred.length > 0 &&
            row("deferred", "Later", review.deferred.length, () => go({ kind: "deferred" }), "Returns on its date")}
        </ul>
        {nothingAtAll && !showSetup && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              Nothing waiting. New thoughts land in Unsorted.
            </p>
            <button type="button" onClick={onCapture} className={`${secondaryButton} mt-3`}>
              Capture a thought
            </button>
          </div>
        )}
        {!showSetup && (
          <div className="mt-5 flex flex-col gap-2">
            <AddDestinationForm onAdd={(d) => saveDestinations([d])} />
            {snapshot.destinations.length > 0 && (
              <button type="button" onClick={() => go({ kind: "manage" })} className={secondaryButton}>
                Manage destinations
              </button>
            )}
          </div>
        )}
        <DataPanel snapshot={snapshot} download={download} onAnnounce={(m) => announce(m)}>
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

  function renderUnsorted() {
    const items = review.unsorted;
    const primaryId = (c: StoredCapture) => `sort-${c.id}`;
    return (
      <>
        {backButton}
        {heading(`Unsorted · ${items.length}`, "Send each thought where it belongs.")}
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
                        onClick={() =>
                          act(() => actions.assign(capture.id, d.id), `Sent to ${d.name}.`, nextId)
                        }
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
                </li>
              );
            })}
          </ul>
        )}
        {renderDoneToday(review.unsortedDoneToday, "Let go today")}
      </>
    );
  }

  function renderDestination() {
    if (!currentQueue) return null;
    const { destination, pending, doneToday } = currentQueue;
    const primaryId = (i: QueueItem) => `confirm-${i.handoff.id}`;
    const others = activeDestinations.filter((d) => d.id !== destination.id);
    const verb = destination.kind === "paper" ? "to write" : "to add";

    return (
      <>
        {backButton}
        {heading(destination.name, [destination.section, `${pending.length} ${verb}`].filter(Boolean).join(" · "))}
        {pending.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">Nothing waiting for {destination.name}.</p>
            {review.unsorted.length > 0 && (
              <button type="button" onClick={() => go({ kind: "unsorted" })} className={`${secondaryButton} mt-3`}>
                Sort {review.unsorted.length} unsorted
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {pending.map((item, index) => {
              const nextId = nextIdAfter(pending, index, primaryId);
              const { handoff, capture } = item;
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
                    {destination.kind === "digital" && !handoff.copiedAt && (
                      <button
                        id={primaryId(item)}
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          const markdown = captureToMarkdown(capture);
                          if (await copyText(markdown)) {
                            setCopyFallback(null);
                            // Copy alone never completes the handoff.
                            await act(
                              () => actions.markCopied(handoff),
                              `Copied. Paste it into ${destination.name}, then confirm.`,
                              // Once copied, Added becomes this item's primary control.
                              primaryId(item),
                            );
                          } else {
                            actions.logUsage("copy_failed");
                            setCopyFallback({ handoffId: handoff.id, text: markdown });
                          }
                        }}
                        className={primaryButton}
                      >
                        Copy Markdown
                      </button>
                    )}
                    <button
                      id={
                        destination.kind === "digital" && !handoff.copiedAt
                          ? `added-${handoff.id}`
                          : primaryId(item)
                      }
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        act(
                          () => actions.resolve(handoff, destination.kind === "paper" ? "written" : "added"),
                          `Marked ${destination.kind === "paper" ? "written" : "added"}.`,
                          nextId,
                        )
                      }
                      className={
                        destination.kind === "digital" && !handoff.copiedAt ? secondaryButton : primaryButton
                      }
                    >
                      {confirmLabel(destination)}
                    </button>
                    <details className="group">
                      <summary className={`${secondaryButton} inline-flex items-center cursor-pointer list-none`}>
                        More<span className="sr-only"> options for this item</span>
                      </summary>
                      <div className="mt-2 flex flex-col gap-2">
                        <button type="button" disabled={busy} className={secondaryButton}
                          onClick={() => act(() => actions.defer(handoff, addDays(today, 1)), "Moved to tomorrow.", nextId)}>
                          Later: tomorrow
                        </button>
                        <button type="button" disabled={busy} className={secondaryButton}
                          onClick={() => act(() => actions.defer(handoff, addDays(today, 7)), "Moved to next week.", nextId)}>
                          Later: next week
                        </button>
                        {others.map((d) => (
                          <button key={d.id} type="button" disabled={busy} className={secondaryButton}
                            onClick={() => act(() => actions.move(handoff, d.id), `Moved to ${d.name}.`, nextId)}>
                            Move to {d.name}
                          </button>
                        ))}
                        <button type="button" disabled={busy} className={secondaryButton}
                          onClick={() => act(() => actions.unsort(handoff), "Sent back to Unsorted.", nextId)}>
                          Back to Unsorted
                        </button>
                        <button type="button" disabled={busy} className={secondaryButton}
                          onClick={() => act(() => actions.resolve(handoff, "discarded"), "Let go.", nextId)}>
                          Let go
                        </button>
                      </div>
                    </details>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {renderDoneToday(doneToday, "Done today")}
      </>
    );
  }

  function renderDeferred() {
    const items = review.deferred;
    const primaryId = (i: QueueItem) => `bring-${i.handoff.id}`;
    const nameOf = (id: string | null) =>
      snapshot.destinations.find((d) => d.id === id)?.name ?? "Unsorted";
    return (
      <>
        {backButton}
        {heading(`Later · ${items.length}`, "Each item returns to its queue on its date.")}
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

  function renderManage() {
    const waitingCounts = new Map<string, number>();
    for (const h of snapshot.handoffs) {
      if (h.destinationId && (h.state === "pending" || h.state === "deferred")) {
        waitingCounts.set(h.destinationId, (waitingCounts.get(h.destinationId) ?? 0) + 1);
      }
    }
    return (
      <>
        {backButton}
        {heading("Destinations", "Rename, archive, or restore where your writing goes.")}
        <ManageDestinations
          destinations={snapshot.destinations}
          waitingCounts={waitingCounts}
          busy={busy}
          rename={actions.renameDestination}
          archive={actions.archiveDestination}
          restore={actions.restoreDestination}
          onResult={(message, focusId) => {
            announce(message);
            setFocusTarget(focusId ?? HEADING_ID);
          }}
        />
        <div className="mt-5">
          <AddDestinationForm onAdd={(d) => saveDestinations([d])} />
        </div>
      </>
    );
  }

  /** Resolved-today list: a persistent undo path that doesn't rely on the toast. */
  function renderDoneToday(items: QueueItem[], title: string) {
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
                <span className="sr-only">
                  {item.handoff.resolvedVia === "discarded" ? "Let go: " : "Done: "}
                </span>
                {item.capture.text}
              </span>
              <button
                type="button"
                disabled={busy}
                className={secondaryButton}
                aria-label={`Bring back: ${item.capture.text}`}
                onClick={() =>
                  act(
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

  return (
    <div className="px-5 pt-5 pb-28">
      {status === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
      {status === "error" && (
        <p role="alert" className="text-sm text-foreground">
          Storage isn't available in this browser, so nothing can be reviewed here.
        </p>
      )}
      {status === "stale" && (
        <p role="alert" className="text-sm text-foreground mb-3">
          WriteLater was updated in another tab. Reload to keep reviewing.
        </p>
      )}
      {(status === "ready" || status === "stale") && (
        <>
          {view.kind === "home" && renderHome()}
          {view.kind === "unsorted" && renderUnsorted()}
          {view.kind === "destination" && renderDestination()}
          {view.kind === "deferred" && renderDeferred()}
          {view.kind === "manage" && renderManage()}
        </>
      )}

      {/* Always mounted so every result is announced. Undo stays while focused. */}
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
              onClick={() => announcement.undo && handleUndo(announcement.undo)}
              className="min-h-[44px] px-3 rounded-xl text-sm font-semibold underline underline-offset-2"
            >
              Undo
            </button>
          )}
          {announcement && (
            <button
              type="button"
              onClick={() => setAnnouncement(null)}
              aria-label="Dismiss message"
              className="min-h-[44px] min-w-[44px] text-sm"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
