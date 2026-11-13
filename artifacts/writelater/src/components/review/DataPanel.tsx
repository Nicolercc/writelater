import React, { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../../storage/handoffs";
import { buildBackup, buildMarkdownExport } from "../../lib/export";
import { localDate } from "../../lib/review";

export type Download = (filename: string, content: string, mimeType: string) => void;

interface DataPanelProps {
  snapshot: Snapshot;
  download: Download;
  /** Announces the result through the screen's status region. */
  onAnnounce: (message: string) => void;
  /** Extra controls rendered under the exports (e.g. usage summary). */
  children?: React.ReactNode;
  /** Permanently erases everything; offered behind a confirmation step. */
  onErase?: () => Promise<void>;
}

const buttonClass =
  "min-h-[44px] px-3 rounded-xl border border-[var(--paper-border)] bg-background text-foreground text-sm text-left";

/** Exports, with a plain statement of what each file contains. */
export function DataPanel({ snapshot, download, onAnnounce, children, onErase }: DataPanelProps) {
  const day = localDate();
  const count = snapshot.captures.length;
  const [confirmingErase, setConfirmingErase] = useState(false);
  const [eraseError, setEraseError] = useState<string | null>(null);
  const confirmHeadingRef = useRef<HTMLHeadingElement>(null);
  const isEmpty = count === 0 && snapshot.destinations.length === 0;

  useEffect(() => {
    if (confirmingErase) confirmHeadingRef.current?.focus();
  }, [confirmingErase]);

  const erase = async () => {
    if (!onErase) return;
    try {
      await onErase();
      setConfirmingErase(false);
      setEraseError(null);
    } catch {
      setEraseError("Couldn't erase. Nothing was changed. Try again.");
    }
  };

  const exportBackup = () => {
    download(
      `writelater-backup-${day}.json`,
      JSON.stringify(buildBackup(snapshot), null, 2),
      "application/json",
    );
    onAnnounce("Backup file created.");
  };

  const exportMarkdown = () => {
    download(`writelater-${day}.md`, buildMarkdownExport(snapshot), "text/markdown");
    onAnnounce("Markdown file created.");
  };

  return (
    <section aria-labelledby="data-heading" className="mt-8 border-t border-[var(--paper-border)] pt-5">
      <h2 id="data-heading" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Your data
      </h2>
      <p className="text-sm text-foreground mt-2 leading-relaxed">
        Your writing is stored only in this browser on this device. WriteLater doesn't encrypt it,
        and clearing site data deletes it. Exports are plain text, so anyone with the file can read it.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <button type="button" onClick={exportBackup} disabled={count === 0} className={buttonClass}>
          Download backup (JSON)
          <span className="block text-xs text-muted-foreground">
            All {count} captures, destinations, and statuses, including source links.
          </span>
        </button>
        <button type="button" onClick={exportMarkdown} disabled={count === 0} className={buttonClass}>
          Download Markdown
          <span className="block text-xs text-muted-foreground">
            Capture text grouped by destination. No source links.
          </span>
        </button>
        {children}
      </div>

      {onErase && !confirmingErase && (
        <button
          type="button"
          disabled={isEmpty}
          onClick={() => setConfirmingErase(true)}
          className="mt-4 min-h-[44px] px-3 rounded-xl border border-destructive/40 bg-background text-sm text-foreground text-left"
        >
          Erase everything on this device…
        </button>
      )}
      {onErase && confirmingErase && (
        <div
          role="group"
          aria-labelledby="erase-heading"
          className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/5 p-4"
        >
          <h3 id="erase-heading" ref={confirmHeadingRef} tabIndex={-1} className="font-medium text-foreground focus:outline-none">
            Erase everything?
          </h3>
          <p className="text-sm text-foreground mt-2 leading-relaxed">
            This permanently removes {count} {count === 1 ? "capture" : "captures"},{" "}
            {snapshot.destinations.length} {snapshot.destinations.length === 1 ? "destination" : "destinations"},
            their statuses, and the usage log from WriteLater in this browser. It can't be undone.
          </p>
          <p className="text-sm text-foreground mt-2 leading-relaxed">
            Files you already downloaded and anything you copied or pasted elsewhere aren't affected.
          </p>
          {eraseError && <p role="alert" className="text-sm text-foreground mt-2">{eraseError}</p>}
          <div className="mt-3 flex flex-col gap-2">
            {count > 0 && (
              <button type="button" onClick={exportBackup} className={buttonClass}>
                Download a backup first
              </button>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={erase}
                className="min-h-[44px] px-4 rounded-xl bg-destructive text-destructive-foreground font-medium text-sm"
              >
                Erase everything
              </button>
              <button type="button" onClick={() => setConfirmingErase(false)} className={buttonClass}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
