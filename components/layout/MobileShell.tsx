// components/layout/MobileShell.tsx

"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MobileBottomNav } from "./MobileBottomNav";

type Props = {
  children: ReactNode;
  title?: string;
};

function getTitleFromPath(pathname: string): string {
  if (!pathname.startsWith("/mobile")) return "ProFixIQ";
  if (pathname === "/mobile") return "Dashboard";
  if (pathname.startsWith("/mobile/work-orders/create")) return "Create work order";
  if (pathname.startsWith("/mobile/work-orders")) return "Work orders";
  if (pathname.startsWith("/mobile/appointments")) return "Appointments";
  if (pathname.startsWith("/mobile/inspections")) return "Inspections";
  if (pathname.startsWith("/mobile/messages")) return "Inbox";
  if (pathname.startsWith("/mobile/tech/queue")) return "My jobs";
  if (pathname.startsWith("/mobile/settings")) return "Settings";
  return "ProFixIQ";
}

export function MobileShell({ children, title }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const resolvedTitle = title ?? getTitleFromPath(pathname);

  if (pathname === "/mobile/sign-in" || pathname.startsWith("/mobile/sign-in/")) {
    return children;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]">
      <header className="sticky top-0 z-40 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]/95 pt-[env(safe-area-inset-top,0px)] shadow-sm backdrop-blur-xl">
        <div className="flex h-14 min-w-0 items-center justify-between gap-3 px-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={menuOpen}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] active:scale-95"
            >
              <span className="sr-only">Open menu</span>
              <span className="flex flex-col gap-1">
                <span className="h-0.5 w-4 rounded-full bg-[color:var(--theme-text-primary)]" />
                <span className="h-0.5 w-4 rounded-full bg-[color:var(--theme-text-primary)]" />
                <span className="h-0.5 w-4 rounded-full bg-[color:var(--theme-text-primary)]" />
              </span>
            </button>

            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{resolvedTitle}</div>
              <div className="truncate text-[0.62rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                ProFixIQ Mobile
              </div>
            </div>
          </div>

          {pathname !== "/mobile" ? (
            <button
              type="button"
              onClick={() => router.push("/mobile")}
              className="shrink-0 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-xs font-medium"
            >
              Dashboard
            </button>
          ) : (
            <span className="font-blackops shrink-0 text-xs tracking-[0.18em] text-[var(--accent-copper)]">
              PROFIXIQ
            </span>
          )}
        </div>
      </header>

      <main className="min-w-0 overflow-x-hidden pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>

      <MobileBottomNav open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

export default MobileShell;
