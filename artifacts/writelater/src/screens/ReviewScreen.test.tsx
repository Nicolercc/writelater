import React from "react";
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewScreen } from "./ReviewScreen";
import { useWriteLater } from "../hooks/useWriteLater";
import { openWriteLaterDb } from "../storage/db";
import { saveCapture } from "../storage/captures";
import {
  assignCapture,
  createDestinations,
  loadSnapshot,
  resolveHandoff,
} from "../storage/handoffs";
import { addDays, localDate } from "../lib/review";
import { listEvents } from "../storage/usage";
import { buildBackup } from "../lib/export";

const DB = "writelater";
const TODAY = localDate();

function Harness({
  today = TODAY,
  copyText,
  download,
}: {
  today?: string;
  copyText?: (text: string) => Promise<boolean>;
  download?: (filename: string, content: string, mimeType: string) => void;
}) {
  const { status, snapshot, actions } = useWriteLater(DB);
  return (
    <ReviewScreen
      dbName={DB}
      status={status}
      snapshot={snapshot}
      actions={actions}
      today={today}
      onCapture={() => {}}
      copyText={copyText ?? (async () => true)}
      download={download ?? (() => {})}
    />
  );
}

async function seed(opts: { assigned?: Array<[string, string]>; unsorted?: string[] } = {}) {
  const db = await openWriteLaterDb(DB);
  await createDestinations(db, [
    { id: "planner", name: "Weekly Planner", kind: "paper", section: "This Week" },
    { id: "vault", name: "Obsidian", kind: "digital" },
  ]);
  let t = Date.now() - 100_000;
  for (const text of opts.unsorted ?? []) {
    await saveCapture(db, { opId: `c-${text}`, text }, () => new Date((t += 1000)));
  }
  for (const [text, destinationId] of opts.assigned ?? []) {
    await saveCapture(db, { opId: `c-${text}`, text }, () => new Date((t += 1000)));
    await assignCapture(db, { opId: `a-${text}`, captureId: `c-${text}`, destinationId });
  }
  db.close();
}

async function handoffStates() {
  const db = await openWriteLaterDb(DB);
  const { handoffs } = await loadSnapshot(db);
  db.close();
  return handoffs.map((h) => `${h.captureId}:${h.state}`).sort();
}

const statusText = () => screen.getByRole("status");

