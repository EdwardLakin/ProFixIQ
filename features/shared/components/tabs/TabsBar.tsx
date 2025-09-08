"use client";

import { useTabs } from "./TabsProvider";

export default function TabsBar(): JSX.Element {
  const { tabs, activeHref, activateTab, closeTab, closeOthers, closeAll } = useTabs();

  if (!tabs.length) return <div className="border-b border-neutral-800" />;

  return (
    <div className="border-b border-neutral-800 bg-neutral-950 px-2">
      <div className="flex items-center gap-2 overflow-x-auto py-2">
        {tabs.map((t) => {
          const active = t.href === activeHref;
          return (
            <div
              key={t.href}
              className={`group inline-flex items-center gap-2 rounded border px-2 py-1 text-sm ${
                active
                  ? "border-orange-400 bg-neutral-900"
                  : "border-orange-400/40 hover:border-orange-400"
              }`}
            >
              <button
                onClick={() => activateTab(t.href)}
                className="flex items-center gap-1 outline-none"
                title={t.title}
              >
                <span aria-hidden>{t.icon ?? "📄"}</span>
                <span className="truncate max-w-[180px]">{t.title}</span>
              </button>
              <button
                onClick={() => closeTab(t.href)}
                className="rounded border border-transparent px-1 text-xs text-neutral-400 hover:text-white hover:border-orange-400"
                title="Close"
              >
                ✕
              </button>
            </div>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => closeOthers(activeHref)}
            className="rounded border border-orange-400/40 px-2 py-1 text-xs text-orange-100 hover:border-orange-400"
          >
            Close Others
          </button>
          <button
            onClick={closeAll}
            className="rounded border border-orange-400/40 px-2 py-1 text-xs text-orange-100 hover:border-orange-400"
          >
            Close All
          </button>
        </div>
      </div>
    </div>
  );
}
