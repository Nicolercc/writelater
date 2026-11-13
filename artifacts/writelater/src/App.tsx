import React, { useEffect, useMemo, useState } from "react";
import { MotionConfig } from "framer-motion";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AppShell } from "./components/AppShell";
import { TabType } from "./components/BottomNav";

import { CaptureScreen } from "./screens/CaptureScreen";
import { ReviewScreen } from "./screens/ReviewScreen";

import { useWriteLater } from "./hooks/useWriteLater";
import { buildReview, localDate } from "./lib/review";
import { DEFAULT_DB_NAME, DEMO_DB_NAME } from "./storage/db";
import { applyUpdate, registerServiceWorker } from "./lib/serviceWorker";

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

/** Tracks connectivity so the app can say that saving still works offline. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function AppContent({ demo }: { demo: boolean }) {
  const online = useOnline();
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updatedElsewhere, setUpdatedElsewhere] = useState(false);
  useEffect(() => registerServiceWorker(setWaitingWorker, () => setUpdatedElsewhere(true)), []);
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
      {updatedElsewhere && (
        <div
          role="alert"
          className="mx-5 mt-4 flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-foreground"
        >
          <span className="flex-1">WriteLater was updated in another tab. Reload to keep using it. Your draft is kept.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-[44px] px-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            Reload
          </button>
        </div>
      )}
      {waitingWorker && !updatedElsewhere && (
        <div
          role="status"
          className="mx-5 mt-4 flex items-center gap-3 rounded-xl border border-[var(--paper-border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-foreground"
        >
          <span className="flex-1">A new version of WriteLater is ready.</span>
          <button
            type="button"
            onClick={() => applyUpdate(waitingWorker)}
            className="min-h-[44px] px-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            Reload to update
          </button>
        </div>
      )}
      {!online && (
        <div
          role="status"
          className="mx-5 mt-4 rounded-xl border border-[var(--paper-border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-foreground"
        >
          You're offline. Everything still saves on this device.
        </div>
      )}
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
  const demo = useMemo(() => isDemoMode(), []);
  return (
    // reducedMotion="user" turns off framer-motion transforms when the system
    // Reduce Motion setting is on.
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <AppContent demo={demo} />
      </TooltipProvider>
    </MotionConfig>
  );
}

export default App;
