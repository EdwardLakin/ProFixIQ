"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Alloc = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];

async function resolveShopId(supabase: ReturnType<typeof createClientComponentClient<DB>>) {
  const { data: userRes } = await supabase.auth.getUser(); const uid = userRes.user?.id ?? null; if (!uid) return "";
  const { data: profA } = await supabase.from("profiles").select("shop_id").eq("user_id", uid).maybeSingle(); if (profA?.shop_id) return String(profA.shop_id);
  const { data: profB } = await supabase.from("profiles").select("shop_id").eq("id", uid).maybeSingle(); return String(profB?.shop_id ?? "");
}

export default function AllocationsPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shopId, setShopId] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    void (async () => {
      setLoading(true); setErr(null);
      try {
        const sid = await resolveShopId(supabase); setShopId(sid); if (!sid) { setRows([]); return; }
        const { data: allocs, error } = await supabase.from("work_order_part_allocations").select("*").eq("shop_id", sid).order("created_at", { ascending: false }).limit(400);
        if (error) throw error;
        const list = (allocs ?? []) as Alloc[];
        const partIds = [...new Set(list.map((a) => String(a.part_id)).filter(Boolean))];
        const locIds = [...new Set(list.map((a) => String(a.location_id)).filter(Boolean))];
        const woIds = [...new Set(list.map((a) => String(a.work_order_id ?? "")).filter(Boolean))];
        const reqItemIds = [...new Set(list.map((a) => String(a.source_request_item_id ?? "")).filter(Boolean))];
        const moveIds = [...new Set(list.map((a) => String(a.stock_move_id ?? "")).filter(Boolean))];
        const [parts, locs, wos, reqItems, moves] = await Promise.all([
          partIds.length ? supabase.from("parts").select("id,name,sku").in("id", partIds) : Promise.resolve({ data: [] as any[] }),
          locIds.length ? supabase.from("stock_locations").select("id,code,name").in("id", locIds) : Promise.resolve({ data: [] as any[] }),
          woIds.length ? supabase.from("work_orders").select("id,custom_id").in("id", woIds) : Promise.resolve({ data: [] as any[] }),
          reqItemIds.length ? supabase.from("part_request_items").select("id,request_id,po_id").in("id", reqItemIds) : Promise.resolve({ data: [] as any[] }),
          moveIds.length ? supabase.from("stock_moves").select("id,reference_kind,reference_id,reason").in("id", moveIds) : Promise.resolve({ data: [] as any[] }),
        ]);
        const partBy: Record<string, any> = {}; (parts.data ?? []).forEach((x: any) => (partBy[String(x.id)] = x));
        const locBy: Record<string, any> = {}; (locs.data ?? []).forEach((x: any) => (locBy[String(x.id)] = x));
        const woBy: Record<string, any> = {}; (wos.data ?? []).forEach((x: any) => (woBy[String(x.id)] = x));
        const reqBy: Record<string, any> = {}; (reqItems.data ?? []).forEach((x: any) => (reqBy[String(x.id)] = x));
        const moveBy: Record<string, any> = {}; (moves.data ?? []).forEach((x: any) => (moveBy[String(x.id)] = x));
        setRows(list.map((a) => ({ a, part: partBy[String(a.part_id)], loc: locBy[String(a.location_id)], wo: a.work_order_id ? woBy[String(a.work_order_id)] : null, req: a.source_request_item_id ? reqBy[String(a.source_request_item_id)] : null, move: a.stock_move_id ? moveBy[String(a.stock_move_id)] : null })));
      } catch (e: any) { setErr(e.message ?? "Failed to load allocations."); }
      finally { setLoading(false); }
    })();
  }, [supabase]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase(); if (!q) return rows;
    return rows.filter((r) => [r.part?.name, r.part?.sku, r.loc?.code, r.wo?.custom_id, r.a.work_order_id, r.req?.request_id, r.move?.reference_kind].join(" ").toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div className="p-6 space-y-4 text-white">
      <div className="flex items-center justify-between"><div><div className="text-xs uppercase tracking-[0.22em] text-neutral-400">Parts · Audit Lens</div><h1 className="text-2xl font-bold">Allocations</h1><div className="text-sm text-neutral-400">What inventory was committed to jobs and where it came from.</div></div><Link href="/parts" className="rounded-lg border border-white/10 bg-neutral-950/40 px-3 py-2 text-sm">Parts</Link></div>
      <div className="rounded-xl border border-white/10 bg-neutral-950/35 p-3"><input className="w-full rounded-lg border border-white/10 bg-neutral-950/40 px-3 py-2 text-sm" placeholder="Search WO, part, source request, move kind..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      {loading ? <div className="rounded-xl border border-white/10 bg-neutral-950/35 p-4 text-sm text-neutral-400">Loading…</div> : err ? <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">{err}</div> : (
        <div className="rounded-xl border border-white/10 bg-neutral-950/35 overflow-hidden">
          <table className="w-full text-sm"><thead><tr className="text-left text-neutral-400"><th className="p-3">WO</th><th className="p-3">Part</th><th className="p-3">Location</th><th className="p-3">Qty</th><th className="p-3">Upstream</th><th className="p-3">Created</th></tr></thead><tbody>
            {filtered.map((r) => <tr key={String(r.a.id)} className="border-t border-white/10"><td className="p-3">{r.a.work_order_id ? <Link className="text-neutral-200 hover:text-white" href={`/work-orders/${encodeURIComponent(String(r.a.work_order_id))}`}>{r.wo?.custom_id ?? String(r.a.work_order_id).slice(0,8)}</Link> : <span className="text-neutral-500">—</span>}</td><td className="p-3"><div>{r.part?.name ?? String(r.a.part_id).slice(0,8)}</div><div className="text-xs text-neutral-500">{r.part?.sku ?? ""}</div></td><td className="p-3">{r.loc?.code ?? "LOC"} <span className="text-xs text-neutral-500">{r.loc?.name ?? ""}</span></td><td className="p-3 tabular-nums text-neutral-200">{r.a.qty}</td><td className="p-3 text-xs text-neutral-300">{r.req?.request_id ? <span>Request {String(r.req.request_id).slice(0,8)}</span> : <span className="text-neutral-500">No request link</span>}<div className="text-neutral-500">{r.move?.reference_kind ?? "—"} · {r.move?.reason ?? "—"}</div></td><td className="p-3 text-xs text-neutral-500">{r.a.created_at ? new Date(r.a.created_at).toLocaleString() : "—"}</td></tr>)}
          </tbody></table>
        </div>
      )}
      {!shopId ? <div className="text-xs text-neutral-500">No shop detected for this user.</div> : null}
    </div>
  );
}
