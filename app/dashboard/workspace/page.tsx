"use client";

import { useState } from "react";

const TABS = [
  { key: "work",  label: "Work Orders",  src: "/work-orders" },
  { key: "parts", label: "Parts",        src: "/parts" },
  { key: "insp",  label: "Inspections",  src: "/inspections" },
];

export default function Workspace() {
  const [active, setActive] = useState("work");

  return (
    <div className="h-[calc(100dvh-140px)] flex flex-col">
      <div className="mb-3 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`rounded px-3 py-1 text-sm border
              ${active === t.key ? "bg-orange-500 text-[color:var(--theme-text-on-accent)] border-orange-500"
                                 : "bg-[color:var(--theme-surface-panel)] text-[color:var(--theme-text-primary)] border-[color:var(--theme-border-soft)] hover:border-orange-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {TABS.map((t) => (
        <iframe
          key={t.key}
          src={t.src}
          className={`${active === t.key ? "block" : "hidden"} flex-1 w-full rounded-lg border border-[color:var(--theme-border-soft)]`}
        />
      ))}
    </div>
  );
}