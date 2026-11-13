import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

const DB = "writelater";
const TODAY = localDate();

function Harness({ today = TODAY }: { today?: string }) {
  const { status, snapshot, actions } = useWriteLater(DB);
  return (
    <ReviewScreen
      dbName={DB}
      status={status}
      snapshot={snapshot}
      actions={actions}
      today={today}
      onCapture={() => {}}
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
    expect(next).toHaveFocus();

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
    expect(await screen.findByRole("heading", { name: "Weekly Planner" })).toHaveFocus();

    const written = () => screen.getAllByRole("button", { name: "Written in Weekly Planner" });
    await user.click(written()[0]);
    await waitFor(() => expect(written()).toHaveLength(1));
    expect(written()[0]).toHaveFocus();
    await user.click(written()[0]);

    expect(await screen.findByText("Nothing waiting for Weekly Planner.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Weekly Planner" })).toHaveFocus();
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

    render(<Harness today={addDays(TODAY, 1)} />);
    await user.click(await screen.findByRole("button", { name: /Weekly Planner · This Week/ }));
    expect(await screen.findByRole("button", { name: "Written in Weekly Planner" })).toBeInTheDocument();
    expect(screen.getByText(/Back from/)).toBeInTheDocument();
  });
});
