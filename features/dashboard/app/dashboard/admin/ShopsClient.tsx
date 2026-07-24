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

type ShopRow = Pick<
  Database["public"]["Tables"]["shops"]["Row"],
  | "id"
  | "name"
  | "city"
  | "province"
  | "email"
  | "phone_number"
  | "timezone"
  | "plan"
  | "owner_id"
  | "created_at"
>;

function healthLabel(shop: ShopRow): "Complete" | "Needs profile" {
  return shop.email && shop.phone_number && shop.timezone ? "Complete" : "Needs profile";
}

export default function AdminShopsClient() {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [rows, setRows] = useState<ShopRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<"all" | "Complete" | "Needs profile">("all");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("id, name, city, province, email, phone_number, timezone, plan, owner_id, created_at")
        .order("name", { ascending: true })
        .limit(200);

      if (error) setErr(error.message);
      setRows((data as ShopRow[]) ?? []);
    })();
  }, [supabase]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      const matchesHealth = healthFilter === "all" ? true : healthLabel(row) === healthFilter;
      const matchesSearch =
        !query ||
        row.name?.toLowerCase().includes(query) ||
        row.city?.toLowerCase().includes(query) ||
        row.email?.toLowerCase().includes(query);
      return Boolean(matchesHealth && matchesSearch);
    });
  }, [healthFilter, rows, search]);

  const summary = useMemo(() => {
    const allRows = rows ?? [];
    const needsProfile = allRows.filter((row) => healthLabel(row) === "Needs profile").length;
    const withOwner = allRows.filter((row) => !!row.owner_id).length;

    return {
      total: allRows.length,
      needsProfile,
      withOwner,
      visible: filteredRows.length,
    };
  }, [filteredRows.length, rows]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Tenant Oversight"
        title="Shops"
        subtitle="Shops is the governance view for tenant identity completeness, ownership posture, and baseline operating metadata."
      />

      <AdminPanel>
        <AdminPanelTitle title="Shop Governance Summary" description="Highlights for fast oversight triage." />
        <AdminStatGrid>
          <AdminStatCard label="Shops" value={summary.total} />
          <AdminStatCard label="Needs profile follow-up" value={summary.needsProfile} hint="Missing email, phone, or timezone" />
          <AdminStatCard label="Has owner assigned" value={summary.withOwner} />
          <AdminStatCard label="Visible rows" value={summary.visible} />
        </AdminStatGrid>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Filter Shop Directory"
          description="Search key identity fields and narrow by profile health for practical follow-up."
        />
        <AdminToolbar>
          <AdminField label="Search" className="flex-1">
            <input
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-orange-400/70"
              placeholder="Search shop, city, or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </AdminField>
          <AdminField label="Health" className="w-full md:w-56">
            <select
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:border-orange-400/70"
              value={healthFilter}
              onChange={(event) => setHealthFilter(event.target.value as "all" | "Complete" | "Needs profile")}
            >
              <option value="all">All shops</option>
              <option value="Complete">Complete profile</option>
              <option value="Needs profile">Needs profile</option>
            </select>
          </AdminField>
        </AdminToolbar>

        {err ? <p className="px-4 pb-3 text-xs text-red-300">Shop query failed: {err}</p> : null}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Shop Directory"
          description="Review key metadata and governance posture before taking follow-up action."
          action={
            <Link href="/dashboard/workforce/people" className="text-xs font-medium text-[color:var(--theme-accent-text)]">
              Validate owner/staff posture →
            </Link>
          }
        />

        {!rows ? (
          <AdminEmptyState title="Loading shops" body="Reading tenant shop records." />
        ) : filteredRows.length === 0 ? (
          <AdminEmptyState title="No shops found" body="Adjust filters or confirm shop records are available." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[color:var(--theme-surface-inset)] text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Shop</th>
                  <th className="px-4 py-2.5 text-left">Location</th>
                  <th className="px-4 py-2.5 text-left">Contact</th>
                  <th className="px-4 py-2.5 text-left">Plan</th>
                  <th className="px-4 py-2.5 text-left">Owner</th>
                  <th className="px-4 py-2.5 text-left">Health</th>
                  <th className="px-4 py-2.5 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--theme-border-soft)]">
                {filteredRows.map((s) => (
                  <tr key={s.id} className="text-[color:var(--theme-text-primary)]">
                    <td className="px-4 py-2.5 font-medium text-[color:var(--theme-text-primary)]">{s.name ?? s.id}</td>
                    <td className="px-4 py-2.5">{[s.city, s.province].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-[color:var(--theme-text-secondary)]">
                      <p>{s.email ?? "No email"}</p>
                      <p>{s.phone_number ?? "No phone"}</p>
                    </td>
                    <td className="px-4 py-2.5">{s.plan ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <AdminBadge>{s.owner_id ? "Assigned" : "Missing owner"}</AdminBadge>
                    </td>
                    <td className="px-4 py-2.5">
                      <AdminBadge>{healthLabel(s)}</AdminBadge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[color:var(--theme-text-secondary)]">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
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
