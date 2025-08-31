"use client";

import Link from "next/link";

export default function AdminDashboardClient() {
  const tiles = [
    { href: "/dashboard/admin/users", title: "Users", subtitle: "View & manage users" },
    { href: "/dashboard/admin/create-user", title: "Create User", subtitle: "Invite a new user" },
    { href: "/dashboard/admin/roles", title: "Roles", subtitle: "Define permissions" },
    { href: "/dashboard/admin/teams", title: "Teams", subtitle: "Group users by team" },
    { href: "/dashboard/admin/shops", title: "Shops", subtitle: "View all shops" },
    { href: "/dashboard/admin/audits", title: "Audit Logs", subtitle: "Track actions" },
  ];

  return (
    <div className="min-h-screen p-6 text-white">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-orange-400">Admin</h1>
        <p className="text-sm text-white/70">HR & org-wide administration</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link href={t.href} key={t.href} className="block">
            <div className="cursor-pointer rounded-lg border border-white/10 bg-neutral-900 p-5 transition hover:-translate-y-0.5 hover:border-orange-500 hover:shadow-lg hover:shadow-orange-500/10 active:translate-y-0">
              <h2 className="text-lg font-semibold text-white">{t.title}</h2>
              <p className="mt-1 text-sm text-white/70">{t.subtitle}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
