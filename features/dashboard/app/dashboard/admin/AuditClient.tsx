"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database, Json } from "@shared/types/types/supabase";
import {
  AdminBadge,
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
  AdminPanel,
  AdminPanelTitle,
  AdminStatCard,
  AdminStatGrid,
  AdminToolbar,
} from "@/features/dashboard/app/dashboard/admin/AdminSurface";

type AuditRow = Pick<
  Database["public"]["Tables"]["audit_logs"]["Row"],
  "id" | "created_at" | "actor_id" | "action" | "target" | "metadata"
>;

function classifySeverity(action: string | null): "high" | "normal" {
  const value = (action ?? "").toLowerCase();
  return value.includes("delete") || value.includes("remove") || value.includes("role") ? "high" : "normal";
}

function stringifyMetadata(metadata: Json | null): string {
  if (!metadata) return "";
  try {
    return JSON.stringify(metadata);
  } catch {
    return "";
  }
}

export default function AdminAuditClient() {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"all" | "high" | "normal">("all");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, created_at, actor_id, action, target, metadata")
        .order("created_at", { ascending: false })
        .limit(150);

      if (error) setErr(error.message);
      setRows((data as AuditRow[]) ?? []);
    })();
  }, [supabase]);

  const filteredRows = useMemo(() => {
    const actionQuery = actionFilter.trim().toLowerCase();
    const actorQuery = actorFilter.trim().toLowerCase();

    return (rows ?? []).filter((row) => {
      const severity = classifySeverity(row.action);
      const matchesSeverity = severityFilter === "all" ? true : severity === severityFilter;
      const matchesAction = !actionQuery || (row.action ?? "").toLowerCase().includes(actionQuery);
      const matchesActor = !actorQuery || (row.actor_id ?? "").toLowerCase().includes(actorQuery);
      return Boolean(matchesSeverity && matchesAction && matchesActor);
    });
  }, [actionFilter, actorFilter, rows, severityFilter]);

  const summary = useMemo(() => {
    const allRows = rows ?? [];
    const highSeverity = allRows.filter((row) => classifySeverity(row.action) === "high").length;
    const last24h = allRows.filter((row) => {
      const diff = Date.now() - new Date(row.created_at).getTime();
      return diff <= 1000 * 60 * 60 * 24;
    }).length;
    return {
      total: allRows.length,
      highSeverity,
      last24h,
      visible: filteredRows.length,
    };
  }, [filteredRows.length, rows]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        eyebrow="Workforce trail"
        title="Activity"
        subtitle="Review sensitive people, time, payroll, and access changes with enough context to follow up."
      />

      <AdminPanel>
        <AdminPanelTitle title="Audit Review Summary" description="Use these counts to prioritize what needs review first." />
        <AdminStatGrid>
          <AdminStatCard label="Recent events" value={summary.total} hint="Current timeline window" />
          <AdminStatCard label="High-severity" value={summary.highSeverity} hint="Delete/remove/role actions" />
          <AdminStatCard label="Last 24 hours" value={summary.last24h} />
          <AdminStatCard label="Visible rows" value={summary.visible} />
        </AdminStatGrid>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Follow-up Paths"
          description="Move from suspicious events into the right operational surface without losing context."
        />
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <Link href="/dashboard/workforce/people" className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 transition hover:border-[color:var(--brand-accent)]">
            <p className="text-sm font-medium text-[color:var(--theme-text-primary)]">Identity follow-up</p>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">Use People when actions involve person identity, workforce status, or credential readiness.</p>
          </Link>
          <Link href="/dashboard/admin/shops" className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 transition hover:border-orange-400/70">
            <p className="text-sm font-medium text-[color:var(--theme-text-primary)]">Tenant follow-up</p>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">Use Shops when actions indicate shop ownership or profile risk.</p>
          </Link>
          <Link href="/dashboard/workforce/payroll-review" className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 transition hover:border-[color:var(--brand-accent)]">
            <p className="text-sm font-medium text-[color:var(--theme-text-primary)]">Payroll follow-up</p>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">Use Payroll Time when edits affect employee time review or approvals.</p>
          </Link>
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Filter Timeline"
          description="Narrow by action, actor, and severity to investigate events with less noise."
        />
        <AdminToolbar>
          <AdminField label="Action contains" className="flex-1">
            <input
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-orange-400/70"
              placeholder="e.g. user.update, shop.delete"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
            />
          </AdminField>
          <AdminField label="Actor ID contains" className="flex-1">
            <input
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-orange-400/70"
              placeholder="Filter by actor id"
              value={actorFilter}
              onChange={(event) => setActorFilter(event.target.value)}
            />
          </AdminField>
          <AdminField label="Severity" className="w-full md:w-44">
            <select
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:border-orange-400/70"
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value as "all" | "high" | "normal")}
            >
              <option value="all">All</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </select>
          </AdminField>
        </AdminToolbar>

        {err ? <p className="px-4 pb-3 text-xs text-[color:var(--theme-danger-text)]">Audit query failed: {err}</p> : null}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Recent Audit Events"
          description="Review time, actor, and target together so follow-up actions are immediately clear."
        />

        {!rows ? (
          <AdminEmptyState title="Loading audit entries" body="Gathering latest governance events." />
        ) : filteredRows.length === 0 ? (
          <AdminEmptyState title="No audit entries" body="No entries match current filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[color:var(--theme-surface-inset)] text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Time</th>
                  <th className="px-4 py-2.5 text-left">Action</th>
                  <th className="px-4 py-2.5 text-left">Actor</th>
                  <th className="px-4 py-2.5 text-left">Target</th>
                  <th className="px-4 py-2.5 text-left">Context</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--theme-border-soft)]">
                {filteredRows.map((r) => {
                  const severity = classifySeverity(r.action);
                  const metadataPreview = stringifyMetadata(r.metadata);

                  return (
                    <tr key={r.id} className="text-[color:var(--theme-text-primary)]">
                      <td className="whitespace-nowrap px-4 py-2.5 text-[color:var(--theme-text-secondary)]">
                        {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[color:var(--theme-text-primary)]">
                        <div className="flex items-center gap-2">
                          <span>{r.action ?? "—"}</span>
                          <AdminBadge>{severity}</AdminBadge>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">{r.actor_id ?? "—"}</td>
                      <td className="px-4 py-2.5">{r.target ?? "—"}</td>
                      <td className="max-w-sm px-4 py-2.5 text-xs text-[color:var(--theme-text-secondary)]">
                        {metadataPreview ? metadataPreview.slice(0, 140) : "No metadata"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
