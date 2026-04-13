"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPageShell,
  AdminPanel,
  AdminPanelTitle,
} from "@/features/dashboard/app/dashboard/admin/AdminSurface";

type AuditRow = Pick<
  Database["public"]["Tables"]["audit_logs"]["Row"],
  "id" | "created_at" | "actor_id" | "action" | "target"
>;

export default function AdminAuditClient() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, created_at, actor_id, action, target")
        .order("created_at", { ascending: false })
        .limit(75);

      if (error) setErr(error.message);
      setRows((data as AuditRow[]) ?? []);
    })();
  }, [supabase]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Governance Trail"
        title="Audit"
        subtitle="Review recent privileged actions and impacted targets in a single timeline surface."
      />

      <AdminPanel>
        <AdminPanelTitle
          title="Recent Audit Events"
          description="Most recent entries first. Use this surface for governance validation and incident review."
        />

        {err ? <p className="px-4 py-3 text-xs text-red-300">Audit query failed: {err}</p> : null}

        {!rows ? (
          <AdminEmptyState title="Loading audit entries" body="Gathering latest governance events." />
        ) : rows.length === 0 ? (
          <AdminEmptyState title="No audit entries" body="No audit records were returned for this environment." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.12em] text-neutral-400">
                <tr>
                  <th className="px-4 py-2.5 text-left">Time</th>
                  <th className="px-4 py-2.5 text-left">Actor</th>
                  <th className="px-4 py-2.5 text-left">Action</th>
                  <th className="px-4 py-2.5 text-left">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((r) => (
                  <tr key={r.id} className="text-neutral-200">
                    <td className="whitespace-nowrap px-4 py-2.5 text-neutral-300">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2.5">{r.actor_id ?? "—"}</td>
                    <td className="px-4 py-2.5 font-medium text-neutral-100">{r.action ?? "—"}</td>
                    <td className="px-4 py-2.5">{r.target ?? "—"}</td>
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
