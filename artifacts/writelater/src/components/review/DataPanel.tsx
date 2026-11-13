import React from "react";
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
}

const buttonClass =
  "min-h-[44px] px-3 rounded-xl border border-[var(--paper-border)] bg-background text-foreground text-sm text-left";

/** Exports, with a plain statement of what each file contains. */
export function DataPanel({ snapshot, download, onAnnounce, children }: DataPanelProps) {
  const day = localDate();
  const count = snapshot.captures.length;

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
    </section>
  );
}
