import React from "react";
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openDB } from "idb";
import { CaptureScreen } from "./CaptureScreen";
import { useWriteLater, type WriteLaterActions } from "../hooks/useWriteLater";
import { openWriteLaterDb } from "../storage/db";
import { listCaptures } from "../storage/captures";

const DB = "writelater";

type SaveFn = WriteLaterActions["saveCapture"];

function Harness({ wrapSave }: { wrapSave?: (save: SaveFn) => SaveFn }) {
  const { snapshot, status, actions } = useWriteLater(DB);
  return (
    <>
      <CaptureScreen
        dbName={DB}
        storageStatus={status}
        onSave={wrapSave ? wrapSave(actions.saveCapture) : actions.saveCapture}
        waitingCount={snapshot.captures.length}
        onOpenReview={() => {}}
      />
      <ul aria-label="Stored">
        {snapshot.captures.map((c) => (
          <li key={c.id}>{c.text}</li>
        ))}
      </ul>
    </>
  );
}

async function storedTexts(): Promise<string[]> {
  const db = await openWriteLaterDb(DB);
  const texts = (await listCaptures(db)).map((c) => c.text);
  db.close();
  return texts;
}

const field = () => screen.getByLabelText("Quick capture") as HTMLTextAreaElement;
const saveButton = () => screen.getByRole("button", { name: /save to planner inbox/i });
const status = () => screen.getByRole("status");

async function typeAndWaitForReady(text: string) {
  const user = userEvent.setup();
  await user.type(field(), text);
  await waitFor(() => expect(saveButton()).toBeEnabled());
  return user;
}

describe("CaptureScreen durable save", () => {
  it("1. Given a saved capture, when the page reloads, then it is listed once and the field is empty", async () => {
    const first = render(<Harness />);
    const user = await typeAndWaitForReady("SYNTHETIC A");
    await user.click(saveButton());
    await waitFor(() => expect(status()).toHaveTextContent("Saved."));
    first.unmount();

    render(<Harness />);
    expect(await screen.findByText("SYNTHETIC A")).toBeInTheDocument();
    expect(field().value).toBe("");
    expect(await storedTexts()).toEqual(["SYNTHETIC A"]);
  });

  it("2. Given an unsaved draft, when the page reloads, then the draft is restored and nothing is stored", async () => {
    const first = render(<Harness />);
    await typeAndWaitForReady("SYNTHETIC B");
    first.unmount();

    render(<Harness />);
    expect(field().value).toBe("SYNTHETIC B");
    expect(await storedTexts()).toEqual([]);
  });

  it("3. Given a draft, when Save is activated twice at once, then exactly one record is stored", async () => {
    render(<Harness />);
    await typeAndWaitForReady("SYNTHETIC C");
    act(() => {
      fireEvent.click(saveButton());
      fireEvent.click(saveButton());
    });
    await waitFor(() => expect(status()).toHaveTextContent("Saved."));
    expect(await storedTexts()).toEqual(["SYNTHETIC C"]);
  });

  it("4. Given a save that committed but lost its acknowledgement, when the user retries, then nothing is duplicated", async () => {
    let dropAck = true;
    render(
      <Harness
        wrapSave={(save) => async (input) => {
          const result = await save(input);
          if (dropAck) {
            dropAck = false;
            throw new Error("acknowledgement lost");
          }
          return result;
        }}
      />,
    );
    const user = await typeAndWaitForReady("SYNTHETIC D");
    await user.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Your text is still here.");
    expect(field().value).toBe("SYNTHETIC D");

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(status()).toHaveTextContent("Already saved."));
    expect(field().value).toBe("");
    expect(await storedTexts()).toEqual(["SYNTHETIC D"]);
  });

  it("5. Given storage is full, when the user saves, then the draft is kept, an alert shows, and Retry succeeds later", async () => {
    let fail = true;
    render(
      <Harness
        wrapSave={(save) => async (input) => {
          if (fail) throw new DOMException("full", "QuotaExceededError");
          return save(input);
        }}
      />,
    );
    const user = await typeAndWaitForReady("SYNTHETIC Q");
    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("out of storage");
    expect(field().value).toBe("SYNTHETIC Q");
    expect(status()).not.toHaveTextContent("Saved.");
    const retry = screen.getByRole("button", { name: "Retry" });
    await waitFor(() => expect(retry).toHaveFocus());
    expect(await storedTexts()).toEqual([]);

    fail = false;
    await user.click(retry);
    await waitFor(() => expect(status()).toHaveTextContent("Saved."));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(await storedTexts()).toEqual(["SYNTHETIC Q"]);
  });

  it("6. Given a saved note, when identical text is saved again, then two records exist", async () => {
    render(<Harness />);
    const user = await typeAndWaitForReady("SYNTHETIC E");
    await user.click(saveButton());
    await waitFor(() => expect(status()).toHaveTextContent("Saved."));

    await typeAndWaitForReady("SYNTHETIC E");
    await user.click(saveButton());
    await waitFor(async () => expect(await storedTexts()).toHaveLength(2));
  });

  it("returns focus to the field after a committed save and supports Cmd+Enter", async () => {
    render(<Harness />);
    const user = await typeAndWaitForReady("SYNTHETIC K");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(status()).toHaveTextContent("Saved."));
    expect(field()).toHaveFocus();
    expect(saveButton()).toBeInTheDocument();
  });

  it("explains a blocked upgrade, then recovers when the old tab closes", async () => {
    // An older tab with no upgrade handling keeps v1 open.
    const oldTab = await openDB(DB, 1, {
      upgrade(db) {
        db.createObjectStore("captures", { keyPath: "id" }).createIndex("by_createdAt", "createdAt");
      },
    });
    render(<Harness />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Close other WriteLater tabs");
    expect(saveButton()).toBeDisabled();

    oldTab.close();
    await typeAndWaitForReady("SYNTHETIC after unblock");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
