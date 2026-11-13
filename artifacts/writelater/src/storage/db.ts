import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * IndexedDB schema version. Migrations must be additive (new stores, indexes,
 * or optional fields) so an older build can still open a newer database.
 */
export const SCHEMA_VERSION = 1;

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
  /** Incremented on every update; used for stale-write checks once edits exist. */
  rev: number;
}

interface WriteLaterSchema extends DBSchema {
  captures: {
    key: string;
    value: StoredCapture;
    indexes: { by_createdAt: string };
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
): Promise<WriteLaterDb> {
  const dbPromise: Promise<WriteLaterDb> = openDB<WriteLaterSchema>(
    name,
    SCHEMA_VERSION,
    {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const captures = db.createObjectStore("captures", { keyPath: "id" });
          captures.createIndex("by_createdAt", "createdAt");
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
    },
  );
  return dbPromise;
}
