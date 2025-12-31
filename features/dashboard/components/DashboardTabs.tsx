// components/tabs/DashboardTabs.tsx
"use client";

import { useTabs } from "@shared/components/tabs/TabsProvider";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";

export default function DashboardTabs() {
  const { tabs, activeHref, activateTab, closeTab, closeOthers, closeAll } =
    useTabs();

  const hasTabs = tabs.length > 0;
  const canCloseOthers = useMemo(
    () => hasTabs && tabs.some((t) => t.href !== activeHref),
    [hasTabs, tabs, activeHref],
  );

  return (
    <div className="w-full border-b border-neutral-800 bg-neutral-900">
      <div className="flex items-center gap-2 p-2">
        {/* Scrollable tab row */}
        <div className="flex min-w-0 flex-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-center gap-2">
            <AnimatePresence initial={false}>
              {tabs.map((t) => (
                <motion.div
                  key={t.href}
                  className={[
                    "flex items-center gap-2 rounded px-3 py-1 whitespace-nowrap",
                    t.href === activeHref
                      ? "bg-orange-700 text-white border border-orange-400"
                      : "bg-neutral-800 text-neutral-200 border border-white/10 hover:border-orange-400/60",
                  ].join(" ")}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  layout
                >
                  <button
                    type="button"
                    onClick={() => activateTab(t.href)}
                    className="flex items-center gap-2"
                    title={t.title}
                    aria-current={t.href === activeHref ? "page" : undefined}
                  >
                    {t.icon ? (
                      <span aria-hidden className="text-lg leading-none">
                        {t.icon}
                      </span>
                    ) : null}
                    <span className="truncate max-w-[160px]">{t.title}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => closeTab(t.href)}
                    className="ml-1 rounded px-1 text-xs leading-none text-red-300 hover:bg-red-900/30"
                    aria-label={`Close ${t.title}`}
                    title="Close"
                  >
                    ✕
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Actions */}
        {hasTabs && (
          <div className="ml-2 flex shrink-0 items-center gap-2">
            {canCloseOthers && (
              <button
                type="button"
                onClick={() => closeOthers(activeHref)}
                className="rounded border border-orange-400 px-2 py-1 text-xs font-medium text-orange-300 hover:bg-orange-500/10"
              >
                Close Others
              </button>
            )}
            <button
              type="button"
              onClick={closeAll}
              className="rounded border border-orange-400 px-2 py-1 text-xs font-medium text-orange-300 hover:bg-orange-500/10"
            >
              Close All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}