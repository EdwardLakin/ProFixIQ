"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { useTabs } from "./TabsProvider";

const AUTH_ROUTES = new Set([
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
]);

export default function TabsBar() {
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
      className="
        sticky top-0 z-30
        -mt-1
        w-full min-w-0
        border-b border-slate-700/40
        bg-[linear-gradient(180deg,rgba(2,6,23,0.88),rgba(2,6,23,0.72))]
        backdrop-blur-xl
        px-2.5
      "
    >
      <div className="flex min-w-0 items-center gap-2 py-1.5">
        {/* Tabs scroller */}
        <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-center gap-1.5">
            <AnimatePresence initial={false}>
              {safeTabs.map((t) => {
                const active = t.href === activeHref;
                const pinned = !!t.pinned;

                return (
                  <motion.div
                    key={t.href}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`
                      group inline-flex h-8 items-center gap-1.5 rounded-md border
                      px-2.5 text-[12px] transition-colors
                      ${
                        active
                          ? "border-[var(--brand-accent,#E39A6E)]/55 bg-[linear-gradient(140deg,rgba(30,41,59,0.75),rgba(15,23,42,0.95))] text-white shadow-[inset_0_1px_0_rgba(148,163,184,0.22),0_8px_24px_rgba(0,0,0,0.35)]"
                          : "border-slate-600/40 bg-slate-900/45 text-slate-300 hover:border-slate-500/60 hover:bg-slate-900/70 hover:text-slate-100"
                      }
                    `}
                  >
                    <button
                      type="button"
                      onClick={() => activateTab(t.href)}
                      className="flex max-w-[220px] items-center gap-1.5"
                    >
                      <span className="truncate leading-none">{t.title}</span>
                      {pinned && (
                        <span
                          aria-label="Default dashboard tab"
                          className="rounded-sm border border-slate-500/45 px-1 py-[1px] text-[9px] uppercase tracking-[0.12em] text-slate-300"
                        >
                          Base
                        </span>
                      )}
                    </button>

                    {!pinned && (
                      <button
                        type="button"
                        onClick={() => closeTab(t.href)}
                        className="inline-flex h-4 w-4 items-center justify-center rounded text-[11px] leading-none text-slate-400 transition hover:bg-slate-700/55 hover:text-slate-100"
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
              <div className="px-2 py-1 text-xs text-neutral-500">
                No tabs yet
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="ml-2 flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => closeOthers(activeHref)}
            className="inline-flex h-7 items-center rounded-md border border-slate-600/40 px-2 text-[11px] text-slate-300 transition hover:border-slate-500/60 hover:bg-slate-900/80 hover:text-slate-100"
          >
            Close others
          </button>
          <button
            type="button"
            onClick={closeAll}
            className="inline-flex h-7 items-center rounded-md border border-slate-600/40 px-2 text-[11px] text-slate-300 transition hover:border-slate-500/60 hover:bg-slate-900/80 hover:text-slate-100"
          >
            Close all
          </button>
        </div>
      </div>
    </div>
  );
}
