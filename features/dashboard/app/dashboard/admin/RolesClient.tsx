"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function AdminRolesClient() {
  const supabase = createClientComponentClient<Database>();
  const [rows, setRows] = React.useState<{ id: string; full_name: string | null; role: string | null }[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, role");
      if (error) setErr(error.message);
      setRows((data ?? []).map(d => ({ id: d.id, full_name: (d as any).full_name ?? null, role: (d as any).role ?? null })));
    })();
  }, [supabase]);

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-semibold mb-4">Roles</h1>
      {err && <p className="text-red-400 mb-3">profiles table not found or error: {err}</p>}
      {!rows ? (
        <p className="opacity-70">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="opacity-70">No users to show.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(r => (
            <li key={r.id} className="p-3 rounded bg-neutral-900/50 border border-neutral-800">
              <div className="font-medium">{r.full_name ?? r.id}</div>
              <div className="text-xs opacity-75">Role: {r.role ?? "—"}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
