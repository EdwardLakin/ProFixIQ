// app/dashboard/admin/AdminDashboardClient.tsx
"use client";

import Link from "next/link";
import QuickActions from "@shared/components/QuickActions";
import AdminQuickPanel from "@/features/admin/components/AdminQuickPanel";

export default function AdminDashboardClient() {
  const tiles = [
    { href: "/dashboard/admin/audit", label: "Audit Logs" },
    { href: "/dashboard/workforce/overview", label: "Workforce Module" },
    { href: "/dashboard/admin/shops", label: "Shops" },
    { href: "/dashboard/admin/roles", label: "Roles" },
    { href: "/dashboard/admin/billing", label: "Billing" },
  ];

  return (
    <div className="mx-auto min-h-screen w-full max-w-[1800px] px-3 py-4 text-[color:var(--theme-text-primary)] sm:px-5 lg:px-6">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-orange-400">Admin Dashboard</h1>
          <p className="text-sm opacity-75">Platform governance and privileged oversight.</p>
        </div>
      </header>

      <QuickActions role="admin" className="mb-6" />

      <div className="mb-8">
        <AdminQuickPanel />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
