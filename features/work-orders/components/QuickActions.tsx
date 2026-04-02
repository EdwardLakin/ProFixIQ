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
    <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
      {actions.map((action) => (
        <button
          key={action.path}
          onClick={() => router.push(action.path)}
          className="rounded-2xl border border-white/10 bg-black/30 p-4 text-left text-neutral-100 shadow-card backdrop-blur-md transition hover:-translate-y-[1px] hover:border-[var(--accent-copper-soft)] hover:bg-black/40"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
