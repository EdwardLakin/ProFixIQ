"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { v4 as uuidv4 } from "uuid";

type DB = Database;
type PurchaseOrder = DB["public"]["Tables"]["purchase_orders"]["Row"];
type Supplier = DB["public"]["Tables"]["suppliers"]["Row"];

export default function PurchaseOrdersPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [shopId, setShopId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);

  // New PO modal state
  const [open, setOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;
      if (!uid) { setLoading(false); return; }

      const { data: prof } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", uid)
        .single();

      const sid = prof?.shop_id ?? "";
      setShopId(sid);

      if (sid) {
        const [poRes, supRes] = await Promise.all([
          supabase
            .from("purchase_orders")
            .select("*")
            .eq("shop_id", sid)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("suppliers")
            .select("*")
            .eq("shop_id", sid)
            .order("name", { ascending: true }),
        ]);
        setPOs((poRes.data as PurchaseOrder[]) ?? []);
        setSuppliers((supRes.data as Supplier[]) ?? []);
      }

      setLoading(false);
    })();
  }, [supabase]);

  const createPo = async () => {
    if (!shopId) return;
    const id = uuidv4();
    const insert = {
      id,
      shop_id: shopId,
      supplier_id: supplierId || null,
      status: "open" as PurchaseOrder["status"],
      notes: note || null,
    };
    const { error } = await supabase.from("purchase_orders").insert(insert);
    if (!error) {
      setOpen(false);
      setSupplierId("");
      setNote("");
      router.push(`/parts/po/${id}/receive`);
    } else {
      // keep UI minimal for now
      alert(error.message);
    }
  };

  return (
    <div className="p-6 space-y-4 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Purchase Orders</h1>
        <button
          className="font-header rounded border border-orange-500 px-3 py-1.5 text-sm hover:bg-orange-500/10 disabled:opacity-60"
          onClick={() => setOpen(true)}
          disabled={!shopId}
        >
          New PO
        </button>
      </div>

      {loading ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
          Loading…
        </div>
      ) : pos.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
          No purchase orders yet.
        </div>
      ) : (
        <div className="rounded border border-neutral-800 bg-neutral-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-400">
                <th className="p-2">PO</th>
                <th className="p-2">Supplier</th>
                <th className="p-2">Status</th>
                <th className="p-2">Created</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po) => (
                <tr key={po.id} className="border-t border-neutral-800">
                  <td className="p-2 font-mono">{po.id.slice(0, 8)}</td>
                  <td className="p-2">{po.supplier_id ?? "—"}</td>
                  <td className="p-2">{po.status}</td>
                  <td className="p-2">{po.created_at ? new Date(po.created_at).toLocaleString() : "—"}</td>
                  <td className="p-2">
                    <Link
                      href={`/parts/po/${po.id}/receive`}
                      className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800"
                    >
                      Receive
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New PO "modal" (lightweight inline panel to keep dependencies low) */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded border border-orange-500 bg-neutral-950 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New Purchase Order</h2>
              <button
                className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs text-neutral-400">Supplier (optional)</div>
                <select
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">— none —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name ?? s.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-1 text-xs text-neutral-400">Notes</div>
                <textarea
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional notes for this PO…"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="rounded border border-orange-500 px-3 py-1.5 text-sm hover:bg-orange-500/10 disabled:opacity-60"
                  onClick={createPo}
                  disabled={!shopId}
                >
                  Create & Receive →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}