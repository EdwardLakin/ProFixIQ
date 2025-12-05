"use client"



import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function AdminAuditClient() {
  const supabase = createClientComponentClient<Database>();
  const [rows, setRows] = React.useState<any[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) setErr(error.message);
      setRows(data ?? []);
    })();
  }, [supabase]);

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-semibold mb-4">Audit Logs</h1>
      {err && <p className="text-red-400 mb-3">audit_logs table not found or error: {err}</p>}
      {!rows ? (
        <p className="opacity-70">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="opacity-70">No audit entries.</p>
      ) : (
        <div className="overflow-auto rounded border border-neutral-700">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-900/50">
              <tr>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Actor</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Target</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2">{r.actor_id ?? "—"}</td>
                  <td className="px-3 py-2">{r.action ?? "—"}</td>
                  <td className="px-3 py-2">{r.target ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
