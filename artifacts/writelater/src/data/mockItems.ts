import { CaptureItem } from "../types/planner";

/**
 * Synthetic sample items, shown only in demo mode (?demo=1). Never seeded into
 * the real database.
 */
export const demoItems: CaptureItem[] = [
  {
    id: "demo-1",
    title: "Sample: pay the studio invoice before Friday",
    type: "money",
    timeframe: "this-week",
    plannerDestination: "weekly-spread",
    status: "inbox",
    isUrgent: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-2",
    title: "Sample: ask about leaving early Thursday",
    type: "work",
    timeframe: "today",
    plannerDestination: "today-page",
    status: "inbox",
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-3",
    title: "Sample: buy a travel adapter",
    type: "travel",
    timeframe: "this-week",
    plannerDestination: "weekly-spread",
    status: "inbox",
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-4",
    title: "Sample: review the map prototype",
    type: "project",
    timeframe: "today",
    plannerDestination: "today-page",
    status: "inbox",
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-5",
    title: "Sample: look up weekend pottery classes",
    type: "personal",
    timeframe: "later",
    plannerDestination: "notes-page",
    status: "inbox",
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-6",
    title: "Sample: call the dentist to reschedule",
    type: "family",
    timeframe: "today",
    plannerDestination: "today-page",
    status: "inbox",
    isUrgent: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-7",
    title: "Sample: list packing ideas",
    type: "travel",
    timeframe: "later",
    plannerDestination: "notes-page",
    status: "inbox",
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-8",
    title: "Sample reflection: things feel lighter once they have a place",
    type: "reflection",
    timeframe: "later",
    plannerDestination: "notes-page",
    status: "inbox",
    createdAt: new Date().toISOString(),
  }
];
