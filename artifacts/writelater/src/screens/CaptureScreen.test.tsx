import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openDB } from "idb";
import { CaptureScreen } from "./CaptureScreen";
import { useWriteLater, type WriteLaterActions } from "../hooks/useWriteLater";
import { openWriteLaterDb } from "../storage/db";
import { listCaptures } from "../storage/captures";
import { loadDraft } from "../storage/draft";
import { MAX_CAPTURE_CHARS } from "../storage/limits";

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
const saveButton = () => screen.getByRole("button", { name: "Save" });
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
    await waitFor(() => expect(status()).toHaveTextContent("Saved to Unsorted."));
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
    await waitFor(() => expect(status()).toHaveTextContent("Saved to Unsorted."));
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
    await waitFor(() => expect(status()).toHaveTextContent("Already saved to Unsorted."));
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
    expect(status()).not.toHaveTextContent("Saved to Unsorted.");
    const retry = screen.getByRole("button", { name: "Retry" });
    await waitFor(() => expect(retry).toHaveFocus());
    expect(await storedTexts()).toEqual([]);

    fail = false;
    await user.click(retry);
    await waitFor(() => expect(status()).toHaveTextContent("Saved to Unsorted."));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(await storedTexts()).toEqual(["SYNTHETIC Q"]);
  });

  it("6. Given a saved note, when identical text is saved again, then two records exist", async () => {
    render(<Harness />);
    const user = await typeAndWaitForReady("SYNTHETIC E");
    await user.click(saveButton());
    await waitFor(() => expect(status()).toHaveTextContent("Saved to Unsorted."));

    await typeAndWaitForReady("SYNTHETIC E");
    await user.click(saveButton());
    await waitFor(async () => expect(await storedTexts()).toHaveLength(2));
  });

  it("returns focus to the field after a committed save and supports Cmd+Enter", async () => {
    render(<Harness />);
    const user = await typeAndWaitForReady("SYNTHETIC K");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(status()).toHaveTextContent("Saved to Unsorted."));
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

  describe("durable storage", () => {
    afterEach(() => {
      // jsdom has no navigator.storage; remove the stub between tests.
      delete (navigator as unknown as { storage?: unknown }).storage;
    });

    it("asks the browser to keep data once, after the first real save", async () => {
      const persist = vi.fn(async () => true);
      Object.defineProperty(navigator, "storage", {
        configurable: true,
        value: { persisted: vi.fn(async () => false), persist, estimate: vi.fn(async () => ({})) },
      });
      render(<Harness />);
      expect(persist).not.toHaveBeenCalled();

      let user = await typeAndWaitForReady("SYNTHETIC first");
      await user.click(saveButton());
      await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));

      user = await typeAndWaitForReady("SYNTHETIC second");
      await user.click(saveButton());
      await waitFor(() => expect(status()).toHaveTextContent("Saved to Unsorted."));
      expect(persist).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps text typed while a save is in flight, as a new draft", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let submittedId = "";
    render(
      <Harness
        wrapSave={(save) => async (input) => {
          submittedId = input.opId;
          await gate; // a slow device: the write hasn't committed yet
          return save(input);
        }}
      />,
    );
    const user = await typeAndWaitForReady("SYNTHETIC first thought");
    await user.click(saveButton());
    // Keep typing while the save is still in flight.
    await user.type(field(), " and a second one");

    release();
    await waitFor(() => expect(status()).toHaveTextContent("What you typed since is still here."));
    expect(field().value).toBe("SYNTHETIC first thought and a second one");
    expect(await storedTexts()).toEqual(["SYNTHETIC first thought"]);

    // The kept text is a new draft with a new ID, so saving it adds a record.
    const draft = loadDraft(DB);
    expect(draft?.text).toBe("SYNTHETIC first thought and a second one");
    expect(draft?.opId).not.toBe(submittedId);
    await user.click(saveButton());
    await waitFor(async () => expect(await storedTexts()).toHaveLength(2));
    expect(field().value).toBe("");
  });

  it("explains a capture over the size limit and won't save it", async () => {
    render(<Harness />);
    await waitFor(() => expect(saveButton()).toBeDisabled());
    fireEvent.change(field(), { target: { value: "x".repeat(MAX_CAPTURE_CHARS + 1) } });

    expect(screen.getByText(/The limit is 100,000, so\s+split it into smaller captures\./)).toBeInTheDocument();
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(saveButton()).toBeDisabled();

    fireEvent.change(field(), { target: { value: "x".repeat(MAX_CAPTURE_CHARS) } });
    await waitFor(() => expect(saveButton()).toBeEnabled());
  });
});
