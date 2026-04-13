"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type StockMove = DB["public"]["Tables"]["stock_moves"]["Row"];
type PartLite = Pick<DB["public"]["Tables"]["parts"]["Row"], "id" | "name" | "sku">;
type LocLite = Pick<DB["public"]["Tables"]["stock_locations"]["Row"], "id" | "code" | "name">;
type RequestItemLite = Pick<DB["public"]["Tables"]["part_request_items"]["Row"], "id" | "work_order_id">;
type AllocationLite = Pick<DB["public"]["Tables"]["work_order_part_allocations"]["Row"], "stock_move_id" | "work_order_id" | "source_request_item_id">;

type RefContext = { workOrderId?: string | null; requestItemId?: string | null; sourceLabel: string };

function n(v: unknown): number { const num = typeof v === "number" ? v : Number(v); return Number.isFinite(num) ? num : 0; }
async function resolveShopId(supabase: ReturnType<typeof createClientComponentClient<DB>>) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;
  if (!uid) return "";
  const { data: profA } = await supabase.from("profiles").select("shop_id").eq("user_id", uid).maybeSingle();
  if (profA?.shop_id) return String(profA.shop_id);
  const { data: profB } = await supabase.from("profiles").select("shop_id").eq("id", uid).maybeSingle();
  return String(profB?.shop_id ?? "");
}

function sourceLabel(kind: string | null, reason: string | null): string {
  const k = String(kind ?? "").toLowerCase();
  if (k === "purchase_order") return "PO receive";
  if (k === "manual_receive") return "Manual receive";
  if (k === "request_receive") return "Request receive";
  if (k === "work_order") return "WO allocation";
  if (k === "csv_import") return "CSV import";
  if (reason === "consume" || reason === "wo_allocate") return "Allocation / consumption";
  return k || String(reason ?? "movement");
}

export default function StockMovementsPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shopId, setShopId] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [parts, setParts] = useState<Record<string, PartLite>>({});
  const [locs, setLocs] = useState<Record<string, LocLite>>({});
  const [ctxMap, setCtxMap] = useState<Record<string, RefContext>>({});

  const load = async () => {
    setLoading(true);
    setErr(null);
    const sid = shopId || (await resolveShopId(supabase));
    if (!sid) return setLoading(false);
    if (!shopId) setShopId(sid);

    const { data: mv, error } = await supabase
      .from("stock_moves")
      .select("id, part_id, location_id, qty_change, reason, reference_kind, reference_id, created_at, shop_id")
      .eq("shop_id", sid)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    const rows = (mv ?? []) as StockMove[];
    setMoves(rows);

    const partIds = [...new Set(rows.map((r) => String(r.part_id)).filter(Boolean))];
    const locIds = [...new Set(rows.map((r) => String(r.location_id)).filter(Boolean))];
    const requestItemRefs = [...new Set(rows.filter((r) => String(r.reference_kind ?? "") === "request_receive" && r.reference_id).map((r) => String(r.reference_id)))];
    const stockMoveRefs = [...new Set(rows.filter((r) => String(r.reference_kind ?? "") === "work_order" && r.reference_id).map((r) => String(r.reference_id)))];

    const [pr, lr, reqItems, allocs] = await Promise.all([
      partIds.length ? supabase.from("parts").select("id,name,sku").in("id", partIds) : Promise.resolve({ data: [] as PartLite[] }),
      locIds.length ? supabase.from("stock_locations").select("id,code,name").in("id", locIds) : Promise.resolve({ data: [] as LocLite[] }),
      requestItemRefs.length ? supabase.from("part_request_items").select("id,work_order_id").in("id", requestItemRefs) : Promise.resolve({ data: [] as RequestItemLite[] }),
      stockMoveRefs.length ? supabase.from("work_order_part_allocations").select("stock_move_id,work_order_id,source_request_item_id").in("stock_move_id", stockMoveRefs) : Promise.resolve({ data: [] as AllocationLite[] }),
    ]);

    const partMap: Record<string, PartLite> = {};
    (pr.data ?? []).forEach((x) => (partMap[String(x.id)] = x));
    setParts(partMap);

    const locMap: Record<string, LocLite> = {};
    (lr.data ?? []).forEach((x) => (locMap[String(x.id)] = x));
    setLocs(locMap);

    const context: Record<string, RefContext> = {};
    (reqItems.data ?? []).forEach((r) => {
      context[String(r.id)] = { workOrderId: r.work_order_id ?? null, requestItemId: String(r.id), sourceLabel: "Request receive" };
    });
    (allocs.data ?? []).forEach((a) => {
      context[String(a.stock_move_id)] = { workOrderId: a.work_order_id ?? null, requestItemId: a.source_request_item_id ?? null, sourceLabel: "WO allocation" };
    });
    setCtxMap(context);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-4 p-6 text-white">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-neutral-400">Parts · Traceability</div>
          <h1 className="text-2xl font-bold">Stock movements</h1>
          <div className="text-sm text-neutral-400">Ledger with direct source links for PO, request receive, and WO allocation context.</div>
        </div>
        <button onClick={() => void load()} className="rounded-lg border border-white/10 bg-neutral-950/40 px-4 py-2 text-sm">Refresh</button>
      </div>

      {err ? <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">{err}</div> : null}
      {loading ? <div className="rounded-xl border border-white/10 bg-neutral-950/35 p-4 text-sm text-neutral-400">Loading…</div> : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-neutral-950/35">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-400">
                <th className="p-3">Time</th><th className="p-3">Part</th><th className="p-3">Location</th><th className="p-3">Qty</th><th className="p-3">Source</th><th className="p-3">Trace links</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => {
                const part = parts[String(m.part_id)];
                const loc = locs[String(m.location_id)];
                const qty = n(m.qty_change);
                const refId = String(m.reference_id ?? "");
                const ctx = ctxMap[refId] ?? ctxMap[String(m.id)] ?? null;
                return (
                  <tr key={String(m.id)} className="border-t border-white/10 align-top">
                    <td className="p-3 text-xs text-neutral-400">{m.created_at ? new Date(m.created_at).toLocaleString() : "—"}</td>
                    <td className="p-3"><div>{part?.name ?? String(m.part_id).slice(0, 8)}</div><div className="text-xs text-neutral-500">{part?.sku ?? ""}</div></td>
                    <td className="p-3">{loc?.code ?? "LOC"} <span className="text-xs text-neutral-500">{loc?.name ?? ""}</span></td>
                    <td className="p-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${qty >= 0 ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200" : "border-rose-500/30 bg-rose-950/20 text-rose-200"}`}>{qty >= 0 ? "+" : ""}{qty}</span></td>
                    <td className="p-3"><div>{ctx?.sourceLabel ?? sourceLabel(m.reference_kind, m.reason)}</div><div className="text-xs text-neutral-500">{String(m.reason ?? "—").replaceAll("_", " ")}</div></td>
                    <td className="p-3 text-xs">
                      <div className="flex flex-wrap gap-2">
                        {ctx?.workOrderId ? <Link className="rounded border border-white/10 px-2 py-0.5 text-neutral-200 hover:text-white" href={`/work-orders/${encodeURIComponent(ctx.workOrderId)}`}>WO {ctx.workOrderId.slice(0, 8)}</Link> : <span className="text-neutral-500">No WO</span>}
                        {ctx?.requestItemId ? <span className="rounded border border-white/10 px-2 py-0.5 text-neutral-300">Req item {ctx.requestItemId.slice(0, 8)}</span> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
