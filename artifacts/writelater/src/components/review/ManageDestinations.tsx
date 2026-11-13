import React, { useState } from "react";
import type { StoredDestination } from "../../storage/db";
import type { ActionOutcome } from "../../hooks/useWriteLater";

interface ManageDestinationsProps {
  destinations: StoredDestination[];
  /** Pending plus deferred items per destination ID. */
  waitingCounts: Map<string, number>;
  busy: boolean;
  // Each resolves undefined when ignored because another write is in flight.
  rename: (d: StoredDestination, input: { name: string; section?: string }) => Promise<ActionOutcome | undefined>;
  archive: (
    d: StoredDestination,
    reassignTo: string | null,
  ) => Promise<(ActionOutcome & { moved?: number }) | undefined>;
  restore: (d: StoredDestination) => Promise<ActionOutcome | undefined>;
  /** Announces a result and optionally moves focus to an element ID. */
  onResult: (message: string, focusId?: string) => void;
}

const inputClass =
  "w-full min-h-[44px] rounded-xl border border-[var(--paper-border)] bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelClass = "block text-sm font-medium text-foreground mb-1";
const primaryButton = "min-h-[44px] px-4 rounded-xl bg-primary text-primary-foreground font-medium text-sm";
const secondaryButton =
  "min-h-[44px] px-3 rounded-xl border border-[var(--paper-border)] bg-background text-foreground text-sm";

const UNSORTED = "__unsorted__";

