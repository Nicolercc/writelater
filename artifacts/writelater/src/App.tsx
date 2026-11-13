import React, { useEffect, useMemo, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AppShell } from "./components/AppShell";
import { TabType } from "./components/BottomNav";

import { CaptureScreen } from "./screens/CaptureScreen";
import { ReviewScreen } from "./screens/ReviewScreen";

import { useWriteLater } from "./hooks/useWriteLater";
import { buildReview, localDate } from "./lib/review";
import { DEFAULT_DB_NAME, DEMO_DB_NAME } from "./storage/db";

function isDemoMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("demo") === "1";
  } catch {
    return false;
  }
}

/** Local date, refreshed when the app regains focus so deferred items return on time. */
function useToday(): string {
  const [today, setToday] = useState(() => localDate());
  useEffect(() => {
    const refresh = () => setToday(localDate());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}

function AppContent({ demo }: { demo: boolean }) {
  const dbName = demo ? DEMO_DB_NAME : DEFAULT_DB_NAME;
  const [activeTab, setActiveTab] = useState<TabType>("capture");
  const { status, snapshot, actions } = useWriteLater(dbName);
  const today = useToday();
  const waitingCount = useMemo(
    () => buildReview(snapshot, today).waitingCount,
    [snapshot, today],
  );

  const changeTab = (tab: TabType) => {
    if (tab === "review" && activeTab !== "review") actions.logUsage("review_opened");
    setActiveTab(tab);
  };

  return (
    <AppShell activeTab={activeTab} onTabChange={changeTab} waitingCount={waitingCount}>
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
          onSave={actions.saveCapture}
          waitingCount={waitingCount}
          onOpenReview={() => changeTab("review")}
          onSaveFailed={() => actions.logUsage("save_failed")}
        />
      )}
      {activeTab === "review" && (
        <ReviewScreen
          key={dbName}
          dbName={dbName}
          status={status}
          snapshot={snapshot}
          actions={actions}
          today={today}
          onCapture={() => setActiveTab("capture")}
        />
      )}
    </AppShell>
  );
}

function App() {
  const demo = useMemo(isDemoMode, []);
  return (
    <TooltipProvider>
      <AppContent demo={demo} />
    </TooltipProvider>
  );
}

export default App;
