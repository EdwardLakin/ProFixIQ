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

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type EmpRow = Pick<Profile, "id" | "full_name" | "email" | "role">;

export default function AdminEmployeesClient() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const [rows, setRows] = useState<EmpRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .order("full_name", { ascending: true })
        .returns<EmpRow[]>();

      if (error) setErr(error.message);
      setRows(data ?? []);
    })();
  }, [supabase]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Workforce Directory"
        title="Employees"
        subtitle="View employee profile coverage and role distribution for administrative oversight."
      />

      <AdminPanel>
        <AdminPanelTitle title="Employee Records" description="Core identity and role data sourced from profile records." />

        {err ? <p className="px-4 py-3 text-xs text-red-300">Profile query failed: {err}</p> : null}

        {!rows ? (
          <AdminEmptyState title="Loading employees" body="Pulling profile records." />
        ) : rows.length === 0 ? (
          <AdminEmptyState title="No employees found" body="No profile rows are currently available." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.12em] text-neutral-400">
                <tr>
                  <th className="px-4 py-2.5 text-left">Name</th>
                  <th className="px-4 py-2.5 text-left">Email</th>
                  <th className="px-4 py-2.5 text-left">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((r) => (
                  <tr key={r.id} className="text-neutral-200">
                    <td className="px-4 py-2.5 font-medium text-neutral-100">{r.full_name ?? "—"}</td>
                    <td className="px-4 py-2.5">{r.email ?? "—"}</td>
                    <td className="px-4 py-2.5">{r.role ?? "—"}</td>
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
