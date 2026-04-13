import Link from "next/link";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPageShell,
  AdminPanel,
  AdminPanelTitle,
} from "@/features/dashboard/app/dashboard/admin/AdminSurface";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

const CANONICAL_ADMIN_ROUTES = [
  {
    href: "/dashboard/admin/users",
    label: "User Governance",
    description: "Manage account identity, role posture, and privileged profile edits.",
  },
  {
    href: "/dashboard/admin/employees",
    label: "Employees",
    description: "Review employee directory posture, role spread, and profile coverage.",
  },
  {
    href: "/dashboard/admin/shops",
    label: "Shop Oversight",
    description: "Review tenant records and operational completeness across shops.",
  },
  {
    href: "/dashboard/admin/audit",
    label: "Audit",
    description: "Inspect sensitive administrative actions and timeline evidence.",
  },
] as const;

export default async function AdminLandingPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Admin Control Surface"
        title="Administration"
        subtitle="Canonical governance tools for identity, audit review, and multi-shop oversight."
      />

      <AdminPanel>
        <AdminPanelTitle
          title="Primary Surfaces"
          description="Use these destinations for controlled high-trust platform administration."
        />

        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          {CANONICAL_ADMIN_ROUTES.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className="rounded-xl border border-white/10 bg-black/25 p-4 transition hover:border-orange-400/70 hover:bg-black/40"
            >
              <p className="text-sm font-semibold text-white">{route.label}</p>
              <p className="mt-2 text-xs text-neutral-400">{route.description}</p>
            </Link>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Operational Expectation"
          description="Admin surfaces should be used for policy-safe governance work and oversight only."
        />
        <AdminEmptyState
          title="Phase 2 shell normalization is active"
          body="Remaining legacy routes are intentionally redirected or de-surfaced to protect canonical ownership boundaries."
        />
      </AdminPanel>
    </AdminPageShell>
  );
}
