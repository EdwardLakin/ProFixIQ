//components/layout/MobileShell.tsx

"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { MobileBottomNav } from "./MobileBottomNav";
import AskAssistantEntry from "@/features/assistant/components/AskAssistantEntry";


type Props = {
  children: ReactNode;
  /** Optional custom title for the top bar */
  title?: string;
};

function getTitleFromPath(pathname: string): string {
  if (!pathname.startsWith("/mobile")) return "ProFixIQ";
  if (pathname === "/mobile") return "Tech Home";

  if (pathname.startsWith("/mobile/work-orders")) return "Work Orders";
  if (pathname.startsWith("/mobile/messages")) return "Inbox";
  if (pathname.startsWith("/mobile/settings")) return "Settings";

  return "ProFixIQ";
}

export function MobileShell({ children, title }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const supabase = useMemo(() => createBrowserSupabase(), []);

  const resolvedTitle = title ?? getTitleFromPath(pathname);

  if (pathname === "/mobile/sign-in" || pathname.startsWith("/mobile/sign-in/")) {
    return children;
  }

  const handleHome = () => {
    router.push("/mobile");
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.push("/sign-in");
    } catch {
      // swallow – worst case user still signed in
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col app-metal-bg text-[color:var(--theme-text-primary)]">
      {/* Top bar – dark “metal” strip with hamburger + title + home */}
      <header className="metal-bar sticky top-0 z-40 flex items-center justify-between px-4 py-2 shadow-[var(--theme-shadow-medium)]">
        {/* Left: menu + title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="desktop-btn-secondary inline-flex h-8 w-8 items-center justify-center rounded-full border active:scale-95"
          >
            <span className="sr-only">Open menu</span>
            <div className="flex flex-col gap-[3px]">
              <span className="h-[2px] w-[14px] rounded-full bg-[color:var(--theme-surface-panel-strong)]" />
              <span className="h-[2px] w-[14px] rounded-full bg-[color:var(--theme-surface-panel-strong)]" />
              <span className="h-[2px] w-[14px] rounded-full bg-[color:var(--theme-surface-panel-strong)]" />
            </div>
          </button>

          <span className="text-[0.75rem] font-medium text-[color:var(--theme-text-primary)]">
            {resolvedTitle}
          </span>
        </div>

        {/* Right: home + brand */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleHome}
            className="desktop-btn-secondary inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[0.7rem] text-[color:var(--theme-text-primary)] active:scale-95"
          >
            <span className="block h-[10px] w-[10px] rounded-[3px] border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]" />
            <span className="uppercase tracking-[0.16em]">Home</span>
          </button>

          <div className="flex flex-col items-end leading-none">
            <span className="font-blackops text-xs tracking-[0.22em] text-[var(--accent-copper-light)]">
              PROFIXIQ
            </span>
            <span className="text-[0.65rem] text-[color:var(--theme-text-secondary)]">Tech Suite</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="relative flex-1 overflow-y-auto">
        {children}
      </main>

      <AskAssistantEntry mobile placement="dock" />

      {/* Footer – simple metal strip with sign-out */}
      <footer className="metal-bar sticky bottom-0 z-30 flex items-center justify-between px-4 py-2 text-[0.7rem] pb-[calc(0.5rem+var(--safe-bottom))]">
        <span className="text-[color:var(--theme-text-secondary)]">
          ProFixIQ Mobile
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="inline-flex items-center gap-1 rounded-full border border-red-400/50 bg-red-500/10 px-3 py-1 text-[0.7rem] font-medium text-red-100 hover:bg-red-500/20 disabled:opacity-60"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </footer>

      {/* Slide-in side nav (formerly bottom nav) */}
      <MobileBottomNav
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
    </div>
  );
}

export default MobileShell;
