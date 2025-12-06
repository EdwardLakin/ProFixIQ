// features/dashboard/app/dashboard/admin/UsersPageClient.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Profile = DB["public"]["Tables"]["profiles"]["Row"];

type RowWithShop = {
  id: Profile["id"];
  full_name: Profile["full_name"];
  role: (Profile & { role?: string | null })["role"];
  shop_id: (Profile & { shop_id?: string | null })["shop_id"];
  shops: { name: string | null } | null;
};

export default function UsersPageClient() {
  const supabase = createClientComponentClient<DB>();

  const [rows, setRows] = useState<RowWithShop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select(
          `
          id,
          full_name,
          role,
          shop_id,
          shops:shop_id ( name )
        `,
        )
        .order("full_name", { ascending: true });

      if (!error && data) setRows(data as unknown as RowWithShop[]);
      setLoading(false);
    })();
  }, [supabase]);

  return (
    <div className="p-6 text-white">
      <h1 className="mb-4 text-2xl font-semibold">Employees</h1>

      {loading ? (
        <p className="opacity-70">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="opacity-70">No employees found.</p>
      ) : (
        <div className="overflow-auto rounded border border-neutral-700">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-900/50">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Shop</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2">{r.full_name ?? "—"}</td>
                  <td className="px-3 py-2">{r.role ?? "—"}</td>
                  <td className="px-3 py-2">{r.shops?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/admin/employees/${r.id}`}
                      className="text-orange-400 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}