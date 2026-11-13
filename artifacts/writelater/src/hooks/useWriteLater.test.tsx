import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as handoffs from "../storage/handoffs";
import { CaptureScreen } from "../screens/CaptureScreen";
import { useWriteLater } from "./useWriteLater";
import { openWriteLaterDb } from "../storage/db";
import { listCaptures } from "../storage/captures";

// Lets a test make the post-write re-read fail while the write itself succeeds.
const failReads = { on: false };
vi.mock("../storage/handoffs", async (importOriginal) => {
  const actual = await importOriginal<typeof handoffs>();
  return {
    ...actual,
    loadSnapshot: vi.fn(async (...args: Parameters<typeof actual.loadSnapshot>) => {
      if (failReads.on) throw new DOMException("read failed", "UnknownError");
      return actual.loadSnapshot(...args);
    }),
  };
});

function Harness() {
  const { status, actions } = useWriteLater("writelater");
  return (
    <CaptureScreen dbName="writelater" storageStatus={status} onSave={actions.saveCapture} waitingCount={0} onOpenReview={() => {}} />
  );
}

describe("useWriteLater", () => {
  it("reports a committed save as saved even if refreshing the list fails", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const save = screen.getByRole("button", { name: "Save" });
    await user.type(screen.getByLabelText("Quick capture"), "SYNTHETIC committed");
    await waitFor(() => expect(save).toBeEnabled());

    failReads.on = true;
    await user.click(save);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved to Unsorted."));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    failReads.on = false;

    const db = await openWriteLaterDb("writelater");
    expect((await listCaptures(db)).map((c) => c.text)).toEqual(["SYNTHETIC committed"]);
    db.close();
  });
});
