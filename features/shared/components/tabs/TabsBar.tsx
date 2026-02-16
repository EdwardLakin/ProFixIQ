// features/shared/components/tabs/TabsBar.tsx
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

  // No full tab UI on dashboard or auth pages – just a subtle divider line
  if (pathname === "/dashboard" || AUTH_ROUTES.has(pathname)) {
    return <div className="w-full border-b border-neutral-800" />;
  }

  if (!tabs.length) {
    return <div className="w-full border-b border-neutral-800" />;
  }

  return (
    <div className="w-full min-w-0 border-b border-neutral-800 bg-neutral-950/60 px-2 backdrop-blur-sm overflow-x-hidden">
      {/* Outer row: tabs scroller on the left, controls on the right */}
      <div className="flex min-w-0 items-center gap-2 py-1.5">
        {/* Scrollable tabs area – this is the ONLY thing that scrolls horizontally */}
        <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-center gap-2">
            <AnimatePresence initial={false}>
              {tabs.map((t) => {
                const active = t.href === activeHref;
                const pinned = !!t.pinned;

                return (
                  <motion.div
                    key={t.href}
                    layout
                    className={`group relative inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm transition
                      ${
                        active
                          ? "border-orange-500 bg-neutral-800 text-white"
                          : "border-neutral-700 bg-neutral-900/60 text-neutral-300 hover:bg-neutral-900"
                      }`}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                  >
                    <button
                      type="button"
                      onClick={() => activateTab(t.href)}
                      className="flex items-center gap-1"
                    >
                      <span className="max-w-[200px] truncate">{t.title}</span>
                      {pinned && <span aria-label="Pinned tab">📌</span>}
                    </button>

                    {!pinned && (
                      <button
                        type="button"
                        onClick={() => closeTab(t.href)}
                        className="rounded px-1 text-xs text-neutral-400 hover:text-white"
                        aria-label="Close tab"
                      >
                        ✕
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Controls – fixed width, never forces layout wider */}
        <div className="ml-2 flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => closeOthers(activeHref)}
            className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-900 hover:text-white"
          >
            Close others
          </button>
          <button
            type="button"
            onClick={closeAll}
            className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-900 hover:text-white"
          >
            Close all
          </button>
        </div>
      </div>
    </div>
  );
}