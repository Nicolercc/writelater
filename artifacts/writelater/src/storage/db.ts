import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * IndexedDB schema version. Migrations must be additive (new stores, indexes,
 * or optional fields) so an older build can still open a newer database.
 *
 * v1: captures
 * v2: destinations, handoffs
 * v3: events (usage counts; never any writing)
 */
export const SCHEMA_VERSION = 3;

export const DEFAULT_DB_NAME = "writelater";
/** Demo content lives in its own database so it never mixes with real writing. */
export const DEMO_DB_NAME = "writelater-demo";

export interface StoredCapture {
  /** The operation ID minted when the draft started; reused on every retry. */
  id: string;
  text: string;
  sourceLabel?: string;
  sourceRef?: string;
  createdAt: string;
  updatedAt: string;
  /** Incremented on every update; used for stale-write checks. */
  rev: number;
}

export type DestinationKind = "paper" | "digital";

export interface StoredDestination {
  id: string;
  /** Display name; may change while the ID stays stable. */
  name: string;
  kind: DestinationKind;
  /** Optional page or section, e.g. "This Week" or "Personal University". */
  section?: string;
  archivedAt?: string;
  createdAt: string;
  rev: number;
}

export type HandoffState = "pending" | "deferred" | "completed" | "discarded";
export type HandoffResolution = "written" | "added" | "discarded";

export interface StoredHandoff {
  /** The operation ID of the assignment that created it. */
  id: string;
  captureId: string;
  /** Null only for a capture let go straight from Unsorted. */
  destinationId: string | null;
  /** Reserved for multiple excerpts; absent means the whole capture. */
  excerpt?: string;
  state: HandoffState;
  /** Local calendar date (YYYY-MM-DD) a deferred handoff returns to its queue. */
  revisitOn?: string;
  resolvedAt?: string;
  resolvedVia?: HandoffResolution;
  /** Set when the text was copied for a digital destination. Copying never completes a handoff. */
  copiedAt?: string;
  createdAt: string;
  updatedAt: string;
  rev: number;
}

export type UsageEventType =
  | "capture_saved"
  | "save_failed"
  | "review_opened"
  | "handoff_sorted"
  | "handoff_confirmed_paper"
  | "handoff_confirmed_digital"
  | "handoff_let_go"
  | "handoff_deferred"
  | "copy_succeeded"
  | "copy_failed"
  | "undo"
  | "wanted_other_device";

/** A usage event: a type and a time. Never text, titles, or destination names. */
export interface StoredEvent {
  id: string;
  type: UsageEventType;
  at: string;
}

export interface WriteLaterSchema extends DBSchema {
  captures: {
    key: string;
    value: StoredCapture;
    indexes: { by_createdAt: string };
  };
  destinations: {
    key: string;
    value: StoredDestination;
  };
  handoffs: {
    key: string;
    value: StoredHandoff;
    indexes: { by_capture: string };
  };
  events: {
    key: string;
    value: StoredEvent;
    indexes: { by_at: string };
  };
}

export type WriteLaterDb = IDBPDatabase<WriteLaterSchema>;

/**
 * - `versionchange`: a newer version of the app opened the database in another
 *   tab. This connection has been closed; the page must reload to keep saving.
 * - `blocked`: this tab wants to upgrade but an older tab still holds the
 *   database open.
 */
export type DbLifecycleEvent = "versionchange" | "blocked";

export function openWriteLaterDb(
  name: string = DEFAULT_DB_NAME,
  onLifecycleEvent?: (event: DbLifecycleEvent) => void,
  version: number = SCHEMA_VERSION,
): Promise<WriteLaterDb> {
  const dbPromise: Promise<WriteLaterDb> = openDB<WriteLaterSchema>(name, version, {
    upgrade(db, oldVersion, newVersion) {
      const target = newVersion ?? version;
      if (oldVersion < 1 && target >= 1) {
        const captures = db.createObjectStore("captures", { keyPath: "id" });
        captures.createIndex("by_createdAt", "createdAt");
      }
      if (oldVersion < 2 && target >= 2) {
        db.createObjectStore("destinations", { keyPath: "id" });
        const handoffs = db.createObjectStore("handoffs", { keyPath: "id" });
        handoffs.createIndex("by_capture", "captureId");
      }
      if (oldVersion < 3 && target >= 3) {
        const events = db.createObjectStore("events", { keyPath: "id" });
        events.createIndex("by_at", "at");
      }
    },
    blocked() {
      onLifecycleEvent?.("blocked");
    },
    blocking() {
      // Release the connection so the newer tab can upgrade.
      void dbPromise.then((db) => db.close());
      onLifecycleEvent?.("versionchange");
    },
  });
  return dbPromise;
}
