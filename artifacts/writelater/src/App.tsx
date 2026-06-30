import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AppShell } from "./components/AppShell";
import { TabType } from "./components/BottomNav";

import { CaptureScreen } from "./screens/CaptureScreen";
import { InboxScreen } from "./screens/InboxScreen";
import { RitualScreen } from "./screens/RitualScreen";
import { PlannerScreen } from "./screens/PlannerScreen";

import { mockItems } from "./data/mockItems";
import { CaptureItem, ItemStatus } from "./types/planner";

const queryClient = new QueryClient();

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabType>("capture");
  const [items, setItems] = useState<CaptureItem[]>(mockItems);

  const handleSaveItem = (itemData: Omit<CaptureItem, "id" | "createdAt" | "status">) => {
    const newItem: CaptureItem = {
      ...itemData,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      status: "inbox",
    };
    setItems((prev) => [newItem, ...prev]);
    // Optional: Switch to inbox immediately after capture
    // setActiveTab("inbox"); 
  };

  const handleUpdateStatus = (id: string, status: ItemStatus) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );
  };

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === "capture" && <CaptureScreen onSave={handleSaveItem} items={items} />}
      {activeTab === "inbox" && <InboxScreen items={items} onUpdateStatus={handleUpdateStatus} />}
      {activeTab === "ritual" && <RitualScreen items={items} onUpdateStatus={handleUpdateStatus} />}
      {activeTab === "planner" && <PlannerScreen items={items} />}
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
        <SonnerToaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
