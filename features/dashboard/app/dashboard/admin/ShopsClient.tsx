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

type ShopRow = Pick<
  Database["public"]["Tables"]["shops"]["Row"],
  "id" | "name" | "city" | "province" | "email" | "phone_number" | "timezone"
>;

export default function AdminShopsClient() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const [rows, setRows] = useState<ShopRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("id, name, city, province, email, phone_number, timezone")
        .order("name", { ascending: true })
        .limit(100);

      if (error) setErr(error.message);
      setRows((data as ShopRow[]) ?? []);
    })();
  }, [supabase]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Tenant Oversight"
        title="Shops"
        subtitle="Monitor shop identity and baseline operating profile completeness."
      />

      <AdminPanel>
        <AdminPanelTitle title="Shop Directory" description="Active shop records across tenant scope." />

        {err ? <p className="px-4 py-3 text-xs text-red-300">Shop query failed: {err}</p> : null}

        {!rows ? (
          <AdminEmptyState title="Loading shops" body="Reading tenant shop records." />
        ) : rows.length === 0 ? (
          <AdminEmptyState title="No shops found" body="No shop records are available in the current environment." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.12em] text-neutral-400">
                <tr>
                  <th className="px-4 py-2.5 text-left">Shop</th>
                  <th className="px-4 py-2.5 text-left">Location</th>
                  <th className="px-4 py-2.5 text-left">Email</th>
                  <th className="px-4 py-2.5 text-left">Phone</th>
                  <th className="px-4 py-2.5 text-left">Timezone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((s) => (
                  <tr key={s.id} className="text-neutral-200">
                    <td className="px-4 py-2.5 font-medium text-neutral-100">{s.name ?? s.id}</td>
                    <td className="px-4 py-2.5">{[s.city, s.province].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-4 py-2.5">{s.email ?? "—"}</td>
                    <td className="px-4 py-2.5">{s.phone_number ?? "—"}</td>
                    <td className="px-4 py-2.5">{s.timezone ?? "—"}</td>
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
