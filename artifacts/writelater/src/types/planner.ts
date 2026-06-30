export type ItemType = "task" | "event" | "note" | "errand" | "money" | "travel" | "reflection" | "project" | "family" | "personal" | "work";
export type Timeframe = "today" | "tomorrow" | "this-week" | "later";
export type PlannerDestination = "today-page" | "weekly-spread" | "monthly-view" | "notes-page" | "archive";
export type ItemStatus = "inbox" | "placed" | "done" | "later";

export interface CaptureItem {
  id: string;
  title: string;
  note?: string;
  type: ItemType;
  timeframe: Timeframe;
  plannerDestination: PlannerDestination;
  status: ItemStatus;
  createdAt: string;
  isUrgent?: boolean;
}

export const DESTINATION_LABELS: Record<PlannerDestination, string> = {
  "today-page": "Today's page",
  "weekly-spread": "Weekly spread",
  "monthly-view": "Monthly view",
  "notes-page": "Notes page",
  "archive": "Let go",
};
