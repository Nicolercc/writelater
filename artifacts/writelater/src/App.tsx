import React, { useMemo, useState } from "react";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AppShell } from "./components/AppShell";
import { TabType } from "./components/BottomNav";

import { CaptureScreen } from "./screens/CaptureScreen";
import { InboxScreen } from "./screens/InboxScreen";
import { RitualScreen } from "./screens/RitualScreen";
import { PlannerScreen } from "./screens/PlannerScreen";

import { demoItems } from "./data/mockItems";
import { CaptureItem, ItemStatus } from "./types/planner";
import { useCaptures } from "./hooks/useCaptures";
import { DEFAULT_DB_NAME, DEMO_DB_NAME, type StoredCapture } from "./storage/db";

function isDemoMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("demo") === "1";
  } catch {
    return false;
  }
}

/**
 * Bridges stored captures to the prototype's view model until the Review
 * screen is rebuilt on destinations and handoffs.
 */
function toCaptureItem(capture: StoredCapture): CaptureItem {
  return {
    id: capture.id,
    title: capture.text,
    type: "note",
    timeframe: "later",
    plannerDestination: "notes-page",
    status: "inbox",
    createdAt: capture.createdAt,
  };
}

function AppContent({ demo }: { demo: boolean }) {
  const dbName = demo ? DEMO_DB_NAME : DEFAULT_DB_NAME;
  const [activeTab, setActiveTab] = useState<TabType>("capture");
  const { captures, status, save } = useCaptures(dbName);
  // Review status changes are still in memory; they move to IndexedDB with
  // handoffs in the next change.
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ItemStatus>>({});

  const items = useMemo(() => {
    const stored = captures.map(toCaptureItem);
    const all = demo ? [...stored, ...demoItems] : stored;
    return all.map((item) =>
      statusOverrides[item.id] ? { ...item, status: statusOverrides[item.id] } : item,
    );
  }, [captures, demo, statusOverrides]);

  const handleUpdateStatus = (id: string, next: ItemStatus) => {
    setStatusOverrides((prev) => ({ ...prev, [id]: next }));
  };

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
      {demo && (
        <div
          role="note"
          className="mx-5 mt-4 rounded-xl border border-[var(--paper-border)] bg-[var(--surface-elevated)] px-3 py-2 text-xs text-foreground"
        >
          Demo mode: sample items, saved separately from your real captures.
        </div>
      )}
      {activeTab === "capture" && (
        <CaptureScreen
          key={dbName}
          dbName={dbName}
          storageStatus={status}
          onSave={save}
          items={items}
        />
      )}
      {activeTab === "inbox" && <InboxScreen items={items} onUpdateStatus={handleUpdateStatus} />}
      {activeTab === "ritual" && <RitualScreen items={items} onUpdateStatus={handleUpdateStatus} />}
      {activeTab === "planner" && <PlannerScreen items={items} />}
    </AppShell>
  );
}

function App() {
  const demo = useMemo(isDemoMode, []);
  return (
    <TooltipProvider>
      <AppContent demo={demo} />
      <SonnerToaster />
    </TooltipProvider>
  );
}

export default App;
