import React from "react";
import { BottomNav, TabType } from "./BottomNav";

interface AppShellProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  children: React.ReactNode;
}

export function AppShell({ activeTab, onTabChange, children }: AppShellProps) {
  return (
    <div className="min-h-[100dvh] w-full flex justify-center bg-transparent md:py-8">
      <div 
        className="w-full max-w-[430px] bg-[var(--surface)] md:rounded-[2.5rem] overflow-hidden flex flex-col relative h-[100dvh] md:h-[850px] shadow-none"
        style={{
          boxShadow: "0 32px 80px -12px rgba(80,50,30,0.18), 0 0 0 1px rgba(200,170,140,0.25)"
        }}
      >
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar pb-6 relative z-0">
          {children}
        </main>
        
        {/* Bottom Navigation */}
        <div className="mt-auto relative z-10">
          <BottomNav activeTab={activeTab} onTabChange={onTabChange} />
        </div>
      </div>
    </div>
  );
}
