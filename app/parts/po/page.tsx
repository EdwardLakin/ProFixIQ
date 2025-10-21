"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createPurchaseOrder, addPoLine, markPoSent, receivePo } from "@/features/parts/server/poActions";
type DB = Database;

export default function PurchaseOrdersPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shopId, setShopId] = useState<string>("");
  const [pos, setPOs] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

  // simple form
  const [supplierId, setSupplierId] = useState<string>("");
  const [notes, setNotes] = useState("");

  // load shop + list
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from("profiles").select("shop_id").eq("user_id", user.id).single();
      const sid = prof?.shop_id ?? "";
      setShopId(sid);
      if (!sid) return;
      const { data: rows } = await supabase
        .from("purchase_orders")
        .select("*, suppliers(name)")
        .eq("shop_id", sid)
        .order("created_at", { ascending: false })
        .limit(50);
      setPOs(rows ?? []);
    })();
  }, [supabase, creating]);

  const createPO = async () => {
    if (!shopId) return;
    setCreating(true);
    try {
      const id = await createPurchaseOrder({ shop_id: shopId, supplier_id: supplierId || null, notes });
      // add a demo line (you’ll replace with a real composer)
      await addPoLine({ po_id: id, sku: "SKU123", description: "Demo Item", qty: 1, unit_cost: 10, location_id: null });
      setSupplierId("");
      setNotes("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Purchase Orders</h1>

      <div className="rounded border border-neutral-800 bg-neutral-900 p-4 space-y-2 max-w-2xl">
        <div className="text-lg font-semibold">New PO</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="rounded border border-neutral-700 bg-neutral-900 p-2"
            placeholder="Supplier ID (optional)"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          />
          <input
            className="rounded border border-neutral-700 bg-neutral-900 p-2"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <button
          className="rounded bg-orange-500 px-3 py-2 text-black disabled:opacity-60"
          disabled={!shopId || creating}
          onClick={createPO}
        >
          {creating ? "Creating…" : "Create PO"}
        </button>
      </div>

      <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <div className="text-lg font-semibold mb-2">Recent</div>
        {!pos?.length ? (
          <div className="text-neutral-400 text-sm">No POs yet.</div>
        ) : (
          <ul className="divide-y divide-neutral-800">
            {pos.map((po) => (
              <li key={po.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">PO #{po.id.slice(0,8)} • {po.status}</div>
                  <div className="text-xs text-neutral-400">{po.suppliers?.name ?? "—"} {po.notes ? `• ${po.notes}` : ""}</div>
                </div>
                <div className="flex gap-2">
                  <button className="rounded border border-neutral-700 px-2 py-1 text-sm"
                    onClick={() => markPoSent(po.id)}>Mark Sent</button>
                  <button className="rounded border border-neutral-700 px-2 py-1 text-sm"
                    onClick={() => receivePo(po.id)}>Receive All</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
