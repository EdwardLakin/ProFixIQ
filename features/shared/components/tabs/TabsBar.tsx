"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { cn } from "@/features/shared/utils/cn";
import { useTabs } from "./TabsProvider";

const AUTH_ROUTES = new Set([
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
]);

type TabsBarProps = {
  subdued?: boolean;
};

export default function TabsBar({ subdued = false }: TabsBarProps) {
  const { tabs, activeHref, activateTab, closeTab, closeOthers, closeAll } =
    useTabs();

  const pathname = usePathname() || "/";
  const isDashboardRoute =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  // ❌ Never show tabs on auth routes or polished dashboard surfaces
  if (AUTH_ROUTES.has(pathname) || isDashboardRoute) {
    return null;
  }

  const safeTabs = Array.isArray(tabs) ? tabs : [];

  return (
    <div
      aria-hidden={subdued}
      className={cn(
        "sticky top-0 z-20 -mt-1 w-full min-w-0 border-b px-2 transition-all duration-200",
        "border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] backdrop-blur-lg",
        subdued && "pointer-events-none opacity-25 saturate-50",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 py-1">
        <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-center gap-1">
            <AnimatePresence initial={false}>
              {safeTabs.map((t) => {
                const active = t.href === activeHref;
                const pinned = !!t.pinned;

                return (
                  <motion.div
                    key={t.href}
                    layout
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    className={cn(
                      "group inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors",
                      active
                        ? "border-[var(--brand-accent,#E39A6E)]/45 bg-[var(--theme-gradient-panel)] text-[color:var(--theme-text-primary)] shadow-[inset_0_1px_0_rgba(148,163,184,0.16)]"
                        : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-secondary)] hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-panel)] hover:text-[color:var(--theme-text-primary)]",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => activateTab(t.href)}
                      className="flex max-w-[200px] items-center gap-1"
                    >
                      <span className="truncate leading-none">{t.title}</span>
                      {pinned && (
                        <span
                          aria-label="Default dashboard tab"
                          className="rounded-sm border border-[color:var(--theme-border-soft)] px-1 py-px text-[8px] uppercase tracking-[0.1em] text-[color:var(--theme-text-secondary)]"
                        >
                          Base
                        </span>
                      )}
                    </button>

                    {!pinned && (
                      <button
                        type="button"
                        onClick={() => closeTab(t.href)}
                        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded text-[10px] leading-none text-[color:var(--theme-text-muted)] transition hover:bg-[color:var(--theme-surface-hover)] hover:text-[color:var(--theme-text-primary)]"
                        aria-label="Close tab"
                      >
                        ✕
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {safeTabs.length === 0 && (
              <div className="px-2 py-1 text-xs text-[color:var(--theme-text-muted)]">No tabs yet</div>
            )}
          </div>
        </div>

        <div className="ml-1.5 flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => closeOthers(activeHref)}
            className="inline-flex h-6 items-center rounded border border-[color:var(--theme-border-soft)] px-1.5 text-[10px] text-[color:var(--theme-text-secondary)] transition hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-panel)] hover:text-[color:var(--theme-text-primary)]"
          >
            Close others
          </button>
          <button
            type="button"
            onClick={closeAll}
            className="inline-flex h-6 items-center rounded border border-[color:var(--theme-border-soft)] px-1.5 text-[10px] text-[color:var(--theme-text-secondary)] transition hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-panel)] hover:text-[color:var(--theme-text-primary)]"
          >
            Close all
          </button>
        </div>
      </div>
    </div>
  );
}
