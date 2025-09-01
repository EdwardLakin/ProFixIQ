"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type ProfileLite = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "role"
>;

export default function AdminRolesClient() {
  const supabase = createClientComponentClient<Database>();
  const [rows, setRows] = useState<ProfileLite[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select<"id, full_name, role">("id, full_name, role");

      if (error) {
        setErr(error.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as ProfileLite[]);
    })();
  }, [supabase]);

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-semibold mb-4">Roles</h1>

      {err && (
        <p className="text-red-400 mb-3">
          profiles query failed: {err}
        </p>
      )}

      {!rows ? (
        <p className="opacity-70">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="opacity-70">No users to show.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="p-3 rounded bg-neutral-900/50 border border-neutral-800"
            >
              <div className="font-medium">{r.full_name ?? r.id}</div>
              <div className="text-xs opacity-75">Role: {r.role ?? "—"}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
