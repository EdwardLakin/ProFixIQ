// app/mobile/MobileShell.tsx
"use client";

import React from "react";
import { MobileBottomNav } from "./MobileBottomNav";

export function MobileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="h-12 flex items-center px-4 border-b border-border">
        <span className="text-sm font-semibold">ProFixIQ Companion</span>
      </header>

      <div className="flex-1 overflow-y-auto">{children}</div>

      <MobileBottomNav />
    </div>
  );
}