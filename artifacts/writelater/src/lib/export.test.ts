import { describe, expect, it } from "vitest";
import { buildBackup, buildMarkdownExport } from "./export";
import type { Snapshot } from "../storage/handoffs";

const at = (iso: string) => iso;

const snapshot: Snapshot = {
  captures: [
    { id: "c3", text: "SYNTHETIC unsorted", createdAt: at("2030-01-01T10:03:00Z"), updatedAt: at("2030-01-01T10:03:00Z"), rev: 1 },
    { id: "c2", text: "SYNTHETIC done\nsecond line", sourceRef: "https://example.test/private", createdAt: at("2030-01-01T10:02:00Z"), updatedAt: at("2030-01-01T10:02:00Z"), rev: 1 },
    { id: "c1", text: "SYNTHETIC pending", createdAt: at("2030-01-01T10:01:00Z"), updatedAt: at("2030-01-01T10:01:00Z"), rev: 1 },
    { id: "c4", text: "SYNTHETIC let go", createdAt: at("2030-01-01T10:04:00Z"), updatedAt: at("2030-01-01T10:04:00Z"), rev: 1 },
  ],
  destinations: [
    { id: "p", name: "Weekly Planner", kind: "paper", section: "This Week", createdAt: at("2030-01-01T09:00:00Z"), rev: 1 },
    { id: "v", name: "Obsidian", kind: "digital", createdAt: at("2030-01-01T09:00:01Z"), rev: 1 },
  ],
  handoffs: [
    { id: "h1", captureId: "c1", destinationId: "p", state: "pending", createdAt: at("2030-01-01T11:00:00Z"), updatedAt: at("2030-01-01T11:00:00Z"), rev: 1 },
    { id: "h2", captureId: "c2", destinationId: "v", state: "completed", resolvedVia: "added", resolvedAt: new Date(2030, 0, 2, 12).toISOString(), createdAt: at("2030-01-01T11:01:00Z"), updatedAt: at("2030-01-01T11:01:00Z"), rev: 2 },
    { id: "h4", captureId: "c4", destinationId: null, state: "discarded", resolvedVia: "discarded", resolvedAt: at("2030-01-01T11:02:00Z"), createdAt: at("2030-01-01T11:02:00Z"), updatedAt: at("2030-01-01T11:02:00Z"), rev: 1 },
  ],
};

describe("buildBackup", () => {
  it("includes every record with a format and schema version", () => {
    const backup = buildBackup(snapshot, new Date("2030-02-01T00:00:00Z"));
    expect(backup).toMatchObject({ format: "writelater-backup", schemaVersion: expect.any(Number), exportedAt: "2030-02-01T00:00:00.000Z" });
    expect(backup.captures).toHaveLength(4);
    expect(backup.handoffs).toHaveLength(3);
    expect(JSON.stringify(backup)).toContain("https://example.test/private");
  });
});

describe("buildMarkdownExport", () => {
  const md = buildMarkdownExport(snapshot, new Date(2030, 1, 1));

  it("groups by Unsorted, destination, and Let go", () => {
    expect(md).toBe(
      [
        "# WriteLater export",
        "",
        "Exported 2030-02-01",
        "",
        "## Unsorted",
        "- SYNTHETIC unsorted",
        "",
        "## Weekly Planner · This Week (paper)",
        "- [ ] SYNTHETIC pending",
        "",
        "## Obsidian (digital)",
        "- [x] SYNTHETIC done",
        "  second line _(Added 2030-01-02)_",
        "",
        "## Let go",
        "- SYNTHETIC let go",
        "",
      ].join("\n"),
    );
  });

  it("leaves out source references", () => {
    expect(md).not.toContain("example.test");
  });
});
