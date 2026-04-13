"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminPanelTitle,
  AdminStatCard,
  AdminStatGrid,
} from "@/features/dashboard/app/dashboard/admin/AdminSurface";

type AdminSummary = {
  userCount: number;
  employeeCount: number;
  shopCount: number;
  audit24hCount: number;
  incompleteShopCount: number;
};

const CANONICAL_ADMIN_ROUTES = [
  {
    href: "/dashboard/admin/users",
    label: "User Governance",
    description: "Identity records, role updates, and account-level controls.",
    nextStep: "Review roles and profile edits",
  },
  {
    href: "/dashboard/admin/employees",
    label: "Employees",
    description: "Workforce profile coverage and activity posture by role.",
    nextStep: "Find missing profile and onboarding data",
  },
  {
    href: "/dashboard/admin/shops",
    label: "Shop Oversight",
    description: "Tenant directory quality, contact posture, and plan status.",
    nextStep: "Review shops with incomplete operations profile",
  },
  {
    href: "/dashboard/admin/audit",
    label: "Audit",
    description: "Recent privileged actions and governance event timeline.",
    nextStep: "Scan for high-impact actions in the latest 24 hours",
  },
] as const;

export default function AdminLandingClient() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      const [usersCount, employeesCount, shopsCount, audit24hCount, incompleteShops] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).not("role", "is", null),
        supabase.from("shops").select("id", { count: "exact", head: true }),
        supabase.from("audit_logs").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
        supabase
          .from("shops")
          .select("id", { count: "exact", head: true })
          .or("email.is.null,phone_number.is.null,timezone.is.null"),
      ]);

      const failed = [usersCount, employeesCount, shopsCount, audit24hCount, incompleteShops].find((r) => r.error);
      if (failed?.error) {
        setError(failed.error.message);
        setSummary(null);
        return;
      }

      setSummary({
        userCount: usersCount.count ?? 0,
        employeeCount: employeesCount.count ?? 0,
        shopCount: shopsCount.count ?? 0,
        audit24hCount: audit24hCount.count ?? 0,
        incompleteShopCount: incompleteShops.count ?? 0,
      });
    })();
  }, [supabase]);

  return (
    <>
      <AdminPageHeader
        eyebrow="Admin Control Surface"
        title="Administration"
        subtitle="Use this page to triage governance work, then move directly into users, employees, shops, or audit actions."
      />

      <AdminPanel>
        <AdminPanelTitle
          title="Immediate Attention"
          description="Live snapshot from current admin datasets."
        />
        {error ? <p className="px-4 py-3 text-xs text-red-300">Failed to load summary: {error}</p> : null}
        {!summary ? (
          <AdminEmptyState title="Loading governance summary" body="Collecting counts from canonical admin surfaces." />
        ) : (
          <AdminStatGrid>
            <AdminStatCard label="Users" value={summary.userCount} hint="Identity records in profiles." />
            <AdminStatCard label="Employees" value={summary.employeeCount} hint="Profiles with assigned roles." />
            <AdminStatCard label="Shops" value={summary.shopCount} hint="Tenant records in oversight scope." />
            <AdminStatCard label="Audit (24h)" value={summary.audit24hCount} hint="Privileged events in last day." />
          </AdminStatGrid>
        )}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Canonical Governance Workflows"
          description="Each route represents a concrete admin task area with a clear next action."
        />

        <div className="grid gap-3 p-4 md:grid-cols-2">
          {CANONICAL_ADMIN_ROUTES.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className="rounded-xl border border-white/10 bg-black/25 p-4 transition hover:border-orange-400/70 hover:bg-black/40"
            >
              <p className="text-sm font-semibold text-white">{route.label}</p>
              <p className="mt-2 text-xs text-neutral-400">{route.description}</p>
              <p className="mt-3 text-xs font-medium text-orange-300">Next: {route.nextStep}</p>
            </Link>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Governance Guidance"
          description="Use canonical pages for task completion and auditable operational decisions."
        />
        <div className="space-y-2 p-4 text-sm text-neutral-300">
          <p>• Use Users for account-level edits and role governance actions.</p>
          <p>• Use Employees for workforce profile completeness and activity posture.</p>
          <p>• Use Shops to identify incomplete tenant records before operational impact.</p>
          <p>• Use Audit to validate sensitive changes and investigate anomalies quickly.</p>
          {summary ? (
            <p className="pt-1 text-xs text-neutral-400">
              Shops currently needing baseline profile follow-up (email/phone/timezone missing): {summary.incompleteShopCount}
            </p>
          ) : null}
        </div>
      </AdminPanel>
    </>
  );
}
