"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
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
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const [rows, setRows] = useState<EmpRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

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
    const onboardingMissing = allRows.filter((row) => !row.completed_onboarding).length;
    const contactGaps = allRows.filter((row) => !row.email || !row.phone).length;
    const recentlyActive = allRows.filter((row) => {
      if (!row.last_active_at) return false;
      const diff = Date.now() - new Date(row.last_active_at).getTime();
      return diff <= 1000 * 60 * 60 * 24 * 30;
    }).length;

    return {
      total: allRows.length,
      onboardingMissing,
      contactGaps,
      recentlyActive,
    };
  }, [rows]);

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
          <AdminStatCard label="Onboarding incomplete" value={summary.onboardingMissing} />
          <AdminStatCard label="Contact gaps" value={summary.contactGaps} hint="Missing email or phone" />
          <AdminStatCard label="Active in 30d" value={summary.recentlyActive} />
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
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-orange-400/70"
              placeholder="Search name, email, or phone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </AdminField>
          <AdminField label="Role" className="w-full md:w-52">
            <select
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-orange-400/70"
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
          description="Directory posture across role, onboarding, contact completeness, and activity recency."
        />

        {!rows ? (
          <AdminEmptyState title="Loading employees" body="Pulling profile records." />
        ) : filteredRows.length === 0 ? (
          <AdminEmptyState title="No employees found" body="Adjust filters or confirm workforce profiles exist." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.12em] text-neutral-400">
                <tr>
                  <th className="px-4 py-2.5 text-left">Employee</th>
                  <th className="px-4 py-2.5 text-left">Role</th>
                  <th className="px-4 py-2.5 text-left">Onboarding</th>
                  <th className="px-4 py-2.5 text-left">Contact</th>
                  <th className="px-4 py-2.5 text-left">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredRows.map((r) => (
                  <tr key={r.id} className="text-neutral-200">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-neutral-100">{r.full_name ?? "—"}</p>
                      <p className="text-xs text-neutral-500">{r.email ?? "No email"}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <AdminBadge>{r.role ?? "—"}</AdminBadge>
                    </td>
                    <td className="px-4 py-2.5">
                      <AdminBadge>{r.completed_onboarding ? "Complete" : "Needs follow-up"}</AdminBadge>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-300">{r.phone ?? "Missing phone"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-neutral-300">
                      {r.last_active_at ? new Date(r.last_active_at).toLocaleDateString() : "Never recorded"}
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
