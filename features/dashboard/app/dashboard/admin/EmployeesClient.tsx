"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
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

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type EmpRow = Pick<
  Profile,
  "id" | "full_name" | "email" | "phone" | "role" | "completed_onboarding" | "last_active_at" | "shop_id"
>;

export default function AdminEmployeesClient() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [rows, setRows] = useState<EmpRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [payrollExceptionMap, setPayrollExceptionMap] = useState<Record<string, { blocking: number; warning: number }>>({});

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, role, completed_onboarding, last_active_at, shop_id")
        .not("role", "is", null)
        .order("full_name", { ascending: true })
        .returns<EmpRow[]>();

      if (error) setErr(error.message);
      setRows(data ?? []);

      const { data: exceptionRows } = await supabase
        .from("payroll_time_exceptions")
        .select("user_id, severity, resolved")
        .eq("resolved", false)
        .returns<Array<{ user_id: string; severity: "blocking" | "warning"; resolved: boolean }>>();

      if (exceptionRows) {
        const next: Record<string, { blocking: number; warning: number }> = {};
        for (const row of exceptionRows) {
          const key = row.user_id;
          if (!next[key]) next[key] = { blocking: 0, warning: 0 };
          if (row.severity === "blocking") next[key].blocking += 1;
          if (row.severity === "warning") next[key].warning += 1;
        }
        setPayrollExceptionMap(next);
      }
    })();
  }, [supabase]);

  const roleOptions = useMemo(() => {
    const set = new Set((rows ?? []).map((row) => row.role).filter(Boolean) as string[]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      const matchesRole = roleFilter === "all" ? true : row.role === roleFilter;
      const matchesSearch =
        !query ||
        row.full_name?.toLowerCase().includes(query) ||
        row.email?.toLowerCase().includes(query) ||
        row.phone?.toLowerCase().includes(query);
      return Boolean(matchesRole && matchesSearch);
    });
  }, [roleFilter, rows, search]);

  const summary = useMemo(() => {
    const allRows = rows ?? [];
    const profileSetupMissing = allRows.filter((row) => !row.completed_onboarding).length;
    const contactGaps = allRows.filter((row) => !row.email || !row.phone).length;
    const recentlyActive = allRows.filter((row) => {
      if (!row.last_active_at) return false;
      const diff = Date.now() - new Date(row.last_active_at).getTime();
      return diff <= 1000 * 60 * 60 * 24 * 30;
    }).length;
    const payrollFollowUp = allRows.filter((row) => {
      const profile = payrollExceptionMap[row.id];
      return (profile?.blocking ?? 0) > 0 || (profile?.warning ?? 0) > 0;
    }).length;

    return {
      total: allRows.length,
      profileSetupMissing,
      contactGaps,
      recentlyActive,
      payrollFollowUp,
    };
  }, [payrollExceptionMap, rows]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Workforce Directory"
        title="Employees"
        subtitle="Employees focuses on workforce completeness and activity posture, distinct from account-level governance actions in Users."
      />

      <AdminPanel>
        <AdminPanelTitle
          title="Workforce Oversight Summary"
          description="Use these signals to find profile quality gaps before they impact operations."
        />
        <AdminStatGrid>
          <AdminStatCard label="Employees" value={summary.total} />
          <AdminStatCard label="Profile setup incomplete" value={summary.profileSetupMissing} />
          <AdminStatCard label="Contact gaps" value={summary.contactGaps} hint="Missing email or phone" />
          <AdminStatCard label="Active in 30d" value={summary.recentlyActive} />
          <AdminStatCard label="Payroll follow-up" value={summary.payrollFollowUp} hint="Employees with open payroll exceptions" />
        </AdminStatGrid>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Filter Workforce"
          description="Search by name/contact and filter by role to target specific follow-up."
        />

        <AdminToolbar>
          <AdminField label="Search" className="flex-1">
            <input
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-orange-400/70"
              placeholder="Search name, email, or phone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </AdminField>
          <AdminField label="Role" className="w-full md:w-52">
            <select
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:border-orange-400/70"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              <option value="all">All roles</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </AdminField>
        </AdminToolbar>

        {err ? <p className="px-4 pb-3 text-xs text-red-300">Profile query failed: {err}</p> : null}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Employee Records"
          description="Directory posture across role, profile setup, contact completeness, activity recency, and payroll exception linkage."
          action={
            <Link href="/dashboard/workforce/payroll-review" className="text-xs font-medium text-[color:var(--theme-accent-text)]">
              Open Payroll Time →
            </Link>
          }
        />

        {!rows ? (
          <AdminEmptyState title="Loading employees" body="Pulling profile records." />
        ) : filteredRows.length === 0 ? (
          <AdminEmptyState title="No employees found" body="Adjust filters or confirm workforce profiles exist." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[color:var(--theme-surface-inset)] text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Employee</th>
                  <th className="px-4 py-2.5 text-left">Role</th>
                  <th className="px-4 py-2.5 text-left">Onboarding</th>
                  <th className="px-4 py-2.5 text-left">Contact</th>
                  <th className="px-4 py-2.5 text-left">Last active</th>
                  <th className="px-4 py-2.5 text-left">Payroll posture</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--theme-border-soft)]">
                {filteredRows.map((r) => (
                  <tr key={r.id} className="text-[color:var(--theme-text-primary)]">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-[color:var(--theme-text-primary)]">{r.full_name ?? "—"}</p>
                      <p className="text-xs text-[color:var(--theme-text-muted)]">{r.email ?? "No email"}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <AdminBadge>{r.role ?? "—"}</AdminBadge>
                    </td>
                    <td className="px-4 py-2.5">
                      <AdminBadge>{r.completed_onboarding ? "Complete" : "Needs follow-up"}</AdminBadge>
                    </td>
                    <td className="px-4 py-2.5 text-[color:var(--theme-text-secondary)]">{r.phone ?? "Missing phone"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[color:var(--theme-text-secondary)]">
                      {r.last_active_at ? new Date(r.last_active_at).toLocaleDateString() : "Never recorded"}
                    </td>
                    <td className="px-4 py-2.5">
                      {payrollExceptionMap[r.id]?.blocking ? (
                        <AdminBadge>{payrollExceptionMap[r.id].blocking} blocking</AdminBadge>
                      ) : payrollExceptionMap[r.id]?.warning ? (
                        <AdminBadge>{payrollExceptionMap[r.id].warning} warning</AdminBadge>
                      ) : (
                        <span className="text-xs text-[color:var(--theme-text-muted)]">No open payroll exceptions</span>
                      )}
                    </td>
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
