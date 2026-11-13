import { z } from "zod";
import { SCHEMA_VERSION } from "./db";
import { BACKUP_FORMAT } from "../lib/export";

// Backup validation lives in its own module so zod is only downloaded when
// someone actually restores (it's loaded with a dynamic import).

/** Files above this size are rejected before they are read. */
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
/** Total records across all collections. */
export const MAX_BACKUP_RECORDS = 50_000;

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be a date");
const id = z.string().min(1).max(200);

const captureSchema = z.object({
  id,
  text: z.string().min(1).max(100_000),
  sourceLabel: z.string().max(1_000).optional(),
  sourceRef: z.string().max(2_000).optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
  rev: z.number().int().positive(),
});

const destinationSchema = z.object({
  id,
  name: z.string().min(1).max(200),
  kind: z.enum(["paper", "digital"]),
  section: z.string().max(200).optional(),
  archivedAt: isoDate.optional(),
  createdAt: isoDate,
  rev: z.number().int().positive(),
});

const handoffSchema = z.object({
  id,
  captureId: id,
  destinationId: id.nullable(),
  excerpt: z.string().max(100_000).optional(),
  state: z.enum(["pending", "deferred", "completed", "discarded"]),
  revisitOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  resolvedAt: isoDate.optional(),
  resolvedVia: z.enum(["written", "added", "discarded"]).optional(),
  copiedAt: isoDate.optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
  rev: z.number().int().positive(),
});

// Unknown fields are dropped (zod's default), so a backup with extra optional
// fields from a same-version build still restores cleanly.
const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.number().int().min(1),
  exportedAt: isoDate,
  captures: z.array(captureSchema).default([]),
  destinations: z.array(destinationSchema).default([]),
  handoffs: z.array(handoffSchema).default([]),
});

export type ParsedBackup = z.infer<typeof backupSchema>;

export type ParseResult = { ok: true; backup: ParsedBackup } | { ok: false; error: string };

function duplicateId(items: Array<{ id: string }>): string | null {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) return item.id;
    seen.add(item.id);
  }
  return null;
}

/**
 * Parses and validates a backup file's text. Never throws; every failure
 * comes back as a message that is safe to show (it contains no file content).
 */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) {
    return { ok: false, error: "The file is larger than 10 MB." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "The file isn't valid JSON." };
  }
  if (!raw || typeof raw !== "object" || (raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    return { ok: false, error: "The file isn't a WriteLater backup." };
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version === "number" && version > SCHEMA_VERSION) {
    return { ok: false, error: "The backup was made by a newer version of WriteLater. Update the app and try again." };
  }

  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.join(".");
    return { ok: false, error: `The backup has an invalid value at ${where || "the top level"}.` };
  }
  const backup = parsed.data;

  const total = backup.captures.length + backup.destinations.length + backup.handoffs.length;
  if (total > MAX_BACKUP_RECORDS) {
    return { ok: false, error: `The backup has more than ${MAX_BACKUP_RECORDS.toLocaleString()} records.` };
  }
  for (const [kind, items] of [
    ["capture", backup.captures],
    ["destination", backup.destinations],
    ["status", backup.handoffs],
  ] as const) {
    if (duplicateId(items)) return { ok: false, error: `The backup lists the same ${kind} twice.` };
  }
  return { ok: true, backup };
}
