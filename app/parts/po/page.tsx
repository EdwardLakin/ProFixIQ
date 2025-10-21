"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PurchaseOrder = DB["public"]["Tables"]["purchase_orders"]["Row"];

export default function PurchaseOrdersPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shopId, setShopId] = useState<string>("");
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) {
        setLoading(false);
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", uid)
        .single();
      const sid = prof?.shop_id ?? "";
      setShopId(sid);

      const { data } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("shop_id", sid)
        .order("created_at", { ascending: false })
        .limit(100);

      setPOs((data ?? []) as PurchaseOrder[]);
      setLoading(false);
    })();
  }, [supabase]);

  return (
    <div className="p-6 space-y-4 text-white">
      <h1 className="text-2xl font-bold">Purchase Orders</h1>

      {loading ? (
        <div className="text-neutral-400">Loading…</div>
      ) : pos.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-neutral-300">
          No purchase orders yet.
        </div>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded border border-neutral-800">
          {pos.map((po) => (
            <li key={po.id} className="flex items-center justify-between p-3">
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {po.id.slice(0, 8)} • {po.status ?? "draft"}
                </div>
                <div className="text-xs text-neutral-400">
                  Supplier: {po.supplier_id ?? "—"}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <Link
                  href={`/parts/po/${po.id}/receive`}
                  className="rounded border border-orange-500 px-2 py-1 text-sm text-orange-300 hover:bg-orange-900/20"
                >
                  Receive
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {shopId ? (
        <div className="text-xs text-neutral-500">
          Shop: <span className="font-mono">{shopId}</span>
        </div>
      ) : null}
    </div>
  );
}