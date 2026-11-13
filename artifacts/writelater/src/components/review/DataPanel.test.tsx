import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataPanel } from "./DataPanel";
import type { PersistenceState, StorageStatus } from "../../storage/persist";

const empty = { captures: [], destinations: [], handoffs: [] };

function storage(initial: PersistenceState, grant: boolean) {
  let state = initial;
  return {
    getStatus: vi.fn(async (): Promise<StorageStatus> => ({ persistence: state, usage: 4096 })),
    request: vi.fn(async (): Promise<PersistenceState> => {
      state = grant ? "persisted" : "best-effort";
      return state;
    }),
  };
}

describe("DataPanel storage status", () => {
  it("offers to ask the browser, then shows the grant", async () => {
    const fake = storage("best-effort", true);
    const announce = vi.fn();
    const user = userEvent.setup();
    render(<DataPanel snapshot={empty} download={() => {}} onAnnounce={announce} storage={fake} />);

    expect(await screen.findByText(/Not protected yet/)).toHaveTextContent("Using 4.0 KB.");
    await user.click(screen.getByRole("button", { name: "Ask the browser to keep my data" }));

    expect(await screen.findByText(/Protected: the browser won't clear/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask the browser to keep my data" })).not.toBeInTheDocument();
    expect(announce).toHaveBeenCalledWith("The browser will keep WriteLater's data.");
  });

  it("says so honestly when the browser declines", async () => {
    const fake = storage("best-effort", false);
    const announce = vi.fn();
    const user = userEvent.setup();
    render(<DataPanel snapshot={empty} download={() => {}} onAnnounce={announce} storage={fake} />);
    await user.click(await screen.findByRole("button", { name: "Ask the browser to keep my data" }));
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith("The browser didn't agree to keep the data. Keep regular backups."),
    );
    expect(screen.getByText(/Not protected yet/)).toBeInTheDocument();
  });

  it("doesn't offer a request the browser can't take", async () => {
    render(<DataPanel snapshot={empty} download={() => {}} onAnnounce={() => {}} storage={storage("unsupported", false)} />);
    expect(await screen.findByText(/doesn't say whether it will keep/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ask the browser/ })).not.toBeInTheDocument();
  });
});
