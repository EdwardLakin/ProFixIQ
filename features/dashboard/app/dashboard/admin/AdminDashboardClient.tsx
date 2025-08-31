"use client";

import Link from "next/link";
import QuickActions from "@shared/components/QuickActions";

export default function AdminDashboardClient() {
  return (
    <div className="min-h-screen p-6 text-white">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-orange-400">Admin Dashboard</h1>
          <p className="text-sm opacity-75">HR, roles, shops & audit oversight</p>
        </div>
      </header>

      <QuickActions role="admin" className="mb-8" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/dashboard/admin/employees" className="p-4 bg-surface rounded shadow-card hover:shadow-lg">
          Employees
        </Link>
        <Link href="/dashboard/admin/roles" className="p-4 bg-surface rounded shadow-card hover:shadow-lg">
          Roles
        </Link>
        <Link href="/dashboard/admin/shops" className="p-4 bg-surface rounded shadow-card hover:shadow-lg">
          Shops
        </Link>
        <Link href="/dashboard/admin/audit" className="p-4 bg-surface rounded shadow-card hover:shadow-lg">
          Audit Logs
        </Link>
      </div>
    </div>
  );
}
