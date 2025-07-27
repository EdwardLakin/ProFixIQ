// app/dashboard/owner/page.tsx

'use client';

import Link from 'next/link';

export default function OwnerDashboardPage() {
  return (
    <div className="p-6 space-y-8">
      <h1 className="text-3xl font-bold text-orange-400">Owner Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {/* Work Orders */}
        <Link href="/work-orders">
          <div className="bg-neutral-800 hover:bg-orange-600 p-4 rounded-md shadow transition cursor-pointer">
            <h2 className="text-lg font-semibold text-white">Work Orders</h2>
            <p className="text-sm text-white/70">Create, queue, review quotes</p>
          </div>
        </Link>

        {/* Add more sections below for other dashboards */}
        <Link href="/parts">
          <div className="bg-neutral-800 hover:bg-orange-600 p-4 rounded-md shadow transition cursor-pointer">
            <h2 className="text-lg font-semibold text-white">Parts</h2>
            <p className="text-sm text-white/70">Manage requests, inventory, suppliers</p>
          </div>
        </Link>

        <Link href="/inspections">
          <div className="bg-neutral-800 hover:bg-orange-600 p-4 rounded-md shadow transition cursor-pointer">
            <h2 className="text-lg font-semibold text-white">Inspections</h2>
            <p className="text-sm text-white/70">View and assign inspections</p>
          </div>
        </Link>

        <Link href="/dashboard/owner/create-user">
          <div className="bg-neutral-800 hover:bg-orange-600 p-4 rounded-md shadow transition cursor-pointer">
            <h2 className="text-lg font-semibold text-white">User Management</h2>
            <p className="text-sm text-white/70">Create, edit, delete users</p>
          </div>
        </Link>

        <Link href="/dashboard/owner/reports">
          <div className="bg-neutral-800 hover:bg-orange-600 p-4 rounded-md shadow transition cursor-pointer">
            <h2 className="text-lg font-semibold text-white">Reports</h2>
            <p className="text-sm text-white/70">View shop reports and stats</p>
          </div>
        </Link>

        <Link href="/dashboard/owner/settings">
          <div className="bg-neutral-800 hover:bg-orange-600 p-4 rounded-md shadow transition cursor-pointer">
            <h2 className="text-lg font-semibold text-white">Settings</h2>
            <p className="text-sm text-white/70">Manage shop settings</p>
          </div>
        </Link>
      </div>
    </div>
  );
}