function failureMessage(outcome: ActionOutcome): string {
  return outcome.status === "stale"
    ? "That destination changed in another tab. Showing the latest."
    : "That destination no longer exists. Showing the latest.";
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function DestinationCard({
  destination,
  others,
  waiting,
  busy,
  rename,
  archive,
  onResult,
}: {
  destination: StoredDestination;
  others: StoredDestination[];
  waiting: number;
} & Pick<ManageDestinationsProps, "busy" | "rename" | "archive" | "onResult">) {
  const [mode, setMode] = useState<"idle" | "rename" | "archive">("idle");
  const [name, setName] = useState(destination.name);
  const [section, setSection] = useState(destination.section ?? "");
  const [target, setTarget] = useState<string>(others[0]?.id ?? UNSORTED);
  const [error, setError] = useState<string | null>(null);
  const renameId = `rename-${destination.id}`;

  const submitRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give the destination a name.");
      return;
    }
    try {
      const outcome = await rename(destination, { name, section });
      if (!outcome) return;
      if (outcome.status === "ok") {
        setMode("idle");
        setError(null);
        onResult(`Renamed to ${name.trim()}.`, renameId);
      } else {
        setMode("idle");
        onResult(failureMessage(outcome));
      }
    } catch {
      setError("Couldn't rename. Try again.");
    }
  };

  const submitArchive = async (e: React.FormEvent) => {
    e.preventDefault();
    const reassignTo = target === UNSORTED ? null : target;
    try {
      const outcome = await archive(destination, reassignTo);
      if (!outcome) return;
      if (outcome.status === "ok") {
        const where =
          reassignTo === null ? "Unsorted" : others.find((d) => d.id === reassignTo)?.name ?? "the other destination";
        const moved = outcome.moved ?? 0;
        onResult(
          moved > 0
            ? `Archived ${destination.name}. Moved ${plural(moved, "item")} to ${where}.`
            : `Archived ${destination.name}.`,
        );
      } else {
        setMode("idle");
        onResult(failureMessage(outcome));
      }
    } catch {
      setError("Couldn't archive. Nothing was changed. Try again.");
    }
  };

  const label = destination.section ? `${destination.name} · ${destination.section}` : destination.name;

  return (
    <li className="bg-[var(--surface)] border border-[var(--paper-border)] rounded-2xl p-4">
      <p className="text-[15px] font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {destination.kind === "paper" ? "Paper" : "Digital"} · {plural(waiting, "item")} waiting
      </p>

      {mode === "idle" && (
        <div className="mt-3 flex gap-2">
          <button id={renameId} type="button" disabled={busy} className={secondaryButton}
            onClick={() => { setName(destination.name); setSection(destination.section ?? ""); setError(null); setMode("rename"); }}>
            Rename<span className="sr-only"> {destination.name}</span>
          </button>
          <button type="button" disabled={busy} className={secondaryButton}
            onClick={() => { setTarget(others[0]?.id ?? UNSORTED); setError(null); setMode("archive"); }}>
            Archive<span className="sr-only"> {destination.name}</span>
          </button>
        </div>
      )}

      {mode === "rename" && (
        <form onSubmit={submitRename} aria-label={`Rename ${destination.name}`} className="mt-3 space-y-2">
          <label className={labelClass} htmlFor={`name-${destination.id}`}>Name</label>
          <input id={`name-${destination.id}`} autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          <label className={labelClass} htmlFor={`section-${destination.id}`}>
            {destination.kind === "paper" ? "Page or section" : "Folder or note"} (optional)
          </label>
          <input id={`section-${destination.id}`} className={inputClass} value={section} onChange={(e) => setSection(e.target.value)} />
          {error && <p role="alert" className="text-sm text-foreground">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={busy} className={primaryButton}>Save</button>
            <button type="button" className={secondaryButton} onClick={() => setMode("idle")}>Cancel</button>
          </div>
        </form>
      )}

      {mode === "archive" && (
        <form onSubmit={submitArchive} aria-label={`Archive ${destination.name}`} className="mt-3 space-y-2">
          <p className="text-sm text-foreground">
            {waiting > 0
              ? `${plural(waiting, "item")} still waiting. Where should ${waiting === 1 ? "it" : "they"} go?`
              : "Nothing is waiting here. Done items stay in your history."}
          </p>
          {waiting > 0 && (
            <fieldset className="space-y-1">
              <legend className="sr-only">Move waiting items to</legend>
              {[...others.map((d) => ({ id: d.id, label: d.name })), { id: UNSORTED, label: "Back to Unsorted" }].map(
                (option, i) => (
                  <label key={option.id} className="flex items-center gap-2 min-h-[44px] text-sm text-foreground">
                    <input
                      type="radio"
                      name={`archive-target-${destination.id}`}
                      value={option.id}
                      checked={target === option.id}
                      autoFocus={i === 0}
                      onChange={() => setTarget(option.id)}
                    />
                    {option.label}
                  </label>
                ),
              )}
            </fieldset>
          )}
          {error && <p role="alert" className="text-sm text-foreground">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={busy} autoFocus={waiting === 0} className={primaryButton}>
              Archive {destination.name}
            </button>
            <button type="button" className={secondaryButton} onClick={() => setMode("idle")}>Cancel</button>
          </div>
        </form>
      )}
    </li>
  );
}

/** Rename, archive (with reassignment), and restore destinations. */
export function ManageDestinations(props: ManageDestinationsProps) {
  const { destinations, waitingCounts, busy, restore, onResult } = props;
  const active = destinations.filter((d) => !d.archivedAt);
  const archived = destinations.filter((d) => d.archivedAt);

  const doRestore = async (d: StoredDestination) => {
    try {
      const outcome = await restore(d);
      if (!outcome) return;
      onResult(outcome.status === "ok" ? `Restored ${d.name}.` : failureMessage(outcome));
    } catch {
      onResult("Couldn't restore. Try again.");
    }
  };

  return (
    <>
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No active destinations.</p>
      ) : (
        <ul className="space-y-3" aria-label="Active destinations">
          {active.map((d) => (
            <DestinationCard
              key={`${d.id}-${d.rev}`}
              destination={d}
              others={active.filter((o) => o.id !== d.id)}
              waiting={waitingCounts.get(d.id) ?? 0}
              {...props}
            />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <section aria-labelledby="archived-heading" className="mt-6">
          <h2 id="archived-heading" className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Archived
          </h2>
          <ul className="space-y-2">
            {archived.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-muted/40">
                <span className="flex-1 text-sm text-foreground">{d.name}</span>
                <button type="button" disabled={busy} className={secondaryButton} onClick={() => doRestore(d)}>
                  Restore<span className="sr-only"> {d.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
