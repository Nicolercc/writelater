import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { CaptureComposer } from "../components/CaptureComposer";
import { loadDraft, newOpId, storeDraft } from "../storage/draft";
import type { SaveCaptureInput } from "../storage/captures";
import type { StoreStatus, SaveOutcome } from "../hooks/useWriteLater";

interface CaptureScreenProps {
  /** Database the draft belongs to, so demo and real drafts never mix. */
  dbName: string;
  storageStatus: StoreStatus;
  onSave: (input: SaveCaptureInput) => Promise<SaveOutcome>;
  /** Unsorted plus pending handoffs. */
  waitingCount: number;
  onOpenReview: () => void;
  /** Called when a save fails, for local usage counts. */
  onSaveFailed?: () => void;
}

function describeSaveError(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  if (name === "CaptureTooLongError") {
    return "Not saved: this is longer than 100,000 characters. Your text is still here.";
  }
  if (name === "QuotaExceededError") {
    return "Not saved: this device is out of storage. Your text is still here.";
  }
  return "Not saved. Your text is still here.";
}

export function CaptureScreen({
  dbName,
  storageStatus,
  onSave,
  waitingCount,
  onOpenReview,
  onSaveFailed,
}: CaptureScreenProps) {
  const [text, setText] = useState(() => loadDraft(dbName)?.text ?? "");
  // The field stays editable during a save, so the save handler reads the
  // latest text from here rather than from its own (older) closure.
  const textRef = useRef(text);
  // Operation ID for the current draft: created when the draft becomes
  // non-empty, reused on every retry, retired after a committed save.
  const opIdRef = useRef<string | null>(loadDraft(dbName)?.opId ?? null);
  // Ref guard so two taps in the same frame can't both start a save.
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (errorMessage) retryRef.current?.focus();
  }, [errorMessage]);

  const dateLine =
    new Date().toLocaleDateString("en-US", { weekday: "long" }) +
    " · Planner away mode";

  const handleChange = (value: string) => {
    textRef.current = value;
    setText(value);
    setStatusMessage("");
    if (value.length === 0) {
      opIdRef.current = null;
      storeDraft(dbName, null);
      return;
    }
    if (!opIdRef.current) opIdRef.current = newOpId();
    storeDraft(dbName, { opId: opIdRef.current, text: value });
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    const trimmed = text.trim();
    if (!trimmed || storageStatus !== "ready") return;
    if (!opIdRef.current) opIdRef.current = newOpId();
    const submittedText = text;

    savingRef.current = true;
    setSaving(true);
    setErrorMessage(null);
    setStatusMessage("");

    try {
      const result = await onSave({ opId: opIdRef.current, text: trimmed });
      // The submitted text is committed, so its operation ID is retired.
      // Clear the field only if it still holds exactly what was submitted:
      // anything typed during the save is a new draft with a new ID.
      const current = textRef.current;
      const keptTyping = current !== submittedText && current.trim().length > 0;
      if (keptTyping) {
        opIdRef.current = newOpId();
        storeDraft(dbName, { opId: opIdRef.current, text: current });
      } else {
        opIdRef.current = null;
        storeDraft(dbName, null);
        textRef.current = "";
        setText("");
      }
      const where = result.status === "created" ? "Saved to Unsorted." : "Already saved to Unsorted. Nothing was duplicated.";
      setStatusMessage(keptTyping ? `${where} What you typed since is still here.` : where);
      textareaRef.current?.focus();
    } catch (err) {
      setErrorMessage(describeSaveError(err));
      onSaveFailed?.();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleClear = () => {
    textRef.current = "";
    setText("");
    opIdRef.current = null;
    storeDraft(dbName, null);
    setErrorMessage(null);
    setStatusMessage("");
    textareaRef.current?.focus();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="pb-24"
    >
      <div className="px-5 pt-5 pb-2">
        <div className="text-xs text-muted-foreground tracking-wide mb-2">
          {dateLine}
        </div>
        <h1 className="font-serif text-2xl font-medium text-foreground leading-snug">
          What do you need to write later?
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          Catch the thought now. We'll help you place it later.
        </p>
      </div>

      {storageStatus === "error" && (
        <div
          role="alert"
          className="mx-5 mb-3 bg-destructive/10 border border-destructive/30 rounded-2xl px-4 py-3 text-sm text-foreground"
        >
          Storage isn't available in this browser, so captures can't be saved.
          Private browsing can block it.
        </div>
      )}
      {storageStatus === "blocked" && (
        <div
          role="alert"
          className="mx-5 mb-3 bg-destructive/10 border border-destructive/30 rounded-2xl px-4 py-3 text-sm text-foreground"
        >
          WriteLater is updating, but another tab still has the old version open.
          Close other WriteLater tabs to finish. Your draft is kept.
        </div>
      )}
      {storageStatus === "stale" && (
        <div
          role="alert"
          className="mx-5 mb-3 bg-destructive/10 border border-destructive/30 rounded-2xl px-4 py-3 flex items-center gap-3"
        >
          <span className="text-sm text-foreground flex-1">
            WriteLater was updated in another tab. Reload to keep saving. Your
            draft is kept.
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm font-medium px-3 py-2 min-h-[44px] rounded-lg bg-background border border-[var(--paper-border)] text-foreground"
          >
            Reload
          </button>
        </div>
      )}

      <CaptureComposer
        value={text}
        onChange={handleChange}
        onSave={handleSave}
        onClear={handleClear}
        onRetry={handleSave}
        storageReady={storageStatus === "ready"}
        saving={saving}
        statusMessage={statusMessage}
        errorMessage={errorMessage}
        textareaRef={textareaRef}
        retryRef={retryRef}
      />

      {storageStatus === "ready" && (
        <div className="mx-5 mt-4">
          <button
            type="button"
            onClick={onOpenReview}
            className="w-full flex items-center justify-between min-h-[44px] px-4 rounded-xl bg-[var(--surface-elevated)] border border-[var(--paper-border)] text-sm text-foreground"
          >
            <span>{waitingCount} waiting</span>
            <span className="inline-flex items-center gap-1 font-medium">
              Review <ChevronRight className="w-4 h-4" aria-hidden />
            </span>
          </button>
        </div>
      )}
    </motion.div>
  );
}
