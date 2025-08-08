import React from "react";
import { useRouter } from "next/router";

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
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
      {actions.map((action) => (
        <button
          key={action.path}
          onClick={() => router.push(action.path)}
          className="bg-surface text-accent shadow-card rounded-lg p-4 hover:shadow-lg transition"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
