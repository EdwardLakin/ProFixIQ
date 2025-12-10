"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useTabs } from "./TabsProvider";
import { usePathname } from "next/navigation";

export default function TabsBar() {
  const { tabs, activeHref, activateTab, closeTab, closeOthers, closeAll } =
    useTabs();
  const pathname = usePathname();

  // Simple divider when no tabs or on dashboard
  if (pathname === "/dashboard" || !tabs.length) {
    return <div className="border-b border-border bg-background/80" />;
  }

  return (
    <div className="border-b border-border bg-card/80 px-2 backdrop-blur-sm">
      <div className="flex items-center gap-2 overflow-x-auto py-1.5">
        <AnimatePresence initial={false}>
          {tabs.map((t) => {
            const active = t.href === activeHref;
            const pinned = !!t.pinned;

            return (
              <motion.div
                key={t.href}
                layout
                className={`
                  group relative inline-flex items-center gap-2
                  rounded-full px-3 py-1 text-xs sm:text-sm
                  border transition-all
                  ${
                    active
                      ? "border-[var(--accent-copper-light)] bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.2),transparent_55%),rgba(15,23,42,0.95)] text-white shadow-[0_0_20px_rgba(248,113,22,0.45)]"
                      : "border-border/70 bg-neutral-950/70 text-neutral-300 hover:bg-neutral-900/90 hover:text-white"
                  }
                `}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
              >
                <button
                  type="button"
                  onClick={() => activateTab(t.href)}
                  className={`
                    flex items-center gap-1 outline-none
                    focus-visible:ring-2 focus-visible:ring-[var(--accent-copper-soft)]
                    focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950
                  `}
                >
                  <span className="max-w-[180px] truncate sm:max-w-[220px]">
                    {t.title}
                  </span>
                  {pinned && (
                    <span className="text-[10px] opacity-80" aria-label="Pinned">
                      📌
                    </span>
                  )}
                </button>

                {!pinned && (
                  <button
                    type="button"
                    onClick={() => closeTab(t.href)}
                    className={`
                      text-[10px] rounded-full px-1.5
                      text-neutral-500 hover:text-white
                      hover:bg-neutral-800/80
                    `}
                    aria-label={`Close ${t.title}`}
                  >
                    ✕
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => closeOthers(activeHref)}
            className={`
              rounded-full border border-border/80 px-2.5 py-1
              text-[11px] text-neutral-300
              bg-neutral-950/60
              hover:bg-neutral-900 hover:text-white
              focus-visible:outline-none
              focus-visible:ring-2 focus-visible:ring-[var(--accent-copper-soft)]
              focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950
            `}
          >
            Close others
          </button>
          <button
            type="button"
            onClick={closeAll}
            className={`
              rounded-full border border-border/80 px-2.5 py-1
              text-[11px] text-neutral-300
              bg-neutral-950/60
              hover:bg-red-900/30 hover:text-red-100 hover:border-red-500/70
              focus-visible:outline-none
              focus-visible:ring-2 focus-visible:ring-red-500/70
              focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950
            `}
          >
            Close all
          </button>
        </div>
      </div>
    </div>
  );
}