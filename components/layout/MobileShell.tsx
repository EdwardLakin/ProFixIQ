"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { MobileBottomNav } from "./MobileBottomNav";

type Props = {
  children: ReactNode;
  /** Optional custom title for the top bar */
  title?: string;
};

function getTitleFromPath(pathname: string): string {
  if (!pathname.startsWith("/mobile")) return "ProFixIQ";
  if (pathname === "/mobile") return "Tech Home";

  if (pathname.startsWith("/mobile/work-orders")) return "Work Orders";
  if (pathname.startsWith("/mobile/messages")) return "Messages";
  if (pathname.startsWith("/mobile/settings")) return "Settings";

  return "ProFixIQ";
}

export function MobileShell({ children, title }: Props) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const resolvedTitle = title ?? getTitleFromPath(pathname);

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      {/* Top bar – dark “metal” strip with hamburger + title */}
      <header className="metal-bar sticky top-0 z-40 flex items-center justify-between px-4 py-2 shadow-[0_6px_20px_rgba(0,0,0,0.9)]">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/40 hover:bg-black/70 active:scale-95"
        >
          <span className="sr-only">Open menu</span>
          <div className="flex flex-col gap-[3px]">
            <span className="h-[2px] w-[14px] rounded-full bg-white" />
            <span className="h-[2px] w-[14px] rounded-full bg-white" />
            <span className="h-[2px] w-[14px] rounded-full bg-white" />
          </div>
        </button>

        <div className="flex flex-col items-end">
          <span className="font-blackops text-xs tracking-[0.22em] text-[var(--accent-copper-light)]">
            PROFIXIQ
          </span>
          <span className="text-[0.7rem] font-medium text-neutral-200">
            {resolvedTitle}
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="relative flex-1 overflow-y-auto">
        {children}
      </main>

      {/* Slide-in side nav (formerly bottom nav) */}
      <MobileBottomNav
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
    </div>
  );
}

export default MobileShell;