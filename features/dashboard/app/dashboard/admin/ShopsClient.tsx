"use client"
import React from "react";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function AdminShopsClient() {
  const supabase = createClientComponentClient<Database>();
  const [rows, setRows] = React.useState<any[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("shops").select("*").limit(100);
      if (error) setErr(error.message);
      setRows(data ?? []);
    })();
  }, [supabase]);

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-semibold mb-4">Shops</h1>
      {err && <p className="text-red-400 mb-3">shops table not found or error: {err}</p>}
      {!rows ? (
        <p className="opacity-70">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="opacity-70">No shops found.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(s => (
            <div key={s.id} className="p-4 rounded bg-neutral-900/50 border border-neutral-800">
              <div className="font-semibold">{s.name ?? s.id}</div>
              <div className="text-xs opacity-75">{s.city ?? ""} {s.state ?? ""}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
