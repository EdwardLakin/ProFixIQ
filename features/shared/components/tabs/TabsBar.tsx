// features/shared/components/tabs/TabsBar.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useTabs } from "./TabsProvider";

export default function TabsBar(): JSX.Element {
  const { tabs, activeHref, activateTab, closeTab, closeOthers, closeAll } = useTabs();
  if (!tabs.length) return <div className="border-b border-white/5" />;

  return (
    <div className="border-b border-white/5 bg-background/60 backdrop-blur px-2">
      <div className="flex items-center gap-2 overflow-x-auto py-2">
        <AnimatePresence initial={false}>
          {tabs.map((t) => {
            const active = t.href === activeHref;
            const pinned = !!t.pinned;
            return (
              <motion.div
                key={t.href}
                layout
                className={`group relative inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${
                  active
                    ? "bg-white/8 text-white"
                    : "text-muted-foreground hover:bg-white/4 hover:text-foreground"
                }`}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.2 }}
              >
                <button onClick={() => activateTab(t.href)} className="flex items-center gap-1 outline-none">
                  <span className="truncate max-w-[180px]">{t.title}{pinned ? " 📌" : ""}</span>
                </button>

                {!pinned && (
                  <button
                    onClick={() => closeTab(t.href)}
                    className="rounded px-1 text-xs text-muted-foreground hover:text-white"
                    title="Close"
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
            className="rounded-md border border-white/5 bg-background/40 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Close others
          </button>
          <button
            onClick={closeAll}
            className="rounded-md border border-white/5 bg-background/40 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Close all
          </button>
        </div>
      </div>
    </div>
  );
}