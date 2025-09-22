"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useTabs } from "./TabsProvider";

export default function TabsBar(): JSX.Element {
  const { tabs, activeHref, activateTab, closeTab, closeOthers, closeAll } = useTabs();
  if (!tabs.length) return <div className="border-b border-neutral-800" />;

  return (
    <div className="border-b border-neutral-800 bg-neutral-950 px-2">
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
                  active ? "border-orange-400 bg-neutral-900" : "border-orange-400/40 hover:border-orange-400"
                }`}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.2 }}
              >
                <button onClick={() => activateTab(t.href)} className="flex items-center gap-1 outline-none" title={t.title}>
                  {t.icon ? <span className="opacity-80">{t.icon}</span> : null}
                  <span className="truncate max-w-[200px] font-header tracking-wide">
                    {t.title}{pinned ? " 📌" : ""}
                  </span>
                </button>

                {!pinned && (
                  <button
                    onClick={() => closeTab(t.href)}
                    className="rounded px-1 text-xs text-neutral-400 hover:text-white"
                    title="Close"
                  >
                    ✕
                  </button>
                )}

                {active && (
                  <motion.div
                    layoutId="active-underline"
                    className="pointer-events-none absolute -bottom-[3px] left-2 right-2 h-[2px] rounded bg-orange-400"
                    transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.25 }}
                  />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => closeOthers(activeHref)}
            className="rounded-md border-2 border-orange-400/40 px-2 py-1 text-xs text-orange-100 hover:border-orange-400 font-header"
            title="Close all except current"
          >
            Close Others
          </button>
          <button
            onClick={closeAll}
            className="rounded-md border-2 border-orange-400/40 px-2 py-1 text-xs text-orange-100 hover:border-orange-400 font-header"
            title="Close all tabs"
          >
            Close All
          </button>
        </div>
      </div>
    </div>
  );
}