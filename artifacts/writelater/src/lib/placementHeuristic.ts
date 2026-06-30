import { CaptureItem, PlannerDestination } from "../types/planner";

export const DESTINATION_LABELS: Record<PlannerDestination, string> = {
  "today-page": "Today's page",
  "weekly-spread": "Weekly spread",
  "monthly-view": "Monthly view",
  "notes-page": "Notes page",
  archive: "Let go",
};

export interface SuggestedPlacement {
  destination: PlannerDestination;
  label: string;
  reason: string;
}

export function getSuggestedPlacement(input: {
  type: CaptureItem["type"] | null;
  timeframe: CaptureItem["timeframe"] | null;
  title?: string;
}): SuggestedPlacement {
  const { type, timeframe, title } = input;

  // A. Type-specific emotional/intention rules first
  if (type === "reflection") {
    return {
      destination: "notes-page",
      label: DESTINATION_LABELS["notes-page"],
      reason: "Reflections belong somewhere you can revisit gently.",
    };
  }

  if (type === "note") {
    return {
      destination: "notes-page",
      label: DESTINATION_LABELS["notes-page"],
      reason: "This feels like something to hold on a notes page.",
    };
  }

  if (type === "money") {
    return {
      destination: "weekly-spread",
      label: DESTINATION_LABELS["weekly-spread"],
      reason: "Money reminders are easiest to track in your weekly spread.",
    };
  }

  if (type === "travel") {
    if (timeframe === "today" || timeframe === "this-week") {
      return {
        destination: "weekly-spread",
        label: DESTINATION_LABELS["weekly-spread"],
        reason: "Travel tasks are easier to batch into your week.",
      };
    }
    return {
      destination: "notes-page",
      label: DESTINATION_LABELS["notes-page"],
      reason: "This feels like a travel thought to collect before planning.",
    };
  }

  if (type === "event") {
    if (timeframe === "later") {
      return {
        destination: "monthly-view",
        label: DESTINATION_LABELS["monthly-view"],
        reason: "Future events belong where you can see the month.",
      };
    }
    return {
      destination: "today-page",
      label: DESTINATION_LABELS["today-page"],
      reason: "This event is close enough to keep on today's page.",
    };
  }

  // B. Timeframe rules
  if (timeframe === "today") {
    return {
      destination: "today-page",
      label: DESTINATION_LABELS["today-page"],
      reason: "This belongs on the page you'll actually use today.",
    };
  }

  if (timeframe === "tomorrow") {
    return {
      destination: "weekly-spread",
      label: DESTINATION_LABELS["weekly-spread"],
      reason: "Tomorrow is close, but it still belongs in your weekly view.",
    };
  }

  if (timeframe === "this-week") {
    return {
      destination: "weekly-spread",
      label: DESTINATION_LABELS["weekly-spread"],
      reason: "This looks like something to carry into this week.",
    };
  }

  if (timeframe === "later") {
    return {
      destination: "notes-page",
      label: DESTINATION_LABELS["notes-page"],
      reason: "No rush. Hold it on a notes page until planner time.",
    };
  }

  // C. Title fallback
  if (title?.trim()) {
    return {
      destination: "notes-page",
      label: DESTINATION_LABELS["notes-page"],
      reason: "Start by catching the thought. You can place it later.",
    };
  }

  // D. Empty fallback
  return {
    destination: "notes-page",
    label: DESTINATION_LABELS["notes-page"],
    reason: "Choose a type or timeframe and we'll suggest where it belongs.",
  };
}
