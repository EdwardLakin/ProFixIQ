"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AdminBadge,
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
  AdminPageShell,
  AdminPanel,
  AdminPanelTitle,
  AdminStatCard,
  AdminStatGrid,
  AdminToolbar,
} from "@/features/dashboard/app/dashboard/admin/AdminSurface";

type PersonRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  completed_onboarding: boolean;
  last_active_at: string | null;
  workforce_role: string | null;
  employment_status: "active" | "inactive" | "on_leave" | null;
  payroll_blocking_exceptions: number;
  payroll_warning_exceptions: number;
  open_certifications: number;
  expiring_certifications: number;
};

export default function PeoplePageClient() {
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "on_leave">("all");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/people", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Failed to load people directory");
        setRows([]);
        return;
      }
      setRows((body?.people ?? []) as PersonRow[]);
    })();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      const matchesStatus = statusFilter === "all" ? true : (row.employment_status ?? "active") === statusFilter;
      const text = `${row.full_name ?? ""} ${row.email ?? ""} ${row.phone ?? ""} ${row.role ?? ""} ${row.workforce_role ?? ""}`.toLowerCase();
      return matchesStatus && (!q || text.includes(q));
    });
  }, [rows, search, statusFilter]);

  const summary = useMemo(() => {
    const source = rows ?? [];
    return {
      total: source.length,
      onboardingMissing: source.filter((row) => !row.completed_onboarding).length,
      payrollFollowUp: source.filter((row) => row.payroll_blocking_exceptions > 0 || row.payroll_warning_exceptions > 0).length,
      expiringCerts: source.filter((row) => row.expiring_certifications > 0).length,
      inactive: source.filter((row) => row.employment_status === "inactive").length,
    };
  }, [rows]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Canonical Staff System"
        title="People & Staff"
        subtitle="People is the canonical admin directory for identity governance, workforce posture, certifications/licensing readiness, and payroll-time follow-up."
      />

      <AdminPanel>
        <AdminPanelTitle
          title="What this page is for"
          description="Open a person record to manage account access, workforce profile, certifications, and payroll posture in one place."
        />
        <AdminStatGrid>
          <AdminStatCard label="People" value={summary.total} />
          <AdminStatCard label="Onboarding incomplete" value={summary.onboardingMissing} />
          <AdminStatCard label="Payroll follow-up" value={summary.payrollFollowUp} hint="Open payroll exceptions" />
          <AdminStatCard label="Expiring certs" value={summary.expiringCerts} hint="Within 30 days" />
          <AdminStatCard label="Inactive workforce" value={summary.inactive} />
        </AdminStatGrid>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Find people quickly"
          description="Search by person identity, role, workforce category, or contact details."
          action={
            <div className="flex items-center gap-3 text-xs">
              <Link href="/dashboard/admin/payroll-time" className="font-medium text-orange-300 hover:text-orange-200">Payroll Time →</Link>
              <Link href="/dashboard/admin/audit" className="font-medium text-orange-300 hover:text-orange-200">Audit →</Link>
            </div>
          }
        />
        <AdminToolbar>
          <AdminField label="Search" className="flex-1">
            <input
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-orange-400/70"
              placeholder="Name, email, phone, role, workforce role"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </AdminField>
          <AdminField label="Employment status" className="w-full md:w-56">
            <select
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-orange-400/70"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive" | "on_leave")}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On leave</option>
            </select>
          </AdminField>
        </AdminToolbar>
        {error ? <p className="px-4 pb-4 text-xs text-red-300">{error}</p> : null}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="People directory" description="Click a row to open the person workspace." />
        {!rows ? (
          <AdminEmptyState title="Loading people" body="Collecting identity, workforce, certification, and payroll posture." />
        ) : filteredRows.length === 0 ? (
          <AdminEmptyState title="No people matched" body="Adjust filters or create people records first." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.12em] text-neutral-400">
                <tr>
                  <th className="px-4 py-2.5 text-left">Person</th>
                  <th className="px-4 py-2.5 text-left">Identity role</th>
                  <th className="px-4 py-2.5 text-left">Workforce</th>
                  <th className="px-4 py-2.5 text-left">Onboarding</th>
                  <th className="px-4 py-2.5 text-left">Certifications</th>
                  <th className="px-4 py-2.5 text-left">Payroll posture</th>
                  <th className="px-4 py-2.5 text-left">Recent activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer text-neutral-200 transition hover:bg-white/5"
                    onClick={() => {
                      window.location.href = `/dashboard/admin/people/${row.id}`;
                    }}
                  >
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-neutral-100">{row.full_name ?? "Unnamed"}</p>
                      <p className="text-xs text-neutral-500">{row.email ?? "No email"}</p>
                    </td>
                    <td className="px-4 py-2.5"><AdminBadge>{row.role ?? "Unassigned"}</AdminBadge></td>
                    <td className="px-4 py-2.5">
                      <p>{row.workforce_role ?? "General"}</p>
                      <p className="text-xs text-neutral-500">{row.employment_status ?? "active"}</p>
                    </td>
                    <td className="px-4 py-2.5"><AdminBadge>{row.completed_onboarding ? "Complete" : "Needs follow-up"}</AdminBadge></td>
                    <td className="px-4 py-2.5 text-xs">
                      {row.open_certifications} active
                      {row.expiring_certifications > 0 ? ` • ${row.expiring_certifications} expiring` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {row.payroll_blocking_exceptions > 0 ? `${row.payroll_blocking_exceptions} blocking` : row.payroll_warning_exceptions > 0 ? `${row.payroll_warning_exceptions} warning` : "Clean"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-neutral-400">{row.last_active_at ? new Date(row.last_active_at).toLocaleDateString() : "No recent activity"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>
    </AdminPageShell>
  );
}
