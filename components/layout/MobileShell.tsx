"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MobileBottomNav } from "./MobileBottomNav";

export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showHomeLink = pathname !== "/mobile";

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="h-12 flex items-center justify-between px-4 border-b border-border">
        {showHomeLink ? (
          <Link
            href="/mobile"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            ← Home
          </Link>
        ) : (
          // spacer so title stays centered
          <span className="text-xs opacity-0 select-none">← Home</span>
        )}

        <span className="text-sm font-semibold">ProFixIQ Companion</span>

        {/* spacer to mirror left side and keep title centered */}
        <span className="w-[3rem]" />
      </header>

      <div className="flex-1 overflow-y-auto">{children}</div>

      <MobileBottomNav />
    </div>
  );
}