"use client";

import { useRouter } from "next/navigation";

export default function QuickActions() {
  const router = useRouter();

  const actions = [
    { label: "📸 Diagnose from Photo", path: "/diagnose" },
    { label: "🔍 Run DTC Diagnosis", path: "/dtc-lookup" },
    { label: "🧾 View Work Orders", path: "/work-orders" },
    { label: "📋 Start Inspection", path: "/inspections" },
    { label: "🚘 Add Vehicle", path: "/vehicles" },
  ];

  return (
    <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
      {actions.map((action) => (
        <button
          key={action.path}
          onClick={() => router.push(action.path)}
          className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-left text-sm font-semibold text-[color:var(--theme-text-primary)] shadow-card backdrop-blur-xl transition hover:bg-[color:var(--theme-surface-inset)]"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