describe("ReviewScreen", () => {
  it("offers first-run setup and shows both destinations after saving", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole("heading", { name: "Where does your writing go?" });
    await user.click(screen.getByRole("button", { name: "Save destinations" }));

    expect(await screen.findByRole("button", { name: /Weekly Planner · This Week/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Obsidian/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Where does your writing go?" })).not.toBeInTheDocument();
    expect(statusText()).toHaveTextContent("Destinations added.");
  });

  it("remembers a skipped setup", async () => {
    const user = userEvent.setup();
    const first = render(<Harness />);
    await user.click(await screen.findByRole("button", { name: "Skip for now" }));
    first.unmount();

    render(<Harness />);
    await screen.findByRole("button", { name: /Unsorted/ });
    expect(screen.queryByRole("button", { name: "Skip for now" })).not.toBeInTheDocument();
  });

  it("sorts an Unsorted capture, moves focus to the next one, and undoes", async () => {
    await seed({ unsorted: ["SYNTHETIC first", "SYNTHETIC second"] });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(await screen.findByRole("button", { name: /Unsorted/ }));

    const cards = await screen.findAllByRole("listitem");
    await user.click(within(cards[0]).getByRole("button", { name: "Weekly Planner" }));

    await waitFor(() => expect(statusText()).toHaveTextContent("Sent to Weekly Planner."));
    expect(screen.queryByText("SYNTHETIC first")).not.toBeInTheDocument();
    const next = within(screen.getAllByRole("listitem")[0]).getByRole("button", { name: "Weekly Planner" });
    await waitFor(() => expect(next).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(statusText()).toHaveTextContent("Undone."));
    expect(await screen.findByText("SYNTHETIC first")).toBeInTheDocument();
    expect(await handoffStates()).toEqual([]);
  });

  it("transfers two items to paper, then brings one back", async () => {
    await seed({ assigned: [["SYNTHETIC email mentor", "planner"], ["SYNTHETIC pay invoice", "planner"]] });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(await screen.findByRole("button", { name: /Weekly Planner · This Week/ }));
    await waitFor(async () => expect(await screen.findByRole("heading", { name: "Weekly Planner" })).toHaveFocus());

    const written = () => screen.getAllByRole("button", { name: "Written in Weekly Planner" });
    await user.click(written()[0]);
    await waitFor(() => expect(written()).toHaveLength(1));
    // Focus moves in an effect after the list re-renders.
    await waitFor(() => expect(written()[0]).toHaveFocus());
    await user.click(written()[0]);

    expect(await screen.findByText("Nothing waiting for Weekly Planner.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Weekly Planner" })).toHaveFocus());
    expect(await handoffStates()).toEqual([
      "c-SYNTHETIC email mentor:completed",
      "c-SYNTHETIC pay invoice:completed",
    ]);

    await user.click(screen.getByRole("button", { name: "Bring back: SYNTHETIC pay invoice" }));
    expect(await screen.findByRole("button", { name: "Written in Weekly Planner" })).toBeInTheDocument();
    expect(await handoffStates()).toEqual([
      "c-SYNTHETIC email mentor:completed",
      "c-SYNTHETIC pay invoice:pending",
    ]);
  });

  it("labels digital confirmation as Added", async () => {
    await seed({ assigned: [["SYNTHETIC idea", "vault"]] });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(await screen.findByRole("button", { name: /^Obsidian/ }));
    await user.click(await screen.findByRole("button", { name: "Added to Obsidian" }));
    await waitFor(() => expect(statusText()).toHaveTextContent("Marked added."));
    expect(await handoffStates()).toEqual(["c-SYNTHETIC idea:completed"]);
  });

  it("refuses to act on an item another tab already changed", async () => {
    await seed({ assigned: [["SYNTHETIC contested", "planner"]] });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(await screen.findByRole("button", { name: /Weekly Planner · This Week/ }));
    const button = await screen.findByRole("button", { name: "Written in Weekly Planner" });

    // Another tab lets the item go without this tab hearing about it.
    const db = await openWriteLaterDb(DB);
    await resolveHandoff(db, "a-SYNTHETIC contested", 1, "discarded");
    db.close();

    await user.click(button);
    await waitFor(() => expect(statusText()).toHaveTextContent("changed in another tab"));
    expect(await handoffStates()).toEqual(["c-SYNTHETIC contested:discarded"]);
    expect(screen.queryByRole("button", { name: "Written in Weekly Planner" })).not.toBeInTheDocument();
  });

  it("defers to tomorrow and returns the item on that local date", async () => {
    await seed({ assigned: [["SYNTHETIC later", "planner"]] });
    const user = userEvent.setup();
    const view = render(<Harness />);
    await user.click(await screen.findByRole("button", { name: /Weekly Planner · This Week/ }));
    await user.click(await screen.findByText("More"));
    await user.click(screen.getByRole("button", { name: "Later: tomorrow" }));
    expect(await screen.findByText("Nothing waiting for Weekly Planner.")).toBeInTheDocument();
    view.unmount();

    // Reopening lands back in the same queue.
    render(<Harness today={addDays(TODAY, 1)} />);
    expect(await screen.findByRole("button", { name: "Written in Weekly Planner" })).toBeInTheDocument();
    expect(screen.getByText(/Back from/)).toBeInTheDocument();
  });

  it("copies Markdown without completing, then survives an interruption until Added", async () => {
    await seed({ assigned: [["SYNTHETIC vault idea", "vault"]] });
    const copied: string[] = [];
    const user = userEvent.setup();
    const first = render(<Harness copyText={async (t) => (copied.push(t), true)} />);
    await user.click(await screen.findByRole("button", { name: /^Obsidian/ }));
    await user.click(await screen.findByRole("button", { name: "Copy Markdown" }));

    await waitFor(() => expect(statusText()).toHaveTextContent("Copied. Paste it into Obsidian"));
    expect(copied).toEqual(["SYNTHETIC vault idea\n"]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Added to Obsidian" })).toHaveFocus());
    expect(await handoffStates()).toEqual(["c-SYNTHETIC vault idea:pending"]);

    // Interrupted: the app is closed and reopened.
    first.unmount();
    render(<Harness />);
    expect(await screen.findByText(/Copied\. Paste it into Obsidian, then confirm\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy Markdown" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Added to Obsidian" }));
    await waitFor(() => expect(statusText()).toHaveTextContent("Marked added."));
    expect(await handoffStates()).toEqual(["c-SYNTHETIC vault idea:completed"]);
  });

  it("shows selectable text when the clipboard refuses, and never claims a copy", async () => {
    await seed({ assigned: [["SYNTHETIC blocked copy", "vault"]] });
    const user = userEvent.setup();
    render(<Harness copyText={async () => false} />);
    await user.click(await screen.findByRole("button", { name: /^Obsidian/ }));
    await user.click(await screen.findByRole("button", { name: "Copy Markdown" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Copy didn't work");
    const fallback = screen.getByLabelText("Text to copy") as HTMLTextAreaElement;
    expect(fallback.value).toBe("SYNTHETIC blocked copy\n");
    await waitFor(() => expect(fallback).toHaveFocus());
    expect(fallback.selectionStart).toBe(0);
    expect(fallback.selectionEnd).toBe(fallback.value.length);
    expect(statusText()).not.toHaveTextContent("Copied");

    const db = await openWriteLaterDb(DB);
    const { handoffs } = await loadSnapshot(db);
    db.close();
    expect(handoffs[0].copiedAt).toBeUndefined();
    expect(handoffs[0].state).toBe("pending");
  });

  it("exports a backup and a usage summary that holds no writing", async () => {
    await seed({ assigned: [["SYNTHETIC private thought", "planner"]] });
    const files: Array<{ name: string; content: string }> = [];
    const user = userEvent.setup();
    render(<Harness download={(name, content) => files.push({ name, content })} />);

    await user.click(await screen.findByRole("button", { name: /Weekly Planner · This Week/ }));
    await user.click(await screen.findByRole("button", { name: "Written in Weekly Planner" }));
    await waitFor(() => expect(statusText()).toHaveTextContent("Marked written."));
    await waitFor(async () => {
      const db = await openWriteLaterDb(DB);
      const types = (await listEvents(db)).map((e) => e.type);
      db.close();
      expect(types).toContain("handoff_confirmed_paper");
    });

    await user.click(screen.getByRole("button", { name: "Review" }));
    await user.click(await screen.findByRole("button", { name: /Download backup/ }));
    await user.click(screen.getByRole("button", { name: /Download usage summary/ }));
    await waitFor(() => expect(files).toHaveLength(2));

    const [backup, usage] = files;
    expect(backup.name).toMatch(/^writelater-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(backup.content)).toMatchObject({ format: "writelater-backup" });
    expect(backup.content).toContain("SYNTHETIC private thought");

    expect(JSON.parse(usage.content)).toMatchObject({ reviewDays: 1, totals: { handoff_confirmed_paper: 1 } });
    expect(usage.content).not.toContain("SYNTHETIC");
    expect(usage.content).not.toContain("Weekly Planner");
  });

  it("renames a destination and every queue follows", async () => {
    await seed({ assigned: [["SYNTHETIC to write", "planner"]] });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(await screen.findByRole("button", { name: "Manage destinations" }));
    await user.click(await screen.findByRole("button", { name: "Rename Weekly Planner" }));

    const name = screen.getByLabelText("Name");
    await waitFor(() => expect(name).toHaveFocus());
    await user.clear(name);
    await user.type(name, "Hobonichi");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(statusText()).toHaveTextContent("Renamed to Hobonichi."));
    await waitFor(() => expect(screen.getByRole("button", { name: "Rename Hobonichi" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Review" }));
    await user.click(await screen.findByRole("button", { name: /Hobonichi · This Week/ }));
    expect(await screen.findByRole("button", { name: "Written in Hobonichi" })).toBeInTheDocument();
  });

  it("archives a destination, moving waiting items to another one", async () => {
    await seed({ assigned: [["SYNTHETIC moving", "planner"]] });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(await screen.findByRole("button", { name: "Manage destinations" }));
    await user.click(await screen.findByRole("button", { name: "Archive Weekly Planner" }));

    expect(screen.getByText("1 item still waiting. Where should it go?")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Obsidian" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Archive Weekly Planner" }));

    await waitFor(() =>
      expect(statusText()).toHaveTextContent("Archived Weekly Planner. Moved 1 item to Obsidian."),
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "Destinations" })).toHaveFocus());
    expect(screen.getByRole("button", { name: "Restore Weekly Planner" })).toBeInTheDocument();

    const db = await openWriteLaterDb(DB);
    const { handoffs } = await loadSnapshot(db);
    db.close();
    expect(handoffs.map((h) => h.destinationId)).toEqual(["vault"]);
  });

  it("archives to Unsorted, then restores the destination", async () => {
    await seed({ assigned: [["SYNTHETIC unsort me", "vault"]] });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(await screen.findByRole("button", { name: "Manage destinations" }));
    await user.click(await screen.findByRole("button", { name: "Archive Obsidian" }));
    await user.click(screen.getByRole("radio", { name: "Back to Unsorted" }));
    await user.click(screen.getByRole("button", { name: "Archive Obsidian" }));
    await waitFor(() => expect(statusText()).toHaveTextContent("Moved 1 item to Unsorted."));
    expect(await handoffStates()).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Restore Obsidian" }));
    await waitFor(() => expect(statusText()).toHaveTextContent("Restored Obsidian."));
    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByRole("button", { name: /^Obsidian/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unsorted/ })).toHaveTextContent("1");
  });

  it("treats a double tap on Written as one action and keeps its Undo", async () => {
    await seed({ assigned: [["SYNTHETIC double tap", "planner"]] });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(await screen.findByRole("button", { name: /Weekly Planner · This Week/ }));
    const button = await screen.findByRole("button", { name: "Written in Weekly Planner" });

    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    await waitFor(() => expect(statusText()).toHaveTextContent("Marked written."));
    expect(statusText()).not.toHaveTextContent("another tab");
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(await handoffStates()).toEqual(["c-SYNTHETIC double tap:completed"]);
  });

  it("treats a double submit of Archive as one action", async () => {
    await seed({ assigned: [["SYNTHETIC archive twice", "planner"]] });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(await screen.findByRole("button", { name: "Manage destinations" }));
    await user.click(await screen.findByRole("button", { name: "Archive Weekly Planner" }));
    const submit = screen.getByRole("button", { name: "Archive Weekly Planner" });

    act(() => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });

    await waitFor(() => expect(statusText()).toHaveTextContent("Moved 1 item to Obsidian."));
    expect(statusText()).not.toHaveTextContent("no longer exists");
  });

  it("deletes an Unsorted capture only after confirmation", async () => {
    await seed({ unsorted: ["SYNTHETIC sensitive", "SYNTHETIC keep"] });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(await screen.findByRole("button", { name: /Unsorted/ }));
    const card = (await screen.findByText("SYNTHETIC sensitive")).closest("li")!;

    await user.click(within(card).getByRole("button", { name: "Delete…" }));
    await user.click(within(card).getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("SYNTHETIC sensitive")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Delete…" }));
    const confirm = within(card).getByRole("button", { name: "Delete permanently" });
    await waitFor(() => expect(confirm).toHaveFocus());
    await user.click(confirm);

    await waitFor(() => expect(statusText()).toHaveTextContent("Deleted permanently."));
    expect(screen.queryByText("SYNTHETIC sensitive")).not.toBeInTheDocument();
    const db = await openWriteLaterDb(DB);
    const { captures } = await loadSnapshot(db);
    db.close();
    expect(captures.map((c) => c.text)).toEqual(["SYNTHETIC keep"]);
  });

  it("deletes a queued capture and its handoff from the More menu", async () => {
    await seed({ assigned: [["SYNTHETIC queued secret", "planner"]] });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(await screen.findByRole("button", { name: /Weekly Planner · This Week/ }));
    await user.click(await screen.findByText("More"));
    await user.click(screen.getByRole("button", { name: "Delete permanently…" }));
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(await screen.findByText("Nothing waiting for Weekly Planner.")).toBeInTheDocument();
    expect(await handoffStates()).toEqual([]);
  });

  it("erases everything after confirmation and returns to first-run setup", async () => {
    await seed({ assigned: [["SYNTHETIC erase me", "planner"]] });
    localStorage.setItem("writelater:setup-skipped:writelater", "1");
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(await screen.findByRole("button", { name: "Erase everything on this device…" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Erase everything?" })).toHaveFocus());
    expect(screen.getByText(/permanently removes 1 capture, 2 destinations/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download a backup first" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Erase everything" }));

    await waitFor(() => expect(statusText()).toHaveTextContent("Everything was erased"));
    expect(await screen.findByRole("heading", { name: "Where does your writing go?" })).toBeInTheDocument();
    expect(localStorage.getItem("writelater:setup-skipped:writelater")).toBeNull();
    const db = await openWriteLaterDb(DB);
    expect(await loadSnapshot(db)).toEqual({ captures: [], destinations: [], handoffs: [] });
    expect(await listEvents(db)).toEqual([]);
    db.close();
  });

  it("previews a restore, then adds only what's missing", async () => {
    // A backup made on another device: one destination, one capture, sorted.
    const other = await openWriteLaterDb("other-device");
    // Same ID as this device's planner but a different section, so it's a conflict.
    await createDestinations(other, [{ id: "planner", name: "Weekly Planner", kind: "paper", section: "Next Week" }]);
    await saveCapture(other, { opId: "restored", text: "SYNTHETIC from backup" });
    await assignCapture(other, { opId: "restored-h", captureId: "restored", destinationId: "planner" });
    const backup = JSON.stringify(buildBackup(await loadSnapshot(other)));
    other.close();

    await seed({ unsorted: ["SYNTHETIC already here"] });
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole("button", { name: /Unsorted/ });
    await user.upload(
      screen.getByLabelText(/Restore from backup/),
      new File([backup], "writelater-backup.json", { type: "application/json" }),
    );

    await waitFor(async () => expect(await screen.findByRole("heading", { name: "Restore preview" })).toHaveFocus());
    expect(screen.getByText(/Will add 1 capture, 0 destinations, and 1 status\./)).toBeInTheDocument();
    expect(screen.getByText("Already here, skipped: 0.")).toBeInTheDocument();
    expect(screen.getByText(/Kept as they are on this device: 1/)).toHaveTextContent(
      "a destination: differs from the copy on this device",
    );
    await user.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(statusText()).toHaveTextContent("Restored 2 records."));
    expect(await handoffStates()).toEqual(["restored:pending"]);
    const db = await openWriteLaterDb(DB);
    const { captures } = await loadSnapshot(db);
    db.close();
    expect(captures.map((c) => c.text).sort()).toEqual(["SYNTHETIC already here", "SYNTHETIC from backup"]);
  });

  it("explains an invalid backup and changes nothing", async () => {
    await seed({ unsorted: ["SYNTHETIC untouched"] });
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole("button", { name: /Unsorted/ });
    await user.upload(
      screen.getByLabelText(/Restore from backup/),
      new File(['{"not":"a backup"}'], "nope.json", { type: "application/json" }),
    );
    await waitFor(async () => expect(await screen.findByRole("heading", { name: "Can't restore this file" })).toHaveFocus());
    expect(screen.getByRole("alert")).toHaveTextContent("isn't a WriteLater backup. Nothing was changed.");
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  });
});
