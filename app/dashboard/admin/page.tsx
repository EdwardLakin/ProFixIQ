import Link from "next/link";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

const CANONICAL_ADMIN_ROUTES = [
  { href: "/dashboard/admin/audit", label: "Audit" },
  { href: "/dashboard/admin/users", label: "User Governance" },
  { href: "/dashboard/admin/shops", label: "Shop Oversight" },
] as const;

export default async function AdminLandingPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="mt-2 text-sm text-neutral-300">Platform governance and oversight surfaces.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CANONICAL_ADMIN_ROUTES.map((route) => (
          <Link
            key={route.href}
            href={route.href}
            className="rounded-lg border border-white/10 bg-black/30 p-4 hover:border-orange-400/70"
          >
            {route.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
