"use client";

import { useRouter } from "next/navigation";

type Props = { role: "owner" | "manager" | "advisor" | "tech" | "admin" };

export default function QuickActions({ role }: Props) {
  const router = useRouter();

  const shared = [
    { label: "🧾 View Work Orders", path: "/work-orders" },
    { label: "📋 Start Inspection", path: "/inspections" },
  ];

  const roleSpecific = {
    owner: [{ label: "📊 Reports", path: "/dashboard/owner/reports" }],
    manager: [{ label: "👥 Manage Staff", path: "/dashboard/manager/staff" }],
    advisor: [{ label: "📞 Customer Follow-ups", path: "/dashboard/advisor/customers" }],
    tech: [{ label: "🔧 My Jobs", path: "/dashboard/tech/work-orders" }],
    admin: [{ label: "⚙️ Settings", path: "/dashboard/admin/settings" }],
  };

  const actions = [...shared, ...(roleSpecific[role] || [])];

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
