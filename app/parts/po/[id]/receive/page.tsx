"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PoLine = {
  id: string;
  part_id: string;
  qty: number;
  received_qty: number | null;
  parts?: { name: string | null; sku: string | null } | null;
};

export default function ReceivePOPage() {
  const params = useParams();
  const poId = String(params?.id || "");
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [lines, setLines] = useState<PoLine[]>([]);
  const [locs, setLocs] = useState<{ id: string; code: string | null; name: string | null }[]>([]);
  const [locByLine, setLocByLine] = useState<Record<string, string>>({});
  const [qtyByLine, setQtyByLine] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !poId) return;

      // load PO lines
      const { data: ls } = await supabase
        .from("purchase_order_lines")
        .select("id, part_id, qty, received_qty, parts(name, sku)")
        .eq("po_id", poId)
        .order("created_at", { ascending: true });

      setLines((ls as any) ?? []);

      // load locations (shop from PO)
      const { data: po } = await supabase.from("purchase_orders").select("shop_id").eq("id", poId).maybeSingle();
      const shopId = po?.shop_id ?? null;
      if (shopId) {
        const { data: locsData } = await supabase
          .from("stock_locations")
          .select("id, code, name")
          .eq("shop_id", shopId)
          .order("code");
        setLocs((locsData as any) ?? []);
        const main = (locsData ?? []).find((l) => (l.code ?? "").toUpperCase() === "MAIN");
        if (main) {
          const defaults: Record<string, string> = {};
          (ls ?? []).forEach((ln: any) => (defaults[ln.id] = main.id));
          setLocByLine(defaults);
        }
      }

      // default qty = remaining
      const q: Record<string, number> = {};
      (ls ?? []).forEach((ln: any) => {
        const remaining = Math.max(0, Number(ln.qty) - Number(ln.received_qty || 0));
        q[ln.id] = remaining;
      });
      setQtyByLine(q);
    })();
  }, [supabase, poId]);

  const receiveSelected = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const items = lines
        .map((ln) => {
          const qty = Math.max(0, Number(qtyByLine[ln.id] || 0));
          const loc = locByLine[ln.id];
          return qty > 0 && loc
            ? { line_id: ln.id, part_id: ln.part_id, location_id: loc, qty }
            : null;
        })
        .filter(Boolean) as { line_id: string; part_id: string; location_id: string; qty: number }[];

      await Promise.all(
        items.map((it) =>
          fetch("/api/receive-scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              part_id: it.part_id,
              location_id: it.location_id,
              qty: it.qty,
              po_id: poId,
            }),
          }),
        ),
      );

      // reload
      const { data: ls } = await supabase
        .from("purchase_order_lines")
        .select("id, part_id, qty, received_qty, parts(name, sku)")
        .eq("po_id", poId)
        .order("created_at", { ascending: true });
      setLines((ls as any) ?? []);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold">Receive PO</h1>
      <div className="mt-2 text-sm text-neutral-400">PO: {poId.slice(0, 8)}…</div>

      <div className="mt-4 overflow-x-auto rounded border border-neutral-800">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="bg-neutral-900">
            <tr>
              <th className="px-3 py-2 text-left">Part</th>
              <th className="px-3 py-2 text-right">Ordered</th>
              <th className="px-3 py-2 text-right">Received</th>
              <th className="px-3 py-2 text-right">Receive Now</th>
              <th className="px-3 py-2">Location</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((ln) => {
              const ordered = Number(ln.qty);
              const rec = Number(ln.received_qty || 0);
              const remaining = Math.max(0, ordered - rec);
              return (
                <tr key={ln.id} className="border-t border-neutral-800">
                  <td className="px-3 py-2">
                    <div className="font-medium truncate">{ln.parts?.name ?? "Part"}</div>
                    <div className="text-xs text-neutral-400">SKU: {ln.parts?.sku ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{ordered}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{rec}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={qtyByLine[ln.id] ?? remaining}
                      onChange={(e) =>
                        setQtyByLine((m) => ({ ...m, [ln.id]: Math.max(0, Number(e.target.value || 0)) }))
                      }
                      className="w-28 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-right"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={locByLine[ln.id] || ""}
                      onChange={(e) => setLocByLine((m) => ({ ...m, [ln.id]: e.target.value }))}
                      className="w-48 rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
                    >
                      <option value="">Select…</option>
                      {locs.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.code} — {l.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <button
          className="rounded bg-orange-500 px-4 py-2 text-black disabled:opacity-60"
          disabled={busy}
          onClick={receiveSelected}
        >
          {busy ? "Receiving…" : "Receive Selected"}
        </button>
      </div>
    </div>
  );
}