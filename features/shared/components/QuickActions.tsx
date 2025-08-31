"use client";

import { useRouter } from "next/navigation";
import React from "react";

type Role = "owner" | "manager" | "advisor" | "tech" | "admin";

type Props = {
  role?: Role;
  className?: string;
};

const BASE: { label: string; path: string }[] = [
  { label: "📸 Diagnose from Photo", path: "/tech/diagnose" },
  { label: "🔍 Run DTC Diagnosis", path: "/tech/dtc-lookup" },
  { label: "🧾 View Work Orders", path: "/work-orders" },
  { label: "📋 Start Inspection", path: "/dashboard/inspections/custom-inspection" },
  { label: "🚘 Add Vehicle", path: "/vehicles" },
];

const ADMIN_ACTIONS: typeof BASE = [
  { label: "👤 Add Employee", path: "/dashboard/admin/create-user" },
  { label: "🛡️ Manage Roles", path: "/dashboard/admin/roles" },
  { label: "🏪 Manage Shops", path: "/dashboard/admin/shops" },
  { label: "📜 Audit Logs", path: "/dashboard/admin/audit" },
];

export default function QuickActions({ role, className = "" }: Props) {
  const router = useRouter();
  const actions = role === "admin" ? ADMIN_ACTIONS : BASE;

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 gap-4 ${className}`}>
      {actions.map((a) => (
        <button
          key={a.path}
          onClick={() => router.push(a.path)}
          className="bg-surface text-accent shadow-card rounded-lg p-4 hover:shadow-lg transition text-left"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
