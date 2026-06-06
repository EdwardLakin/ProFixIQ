"use client";
import { useMemo } from "react";
import ButtonLink from "./ButtonLink";

type Role = "owner" | "tech" | "advisor" | "manager";
type Action = { label: string; href: string };

const ACTIONS: Record<Role, Action[]> = {
  owner: [
    { label: "📸 Diagnose from Photo", href: "/diagnose" },
    { label: "🔍 Run DTC Diagnosis", href: "/dtc-lookup" },
    { label: "🧾 View Work Orders", href: "/dashboard/owner/work-orders" },
    { label: "📋 Build Inspection", href: "/dashboard/inspections/custom-inspection" },
    { label: "📂 Saved Templates", href: "/dashboard/inspections/created" },
    { label: "🖼️ Public Templates", href: "/dashboard/inspections/templates" },
  ],
  tech: [
    { label: "🧰 My Job Queue", href: "/dashboard/tech/queue" },
    { label: "⏱️ Punch In/Out", href: "/dashboard/tech/queue" },
  ],
  advisor: [
    { label: "🧾 Writer Queue", href: "/dashboard/advisor/queue" },
    { label: "📝 Create Work Order", href: "/dashboard/advisor/work-orders/create" },
  ],
  manager: [
    { label: "📊 Dispatch Board", href: "/fleet/dispatch" },
    { label: "🧾 All Work Orders", href: "/dashboard/manager/work-orders" },
  ],
};

export default function DashboardQuickActions({ role }: { role: Role }) {
  const items = useMemo(() => ACTIONS[role], [role]);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
      {items.map((a) => (
        <ButtonLink key={a.href} href={a.href}>{a.label}</ButtonLink>
      ))}
    </div>
  );
}
