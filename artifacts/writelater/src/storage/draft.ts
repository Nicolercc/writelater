/**
 * The unsaved draft and its operation ID, kept in localStorage so they survive
 * a reload or iOS discarding the tab. The operation ID is minted when the draft
 * first becomes non-empty, reused on every retry, and retired only after the
 * save commits.
 */
export interface Draft {
  opId: string;
  text: string;
}

const DRAFT_KEY_PREFIX = "writelater:draft:";

function key(dbName: string) {
  return DRAFT_KEY_PREFIX + dbName;
}

export function newOpId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older browsers: 128 random bits as hex.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function loadDraft(dbName: string): Draft | null {
  try {
    const raw = localStorage.getItem(key(dbName));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed.opId === "string" && typeof parsed.text === "string") {
      return { opId: parsed.opId, text: parsed.text };
    }
    return null;
  } catch {
    return null;
  }
}

export function storeDraft(dbName: string, draft: Draft | null): void {
  try {
    if (draft && draft.text.length > 0) {
      localStorage.setItem(key(dbName), JSON.stringify(draft));
    } else {
      localStorage.removeItem(key(dbName));
    }
  } catch {
    // Storage can be unavailable (private mode, quota). The draft then lives
    // only in memory, which is no worse than before.
  }
}

/**
 * Removes every localStorage entry WriteLater keeps for one database: the
 * draft, the last open Review queue, and the skipped-setup flag.
 */
export function clearLocalState(dbName: string): void {
  try {
    const suffix = `:${dbName}`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("writelater:") && k.endsWith(suffix)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    // Storage unavailable: nothing was stored there either.
  }
}
