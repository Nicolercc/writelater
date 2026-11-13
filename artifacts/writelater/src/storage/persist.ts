/**
 * Browser storage durability. By default an origin's data is "best-effort":
 * the browser may clear it under storage pressure or, in Safari, after a
 * period without use. A persistent grant exempts it from automatic eviction.
 * Browsers decide grants with their own heuristics (Safari favors Home Screen
 * apps; Chrome favors engagement); Firefox asks the person.
 */

export type PersistenceState = "persisted" | "best-effort" | "unsupported";

export interface StorageStatus {
  persistence: PersistenceState;
  /** Bytes used by this origin, when the browser reports it. */
  usage?: number;
  /** Bytes available to this origin, when the browser reports it. */
  quota?: number;
}

type StorageManagerLike = Pick<StorageManager, "persisted" | "persist" | "estimate">;

function manager(): Partial<StorageManagerLike> | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.storage;
}

export async function getStorageStatus(
  storage: Partial<StorageManagerLike> | undefined = manager(),
): Promise<StorageStatus> {
  if (!storage?.persisted) return { persistence: "unsupported" };
  let persisted = false;
  try {
    persisted = await storage.persisted();
  } catch {
    return { persistence: "unsupported" };
  }
  const status: StorageStatus = { persistence: persisted ? "persisted" : "best-effort" };
  try {
    const estimate = await storage.estimate?.();
    if (estimate?.usage !== undefined) status.usage = estimate.usage;
    if (estimate?.quota !== undefined) status.quota = estimate.quota;
  } catch {
    // Estimates are optional.
  }
  return status;
}

/**
 * Asks the browser to keep this origin's data. Resolves the resulting state;
 * never throws. Safe to call repeatedly: it's a no-op once granted.
 */
export async function requestPersistence(
  storage: Partial<StorageManagerLike> | undefined = manager(),
): Promise<PersistenceState> {
  if (!storage?.persist || !storage.persisted) return "unsupported";
  try {
    if (await storage.persisted()) return "persisted";
    return (await storage.persist()) ? "persisted" : "best-effort";
  } catch {
    return "best-effort";
  }
}

/** "1.2 MB" style formatting for storage figures. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
