"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type StockMove = DB["public"]["Tables"]["stock_moves"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type LocRow = DB["public"]["Tables"]["stock_locations"]["Row"];

type RefContext = { workOrderId?: string | null; requestItemId?: string | null; sourceLabel: string };

function n(v: unknown): number { const num = typeof v === "number" ? v : Number(v); return Number.isFinite(num) ? num : 0; }
async function resolveShopId(supabase: ReturnType<typeof createClientComponentClient<DB>>) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null; if (!uid) return "";
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
  if (k === "work_order") return "Work order";
  if (k === "csv_import") return "Import receive";
  if (reason === "consume" || reason === "wo_allocate") return "Allocation / consumption";
  return k || String(reason ?? "movement");
}

export default function StockMovementsPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shopId, setShopId] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [parts, setParts] = useState<Record<string, PartRow>>({});
  const [locs, setLocs] = useState<Record<string, LocRow>>({});
  const [ctxMap, setCtxMap] = useState<Record<string, RefContext>>({});

  const load = async () => {
    setLoading(true); setErr(null);
    const sid = shopId || (await resolveShopId(supabase)); if (!sid) return setLoading(false); if (!shopId) setShopId(sid);
    const { data: mv, error } = await supabase
      .from("stock_moves")
      .select("id, part_id, location_id, qty_change, reason, reference_kind, reference_id, created_at, shop_id")
      .eq("shop_id", sid).order("created_at", { ascending: false }).limit(200);
    if (error) { setErr(error.message); return setLoading(false); }
    const rows = (mv ?? []) as StockMove[]; setMoves(rows);

    const partIds = [...new Set(rows.map((r) => String(r.part_id)).filter(Boolean))];
    const locIds = [...new Set(rows.map((r) => String(r.location_id)).filter(Boolean))];
    const requestItemRefs = [...new Set(rows.filter((r) => String(r.reference_kind ?? "") === "request_receive" && r.reference_id).map((r) => String(r.reference_id)))];
    const stockMoveRefs = [...new Set(rows.filter((r) => String(r.reference_kind ?? "") === "work_order" && r.reference_id).map((r) => String(r.reference_id)))];

    const [pr, lr, reqItems, allocs] = await Promise.all([
      partIds.length ? supabase.from("parts").select("id,name,sku").in("id", partIds) : Promise.resolve({ data: [] as any[] }),
      locIds.length ? supabase.from("stock_locations").select("id,code,name").in("id", locIds) : Promise.resolve({ data: [] as any[] }),
      requestItemRefs.length ? supabase.from("part_request_items").select("id,request_id,work_order_id").in("id", requestItemRefs) : Promise.resolve({ data: [] as any[] }),
      stockMoveRefs.length ? supabase.from("work_order_part_allocations").select("stock_move_id,work_order_id,source_request_item_id").in("stock_move_id", stockMoveRefs) : Promise.resolve({ data: [] as any[] }),
    ]);
    const p: Record<string, PartRow> = {}; (pr.data ?? []).forEach((x: any) => (p[String(x.id)] = x)); setParts(p);
    const l: Record<string, LocRow> = {}; (lr.data ?? []).forEach((x: any) => (l[String(x.id)] = x)); setLocs(l);
    const c: Record<string, RefContext> = {};
    (reqItems.data ?? []).forEach((r: any) => { c[String(r.id)] = { workOrderId: r.work_order_id ?? null, requestItemId: r.id, sourceLabel: "Request receive" }; });
    (allocs.data ?? []).forEach((a: any) => { c[String(a.stock_move_id)] = { workOrderId: a.work_order_id ?? null, requestItemId: a.source_request_item_id ?? null, sourceLabel: "Allocation / consumption" }; });
    setCtxMap(c);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="p-6 space-y-4 text-white">
      <div className="flex items-start justify-between"><div><div className="text-xs uppercase tracking-[0.22em] text-neutral-400">Parts · Audit Lens</div><h1 className="text-2xl font-bold">Stock Movements</h1><div className="text-sm text-neutral-400">Inventory change ledger with source context.</div></div><button onClick={() => void load()} className="rounded-lg border border-white/10 bg-neutral-950/40 px-4 py-2 text-sm">Refresh</button></div>
      {err ? <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">{err}</div> : null}
      {loading ? <div className="rounded-xl border border-white/10 bg-neutral-950/35 p-4 text-sm text-neutral-400">Loading…</div> : (
        <div className="rounded-xl border border-white/10 bg-neutral-950/35 overflow-hidden">
          <table className="w-full text-sm"><thead><tr className="text-left text-neutral-400"><th className="p-3">Time</th><th className="p-3">Part</th><th className="p-3">Location</th><th className="p-3">Qty</th><th className="p-3">Source</th><th className="p-3">Trace</th></tr></thead><tbody>
            {moves.map((m) => {
              const part = parts[String(m.part_id)]; const loc = locs[String(m.location_id)]; const qty = n(m.qty_change);
              const refId = String(m.reference_id ?? ""); const ctx = ctxMap[refId] ?? ctxMap[String(m.id)] ?? null;
              return <tr key={String(m.id)} className="border-t border-white/10"><td className="p-3 text-neutral-300">{m.created_at ? new Date(m.created_at).toLocaleString() : "—"}</td><td className="p-3"><div>{part?.name ?? String(m.part_id).slice(0,8)}</div><div className="text-xs text-neutral-500">{part?.sku ?? ""}</div></td><td className="p-3">{loc?.code ?? "LOC"} <span className="text-xs text-neutral-500">{loc?.name ?? ""}</span></td><td className={`p-3 font-semibold ${qty >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{qty}</td><td className="p-3"><div>{sourceLabel(m.reference_kind, m.reason)}</div><div className="text-xs text-neutral-500">{String(m.reason)}</div></td><td className="p-3 text-xs">{ctx?.workOrderId ? <Link className="text-neutral-200 hover:text-white" href={`/work-orders/${encodeURIComponent(ctx.workOrderId)}`}>WO {ctx.workOrderId.slice(0,8)}</Link> : <span className="text-neutral-500">No WO</span>} {ctx?.requestItemId ? <span className="ml-2 text-neutral-400">ReqItem {ctx.requestItemId.slice(0,8)}</span> : null}</td></tr>;
            })}
          </tbody></table>
        </div>
      )}
    </div>
  );
}
