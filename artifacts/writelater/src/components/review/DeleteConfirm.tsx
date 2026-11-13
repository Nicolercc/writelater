import React from "react";
import type { StoredCapture } from "../../storage/db";
import type { WriteLaterActions } from "../../hooks/useWriteLater";
import type { ReviewController } from "../../hooks/useReviewController";
import { secondaryButton } from "./shared";

interface DeleteConfirmProps {
  capture: StoredCapture;
  /** Element to focus after the delete (the next item), or null for the heading. */
  nextFocusId: string | null;
  controller: ReviewController;
  actions: WriteLaterActions;
  onCancel: () => void;
}

/** Second step of a permanent delete: confirm or cancel. */
export function DeleteConfirm({ capture, nextFocusId, controller, actions, onCancel }: DeleteConfirmProps) {
  const remove = async () => {
    try {
      const deleted = await controller.exclusive(() => actions.deleteCapture(capture.id));
      if (deleted === undefined) return; // Another write was in flight.
      onCancel();
      controller.announce(deleted ? "Deleted permanently." : "That item was already gone. Showing the latest.");
      controller.focus(nextFocusId);
    } catch {
      controller.announce("Couldn't delete. Nothing was changed. Try again.");
    }
  };

  return (
    <div
      role="group"
      aria-label="Confirm permanent delete"
      className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3"
    >
      <p className="text-sm text-foreground">Delete this capture permanently? This can't be undone.</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          autoFocus
          disabled={controller.busy}
          onClick={remove}
          className="min-h-[44px] px-4 rounded-xl bg-destructive text-destructive-foreground font-medium text-sm"
        >
          Delete permanently
        </button>
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </div>
  );
}
