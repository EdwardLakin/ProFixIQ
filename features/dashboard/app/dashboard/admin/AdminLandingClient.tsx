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
  openPayrollPeriods: number;
  payrollBlockingExceptions: number;
  payrollWarningExceptions: number;
  onboardingMissingWorkforce: number;
};

const CANONICAL_ADMIN_ROUTES = [
  {
    href: "/dashboard/admin/people",
    label: "People & Staff",
    description: "Canonical person records for identity/access, workforce profile, certifications, and payroll posture.",
    nextStep: "Open person workspace and manage sections",
  },
  {
    href: "/dashboard/admin/people?view=workforce",
    label: "Workforce Readiness View",
    description: "Filtered workforce posture view sourced from canonical People records.",
    nextStep: "Close onboarding/certification gaps",
  },
  {
    href: "/dashboard/admin/shops",
    label: "Shop Oversight",
    description: "Tenant directory quality, contact posture, and plan status.",
    nextStep: "Review shops with incomplete operations profile",
  },
  {
    href: "/dashboard/admin/payroll-time",
    label: "Payroll Time",
    description: "Pay-period review, exception triage, approval lock, and export snapshots.",
    nextStep: "Resolve blocking exceptions before approval",
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

      const [
        usersCount,
        employeesCount,
        shopsCount,
        audit24hCount,
        incompleteShops,
        openPeriods,
        blockingExceptions,
        warningExceptions,
        onboardingMissing,
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).not("role", "is", null),
        supabase.from("shops").select("id", { count: "exact", head: true }),
        supabase.from("audit_logs").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
        supabase
          .from("shops")
          .select("id", { count: "exact", head: true })
          .or("email.is.null,phone_number.is.null,timezone.is.null"),
        supabase
          .from("payroll_pay_periods")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "draft"]),
        supabase
          .from("payroll_time_exceptions")
          .select("id", { count: "exact", head: true })
          .eq("resolved", false)
          .eq("severity", "blocking"),
        supabase
          .from("payroll_time_exceptions")
          .select("id", { count: "exact", head: true })
          .eq("resolved", false)
          .eq("severity", "warning"),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .not("role", "is", null)
          .eq("completed_onboarding", false),
      ]);

      const failed = [
        usersCount,
        employeesCount,
        shopsCount,
        audit24hCount,
        incompleteShops,
        openPeriods,
        blockingExceptions,
        warningExceptions,
        onboardingMissing,
      ].find((r) => r.error);
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
        openPayrollPeriods: openPeriods.count ?? 0,
        payrollBlockingExceptions: blockingExceptions.count ?? 0,
        payrollWarningExceptions: warningExceptions.count ?? 0,
        onboardingMissingWorkforce: onboardingMissing.count ?? 0,
      });
    })();
  }, [supabase]);

  return (
    <>
      <AdminPageHeader
        eyebrow="Admin Control Surface"
        title="Administration"
        subtitle="Use this page to triage governance work, then move directly into People, payroll, shops, or audit actions."
      />

      <AdminPanel>
        <AdminPanelTitle title="Immediate Attention" description="Live snapshot from governance, workforce, and payroll-time datasets." />
        {error ? <p className="px-4 py-3 text-xs text-red-300">Failed to load summary: {error}</p> : null}
        {!summary ? (
          <AdminEmptyState title="Loading governance summary" body="Collecting counts from canonical admin surfaces." />
        ) : (
          <AdminStatGrid>
            <AdminStatCard label="People" value={summary.userCount} hint="Canonical shop-scoped person records." />
            <AdminStatCard label="Workforce profiles" value={summary.employeeCount} hint="People with assigned workforce posture." />
            <AdminStatCard label="Shops" value={summary.shopCount} hint="Tenant records in oversight scope." />
            <AdminStatCard label="Audit (24h)" value={summary.audit24hCount} hint="Privileged events in last day." />
            <AdminStatCard label="Open payroll periods" value={summary.openPayrollPeriods} hint="Open or draft periods needing reviewer attention." />
            <AdminStatCard label="Payroll blocking exceptions" value={summary.payrollBlockingExceptions} hint="Must be cleared before approval lock." />
            <AdminStatCard label="Payroll warnings" value={summary.payrollWarningExceptions} hint="Non-blocking anomalies to review." />
            <AdminStatCard label="Workforce missing onboarding" value={summary.onboardingMissingWorkforce} hint="Workforce readiness follow-up." />
          </AdminStatGrid>
        )}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Canonical Governance Workflows"
          description="Canonical route system for governance, workforce oversight, and payroll-time readiness."
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
          title="Priority Task Lanes"
          description="Recommended operating sequence for daily admin review."
        />
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-neutral-400">Governance</p>
            <p className="mt-2 text-sm font-medium text-white">People → Audit</p>
            <p className="mt-2 text-xs text-neutral-400">Validate account changes, then inspect privileged actions for anomalies.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-neutral-400">Workforce</p>
            <p className="mt-2 text-sm font-medium text-white">People → Payroll Time</p>
            <p className="mt-2 text-xs text-neutral-400">Close onboarding/certification gaps, then review payroll exceptions.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-neutral-400">Tenant quality</p>
            <p className="mt-2 text-sm font-medium text-white">Shops → People</p>
            <p className="mt-2 text-xs text-neutral-400">Resolve shop metadata gaps and verify ownership/account coverage.</p>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Governance Guidance"
          description="Use canonical pages for task completion and auditable operational decisions."
        />
        <div className="space-y-2 p-4 text-sm text-neutral-300">
          <p>• Use People for account-level edits and role governance actions.</p>
          <p>• Use Workforce Readiness View for workforce profile completeness, onboarding posture, and payroll readiness context.</p>
          <p>• Use Payroll Time for pay-period review, exception resolution, period approval, and export snapshots.</p>
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
