import React, { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../../storage/handoffs";
import { buildBackup, buildMarkdownExport } from "../../lib/export";
import { localDate } from "../../lib/review";
import { planRestore, type ApplyResult, type RestorePlan } from "../../storage/restore";

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
  /** Applies a previewed restore; resolves undefined if ignored (another write in flight). */
  onRestore?: (plan: RestorePlan) => Promise<ApplyResult | undefined>;
}

/** Blob.text() where available; FileReader for older Safari and test DOMs. */
function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function plural(n: number, word: string, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

const buttonClass =
  "min-h-[44px] px-3 rounded-xl border border-[var(--paper-border)] bg-background text-foreground text-sm text-left";

/** Exports, with a plain statement of what each file contains. */
export function DataPanel({ snapshot, download, onAnnounce, children, onErase, onRestore }: DataPanelProps) {
  const day = localDate();
  const count = snapshot.captures.length;
  const [confirmingErase, setConfirmingErase] = useState(false);
  const [eraseError, setEraseError] = useState<string | null>(null);
  const confirmHeadingRef = useRef<HTMLHeadingElement>(null);
  const isEmpty = count === 0 && snapshot.destinations.length === 0;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const [restorePlan, setRestorePlan] = useState<RestorePlan | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (restorePlan || restoreError) previewHeadingRef.current?.focus();
  }, [restorePlan, restoreError]);

  const resetRestore = () => {
    setRestorePlan(null);
    setRestoreError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const chooseFile = async (file: File | undefined) => {
    setRestorePlan(null);
    setRestoreError(null);
    if (!file) return;
    // Loaded on demand so zod isn't in the main bundle.
    let parser: typeof import("../../storage/restoreParse");
    try {
      parser = await import("../../storage/restoreParse");
    } catch {
      setRestoreError("Couldn't load the restore tool. Check your connection and try again.");
      return;
    }
    const { MAX_BACKUP_BYTES, parseBackup } = parser;
    if (file.size > MAX_BACKUP_BYTES) {
      setRestoreError("The file is larger than 10 MB.");
      return;
    }
    let text: string;
    try {
      text = await readFileText(file);
    } catch {
      setRestoreError("Couldn't read that file.");
      return;
    }
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setRestoreError(parsed.error);
      return;
    }
    const plan = planRestore(snapshot, parsed.backup);
    if (plan.errors.length > 0) setRestoreError(plan.errors[0]);
    else setRestorePlan(plan);
  };

  const confirmRestore = async () => {
    if (!restorePlan || !onRestore) return;
    try {
      const result = await onRestore(restorePlan);
      if (!result) return;
      if (result.status === "ok") {
        onAnnounce(`Restored ${plural(result.added, "record")}.`);
        resetRestore();
      } else {
        setRestorePlan(null);
        setRestoreError("This device changed after the preview. Nothing was restored. Choose the file again.");
      }
    } catch {
      setRestorePlan(null);
      setRestoreError("Couldn't restore. Nothing was changed. Try again.");
    }
  };

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

      {onRestore && (
        <div className="mt-4">
          <label
            htmlFor="restore-file"
            className="flex flex-col min-h-[44px] px-3 py-2 rounded-xl border border-[var(--paper-border)] bg-background text-sm text-foreground cursor-pointer focus-within:ring-2 focus-within:ring-ring"
          >
            Restore from backup…
            <span className="text-xs text-muted-foreground">
              Adds what's missing. Never overwrites anything already here.
            </span>
          </label>
          <input
            id="restore-file"
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(e) => void chooseFile(e.target.files?.[0])}
          />
        </div>
      )}
      {(restorePlan || restoreError) && (
        <div role="group" aria-labelledby="restore-heading" className="mt-3 rounded-2xl border border-[var(--paper-border)] bg-[var(--surface-elevated)] p-4">
          <h3 id="restore-heading" ref={previewHeadingRef} tabIndex={-1} className="font-medium text-foreground focus:outline-none">
            {restoreError ? "Can't restore this file" : "Restore preview"}
          </h3>
          {restoreError && (
            <p role="alert" className="text-sm text-foreground mt-2">
              {restoreError} Nothing was changed.
            </p>
          )}
          {restorePlan && (
            <>
              <p className="text-sm text-foreground mt-2">
                Backup from {localDate(new Date(restorePlan.exportedAt))}. Usage counts aren't part of backups.
              </p>
              <ul className="text-sm text-foreground mt-2 space-y-1 list-disc pl-5">
                <li>
                  Will add {plural(restorePlan.add.captures.length, "capture")},{" "}
                  {plural(restorePlan.add.destinations.length, "destination")}, and{" "}
                  {plural(restorePlan.add.handoffs.length, "status", "statuses")}.
                </li>
                <li>Already here, skipped: {restorePlan.identical}.</li>
                {restorePlan.conflicts.length > 0 && (
                  <li>
                    Kept as they are on this device: {restorePlan.conflicts.length}{" "}
                    ({restorePlan.conflicts.slice(0, 3).map((c) => `a ${c.kind}: ${c.reason}`).join("; ")}
                    {restorePlan.conflicts.length > 3 ? "; …" : ""}).
                  </li>
                )}
              </ul>
            </>
          )}
          <div className="mt-3 flex gap-2">
            {restorePlan && (
              <button
                type="button"
                onClick={confirmRestore}
                disabled={
                  restorePlan.add.captures.length + restorePlan.add.destinations.length + restorePlan.add.handoffs.length === 0
                }
                className="min-h-[44px] px-4 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50"
              >
                Restore
              </button>
            )}
            <button type="button" onClick={resetRestore} className={buttonClass}>
              {restorePlan ? "Cancel" : "Close"}
            </button>
          </div>
        </div>
      )}

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
