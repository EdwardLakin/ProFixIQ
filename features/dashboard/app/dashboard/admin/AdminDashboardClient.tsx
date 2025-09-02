"use client";

import Link from "next/link";
import QuickActions from "@shared/components/QuickActions";

export default function AdminDashboardClient() {
  const tiles = [
    // People & HR
    { href: "/dashboard/admin/employees",    label: "Employees" },
    { href: "/dashboard/admin/create-user",  label: "Create User" },
    { href: "/dashboard/admin/employee-docs",label: "Employee Documents" },
    { href: "/dashboard/admin/certifications", label: "Certifications" },
    { href: "/dashboard/admin/scheduling",   label: "Scheduling" },

    // Org & Access
    { href: "/dashboard/admin/roles",        label: "Roles" },
    { href: "/dashboard/admin/teams",        label: "Teams" },

    // Business
    { href: "/dashboard/admin/shops",        label: "Shops" },
    { href: "/dashboard/admin/billing",      label: "Billing" },

    // System
    { href: "/dashboard/admin/audit",        label: "Audit Logs" },
  ];

  return (
    <div className="min-h-screen p-6 text-white">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-orange-400">Admin Dashboard</h1>
          <p className="text-sm opacity-75">HR, roles, shops & audit oversight</p>
        </div>

        <div className="mt-4">
          <Link href="/dashboard/admin/employee-docs" className="text-sm underline">
            Manage Employee Documents
          </Link>
        </div>
      </header>

      <QuickActions role="admin" className="mb-8" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="block">
            <div className="p-4 bg-surface rounded shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="text-lg font-semibold">{t.label}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}