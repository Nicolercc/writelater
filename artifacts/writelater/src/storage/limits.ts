/**
 * Size limits shared by saving and restoring, so a backup WriteLater
 * produces is always one WriteLater can restore.
 */

/** Longest capture that can be saved. Restore accepts longer text, so older backups still restore. */
export const MAX_CAPTURE_CHARS = 100_000;

/** Largest backup file restore will read. */
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

/** Most records (captures + destinations + statuses) one restore will take. */
export const MAX_BACKUP_RECORDS = 250_000;

export class CaptureTooLongError extends Error {
  constructor(public readonly length: number) {
    super(`Capture is ${length} characters; the limit is ${MAX_CAPTURE_CHARS}.`);
    this.name = "CaptureTooLongError";
  }
}
