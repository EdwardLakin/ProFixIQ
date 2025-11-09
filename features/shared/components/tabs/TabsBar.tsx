// features/shared/components/tabs/TabsBar.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useTabs } from "./TabsProvider";
import { usePathname } from "next/navigation";

export default function TabsBar(): JSX.Element {
  const { tabs, activeHref, activateTab, closeTab, closeOthers, closeAll } = useTabs();
  const pathname = usePathname();

  // 👇 don't show tabs on the dashboard
  if (pathname === "/dashboard") {
    return <div className="border-b border-border/40" />;
  }

  if (!tabs.length) return <div className="border-b border-border/40" />;

  return (
    <div className="border-b border-border/40 bg-background/40 px-2">
      <div className="flex items-center gap-2 overflow-x-auto py-2">
        <AnimatePresence initial={false}>
          {tabs.map((t) => {
            const active = t.href === activeHref;
            const pinned = !!t.pinned;
            return (
              <motion.div
                key={t.href}
                layout
                className={`group relative inline-flex items-center gap-2 rounded-md border-2 px-2.5 py-1.5 text-sm ${
                  active
                    ? "border-accent bg-surface"
                    : "border-border/40 hover:border-accent/70"
                }`}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
              >
                <button
                  onClick={() => activateTab(t.href)}
                  className="flex items-center gap-1 outline-none"
                >
                  <span className="truncate max-w-[200px]">{t.title}</span>
                  {pinned ? "📌" : null}
                </button>
                {!pinned && (
                  <button
                    onClick={() => closeTab(t.href)}
                    className="rounded px-1 text-xs text-muted-foreground hover:text-foreground"
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
            onClick={() => closeOthers(activeHref)}
            className="rounded-md border border-border/50 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Close others
          </button>
          <button
            onClick={closeAll}
            className="rounded-md border border-border/50 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Close all
          </button>
        </div>
      </div>
    </div>
  );
}