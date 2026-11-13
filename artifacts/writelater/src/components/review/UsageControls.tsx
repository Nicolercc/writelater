import React, { useState } from "react";
import type { UsageSummary } from "../../storage/usage";
import type { Download } from "./DataPanel";
import { localDate } from "../../lib/review";

interface UsageControlsProps {
  loadSummary: () => Promise<UsageSummary>;
  download: Download;
  onWantedOtherDevice: () => void;
  onAnnounce: (message: string) => void;
}

const buttonClass =
  "min-h-[44px] px-3 rounded-xl border border-[var(--paper-border)] bg-background text-foreground text-sm text-left";

/**
 * Pilot instrumentation the participant controls: a shareable summary that
 * holds counts and dates only, and a one-tap note about wanting another device.
 */
export function UsageControls({ loadSummary, download, onWantedOtherDevice, onAnnounce }: UsageControlsProps) {
  const [preview, setPreview] = useState<string | null>(null);

  const exportSummary = async () => {
    try {
      const summary = await loadSummary();
      download(
        `writelater-usage-${localDate()}.json`,
        JSON.stringify(summary, null, 2),
        "application/json",
      );
      onAnnounce("Usage summary file created.");
    } catch {
      onAnnounce("Couldn't create the usage summary. Try again.");
    }
  };

  const togglePreview = async (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!e.currentTarget.open) return;
    try {
      setPreview(JSON.stringify(await loadSummary(), null, 2));
    } catch {
      setPreview("Couldn't load the summary.");
    }
  };

  return (
    <>
      <button type="button" onClick={exportSummary} className={buttonClass}>
        Download usage summary
        <span className="block text-xs text-muted-foreground">
          Counts per day only. No writing, titles, destination names, or times of day.
        </span>
      </button>
      <details onToggle={togglePreview} className="text-sm">
        <summary className="cursor-pointer min-h-[44px] flex items-center text-foreground">
          See exactly what the summary contains
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-muted/40 p-3 text-xs text-foreground whitespace-pre-wrap">
          {preview ?? "Loading…"}
        </pre>
      </details>
      <button
        type="button"
        onClick={() => {
          onWantedOtherDevice();
          onAnnounce("Noted. This counts toward whether WriteLater should sync between devices.");
        }}
        className={buttonClass}
      >
        I wanted to do this on another device
        <span className="block text-xs text-muted-foreground">
          WriteLater doesn't sync yet. Tapping this records that you wanted it to.
        </span>
      </button>
    </>
  );
}
