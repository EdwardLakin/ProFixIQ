"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useTabs } from "./TabsProvider";
import { usePathname } from "next/navigation";

export default function TabsBar() {
  const { tabs, activeHref, activateTab, closeTab, closeOthers, closeAll } = useTabs();
  const pathname = usePathname();

  if (pathname === "/dashboard") {
    return <div className="border-b border-neutral-800" />;
  }

  if (!tabs.length) {
    return <div className="border-b border-neutral-800" />;
  }

  return (
    <div className="border-b border-neutral-800 bg-neutral-950/60 px-2 backdrop-blur-sm">
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
                  rounded-md px-3 py-1 text-sm transition 
                  border border-neutral-700 
                  ${active ? "bg-neutral-800 border-orange-500" : "hover:bg-neutral-900"}
                `}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
              >
                <button
                  onClick={() => activateTab(t.href)}
                  className="flex items-center gap-1"
                >
                  <span className="truncate max-w-[200px]">
                    {t.title}
                  </span>
                  {pinned && <span>📌</span>}
                </button>

                {!pinned && (
                  <button
                    onClick={() => closeTab(t.href)}
                    className="text-xs rounded px-1 text-neutral-400 hover:text-white"
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
            className="
              rounded-md border border-neutral-700 px-2 py-1 
              text-xs text-neutral-400 hover:text-white hover:bg-neutral-900
            "
          >
            Close others
          </button>
          <button
            onClick={closeAll}
            className="
              rounded-md border border-neutral-700 px-2 py-1 
              text-xs text-neutral-400 hover:text-white hover:bg-neutral-900
            "
          >
            Close all
          </button>
        </div>

      </div>
    </div>
  );
}