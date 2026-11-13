import type { WriteLaterDb } from "../storage/db";
import { saveCapture } from "../storage/captures";
import { assignCapture, createDestinations, loadSnapshot } from "../storage/handoffs";

/**
 * Synthetic sample content for demo mode (?demo=1). Written only to the
 * separate demo database, and only when it is empty.
 */
const DEMO_CAPTURES: Array<{ id: string; text: string; destinationId: string | null }> = [
  { id: "demo-c1", text: "Sample: pay the studio invoice before Friday", destinationId: "demo-planner" },
  { id: "demo-c2", text: "Sample: ask about leaving early Thursday", destinationId: "demo-planner" },
  { id: "demo-c3", text: "Sample: why do I avoid sharing unfinished work?", destinationId: "demo-vault" },
  { id: "demo-c4", text: "Sample: buy a travel adapter", destinationId: null },
  { id: "demo-c5", text: "Sample: look up weekend pottery classes", destinationId: null },
  { id: "demo-c6", text: "Sample reflection: things feel lighter once they have a place", destinationId: null },
];

export async function seedDemo(db: WriteLaterDb): Promise<void> {
  const existing = await loadSnapshot(db);
  if (existing.captures.length > 0 || existing.destinations.length > 0) return;

  await createDestinations(db, [
    { id: "demo-planner", name: "Weekly Planner", kind: "paper", section: "This Week" },
    { id: "demo-vault", name: "Obsidian", kind: "digital", section: "Personal University" },
  ]);

  const start = Date.now() - DEMO_CAPTURES.length * 60_000;
  for (const [index, sample] of DEMO_CAPTURES.entries()) {
    await saveCapture(db, { opId: sample.id, text: sample.text }, () => new Date(start + index * 60_000));
    if (sample.destinationId) {
      await assignCapture(db, {
        opId: `${sample.id}-assign`,
        captureId: sample.id,
        destinationId: sample.destinationId,
      });
    }
  }
}
