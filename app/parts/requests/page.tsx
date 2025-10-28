"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Link from "next/link";

type DB = Database;
type Request = DB["public"]["Tables"]["part_requests"]["Row"];
type Item = DB["public"]["Tables"]["part_request_items"]["Row"];

const STATUSES: Request["status"][] = ["requested", "quoted", "approved", "fulfilled", "rejected", "cancelled"];

export default function PartsRequestsPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [byStatus, setByStatus] = useState<Record<string, (Request & { items: Item[] })[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: reqs } = await supabase.from("part_requests").select("*").order("created_at", { ascending: false });
      const ids = (reqs ?? []).map(r => r.id);
      let itemsMap: Record<string, Item[]> = {};
      if (ids.length) {
        const { data: items } = await supabase.from("part_request_items").select("*").in("request_id", ids);
        for (const it of items ?? []) {
          (itemsMap[it.request_id] ||= []).push(it);
        }
      }
      const grouped: Record<string, (Request & { items: Item[] })[]> = {};
      for (const s of STATUSES) grouped[s] = [];
      for (const r of reqs ?? []) grouped[r.status].push({ ...r, items: itemsMap[r.id] ?? [] });
      setByStatus(grouped);
      setLoading(false);
    })();
  }, [supabase]);

  return (
    <div className="p-6 text-white space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Parts Requests</h1>
        <Link href="/parts" className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800">
          Parts Catalog
        </Link>
      </div>

      {loading ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-neutral-400">Loading…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {STATUSES.map((s) => (
            <div key={s} className="rounded border border-neutral-800 bg-neutral-900">
              <div className="px-3 py-2 border-b border-neutral-800 text-neutral-300 capitalize">{s}</div>
              <div className="p-3 space-y-3">
                {(byStatus[s] ?? []).map((r) => (
                  <Link key={r.id} href={`/parts/requests/${r.id}`} className="block rounded border border-neutral-800 hover:border-orange-500 p-3">
                    <div className="text-sm font-semibold">WO: {r.work_order_id ?? "—"}</div>
                    <div className="text-xs text-neutral-400">{new Date(r.created_at!).toLocaleString()}</div>
                    <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
                      {r.items.slice(0, 4).map(it => (
                        <li key={it.id}>{it.description} × {Number(it.qty)}</li>
                      ))}
                      {r.items.length > 4 && <li>+ {r.items.length - 4} more…</li>}
                    </ul>
                  </Link>
                ))}
                {(!byStatus[s] || byStatus[s].length === 0) && (
                  <div className="text-sm text-neutral-500">No requests</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}