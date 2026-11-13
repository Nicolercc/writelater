import React, { useState } from "react";
import type { DestinationKind } from "../../storage/db";

export interface DestinationDraft {
  name: string;
  kind: DestinationKind;
  section?: string;
}

const inputClass =
  "w-full min-h-[44px] rounded-xl border border-[var(--paper-border)] bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelClass = "block text-sm font-medium text-foreground mb-1";

interface SetupProps {
  onSave: (drafts: DestinationDraft[]) => Promise<void>;
  onSkip: () => void;
}

/** First-run setup: one paper and one digital destination. Skippable. */
export function DestinationSetup({ onSave, onSkip }: SetupProps) {
  const [paperName, setPaperName] = useState("Weekly Planner");
  const [paperSection, setPaperSection] = useState("This Week");
  const [digitalName, setDigitalName] = useState("Obsidian");
  const [digitalSection, setDigitalSection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const drafts: DestinationDraft[] = [];
    if (paperName.trim()) drafts.push({ name: paperName, kind: "paper", section: paperSection });
    if (digitalName.trim()) drafts.push({ name: digitalName, kind: "digital", section: digitalSection });
    if (drafts.length === 0) {
      setError("Name at least one destination, or skip for now.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(drafts);
    } catch {
      setError("Couldn't save destinations. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      aria-labelledby="setup-heading"
      className="bg-[var(--surface-elevated)] border border-[var(--paper-border)] rounded-2xl p-4 space-y-4"
    >
      <div>
        <h2 id="setup-heading" className="font-serif text-lg text-foreground">
          Where does your writing go?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Add the places you move thoughts into. You can rename them later.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
          Paper
        </legend>
        <label className={labelClass} htmlFor="setup-paper-name">Name</label>
        <input id="setup-paper-name" className={inputClass} value={paperName} onChange={(e) => setPaperName(e.target.value)} />
        <label className={labelClass} htmlFor="setup-paper-section">Page or section (optional)</label>
        <input id="setup-paper-section" className={inputClass} value={paperSection} onChange={(e) => setPaperSection(e.target.value)} />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
          Digital
        </legend>
        <label className={labelClass} htmlFor="setup-digital-name">Name</label>
        <input id="setup-digital-name" className={inputClass} value={digitalName} onChange={(e) => setDigitalName(e.target.value)} />
        <label className={labelClass} htmlFor="setup-digital-section">Folder or note (optional)</label>
        <input id="setup-digital-section" className={inputClass} value={digitalSection} onChange={(e) => setDigitalSection(e.target.value)} />
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-foreground">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-foreground font-medium"
        >
          Save destinations
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="min-h-[44px] px-4 rounded-xl border border-[var(--paper-border)] text-foreground"
        >
          Skip for now
        </button>
      </div>
    </form>
  );
}

interface AddProps {
  onAdd: (draft: DestinationDraft) => Promise<void>;
}

/** Collapsible form to add one more destination. */
export function AddDestinationForm({ onAdd }: AddProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DestinationKind>("paper");
  const [section, setSection] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give the destination a name.");
      return;
    }
    try {
      await onAdd({ name, kind, section });
      setName("");
      setSection("");
      setError(null);
      setOpen(false);
    } catch {
      setError("Couldn't add that destination. Try again.");
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full min-h-[44px] rounded-xl border border-dashed border-[var(--paper-border)] text-sm text-foreground"
      >
        + Add a destination
      </button>
    );
  }

  return (
    <form onSubmit={submit} aria-label="Add a destination" className="border border-[var(--paper-border)] rounded-2xl p-4 space-y-2">
      <label className={labelClass} htmlFor="add-dest-name">Name</label>
      <input id="add-dest-name" autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      <fieldset className="flex gap-4 py-1">
        <legend className={labelClass}>Kind</legend>
        {(["paper", "digital"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2 min-h-[44px] text-sm text-foreground capitalize">
            <input type="radio" name="add-dest-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
            {k}
          </label>
        ))}
      </fieldset>
      <label className={labelClass} htmlFor="add-dest-section">Page, section, or folder (optional)</label>
      <input id="add-dest-section" className={inputClass} value={section} onChange={(e) => setSection(e.target.value)} />
      {error && <p role="alert" className="text-sm text-foreground">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-foreground font-medium">
          Add
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] px-4 rounded-xl border border-[var(--paper-border)] text-foreground">
          Cancel
        </button>
      </div>
    </form>
  );
}
