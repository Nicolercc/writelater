import { SCHEMA_VERSION, type StoredDestination, type StoredHandoff } from "../storage/db";
import type { Snapshot } from "../storage/handoffs";
import { localDate } from "./review";

export const BACKUP_FORMAT = "writelater-backup";

export interface Backup extends Snapshot {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
}

/** Versioned JSON backup of all writing records, including source references. */
export function buildBackup(snapshot: Snapshot, now: Date = new Date()): Backup {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    captures: snapshot.captures,
    destinations: snapshot.destinations,
    handoffs: snapshot.handoffs,
  };
}

/** One Markdown list item; continuation lines are indented so lists stay intact. */
function listItem(prefix: string, text: string): string {
  const [first, ...rest] = text.trim().split("\n");
  return [`${prefix}${first}`, ...rest.map((line) => `  ${line}`)].join("\n");
}

function heading(destination: StoredDestination): string {
  const name = destination.section ? `${destination.name} · ${destination.section}` : destination.name;
  return `## ${name} (${destination.kind})`;
}

function resolvedNote(handoff: StoredHandoff): string {
  const day = handoff.resolvedAt ? localDate(new Date(handoff.resolvedAt)) : "";
  const verb = handoff.resolvedVia === "written" ? "Written" : "Added";
  return day ? ` _(${verb} ${day})_` : "";
}

/**
 * Human-readable export grouped by destination. Capture text only: source
 * references are left out.
 */
export function buildMarkdownExport(snapshot: Snapshot, now: Date = new Date()): string {
  const captureById = new Map(snapshot.captures.map((c) => [c.id, c]));
  const sortedIds = new Set(snapshot.handoffs.map((h) => h.captureId));
  const byCreated = (a: { createdAt: string }, b: { createdAt: string }) =>
    a.createdAt.localeCompare(b.createdAt);

  const sections: string[] = [`# WriteLater export`, `Exported ${localDate(now)}`];

  const unsorted = snapshot.captures.filter((c) => !sortedIds.has(c.id)).sort(byCreated);
  if (unsorted.length > 0) {
    sections.push(["## Unsorted", ...unsorted.map((c) => listItem("- ", c.text))].join("\n"));
  }

  for (const destination of snapshot.destinations) {
    const mine = snapshot.handoffs
      .filter((h) => h.destinationId === destination.id && h.state !== "discarded")
      .sort(byCreated);
    const lines = mine.flatMap((h) => {
      const capture = captureById.get(h.captureId);
      if (!capture) return [];
      if (h.state === "completed") return [listItem("- [x] ", capture.text) + resolvedNote(h)];
      const later = h.state === "deferred" && h.revisitOn ? ` _(later: ${h.revisitOn})_` : "";
      return [listItem("- [ ] ", capture.text) + later];
    });
    if (lines.length > 0) sections.push([heading(destination), ...lines].join("\n"));
  }

  const letGo = snapshot.handoffs
    .filter((h) => h.state === "discarded")
    .sort(byCreated)
    .flatMap((h) => {
      const capture = captureById.get(h.captureId);
      return capture ? [listItem("- ", capture.text)] : [];
    });
  if (letGo.length > 0) sections.push(["## Let go", ...letGo].join("\n"));

  return sections.join("\n\n") + "\n";
}

/** Triggers a browser download of a text file. */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
