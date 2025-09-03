// features/dashboard/app/dashboard/admin/EmployeesClient.tsx
"use client";

import React from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type EmpRow = Pick<Profile, "id" | "full_name" | "email" | "role">;

export default function AdminEmployeesClient() {
  const supabase = createClientComponentClient<Database>();
  const [rows, setRows] = React.useState<EmpRow[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .returns<EmpRow[]>();

      if (error) setErr(error.message);
      setRows(data ?? []);
    })();
  }, [supabase]);

  return (
    <div className="p-6 text-white">
      <h1 className="mb-4 text-2xl font-semibold">Employees</h1>

      {err && (
        <p className="mb-3 text-red-400">
          profiles table not found or error: {err}
        </p>
      )}

      {!rows ? (
        <p className="opacity-70">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="opacity-70">No employees found.</p>
      ) : (
        <div className="overflow-auto rounded border border-neutral-700">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-900/50">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2">{r.full_name ?? "—"}</td>
                  <td className="px-3 py-2">{r.email ?? "—"}</td>
                  <td className="px-3 py-2">{r.role ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}