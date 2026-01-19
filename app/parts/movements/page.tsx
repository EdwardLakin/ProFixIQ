// app/parts/movements/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type StockMove = DB["public"]["Tables"]["stock_moves"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type LocRow = DB["public"]["Tables"]["stock_locations"]["Row"];

function n(v: unknown): number {
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : 0;
}

async function resolveShopId(supabase: ReturnType<typeof createClientComponentClient<DB>>) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;
  if (!uid) return "";

  const { data: profA } = await supabase.from("profiles").select("shop_id").eq("user_id", uid).maybeSingle();
  if (profA?.shop_id) return String(profA.shop_id);

  const { data: profB } = await supabase.from("profiles").select("shop_id").eq("id", uid).maybeSingle();
  return String(profB?.shop_id ?? "");
}

export default function StockMovementsPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shopId, setShopId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [moves, setMoves] = useState<StockMove[]>([]);
  const [parts, setParts] = useState<Record<string, PartRow>>({});
  const [locs, setLocs] = useState<Record<string, LocRow>>({});

  const card =
    "metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl";

  const load = async () => {
    setLoading(true);
    setErr(null);

    const sid = shopId || (await resolveShopId(supabase));
    if (!sid) {
      setLoading(false);
      return;
    }
    if (!shopId) setShopId(sid);

    const { data: mv, error: mvErr } = await supabase
      .from("stock_moves")
      .select("id, part_id, location_id, qty_change, reason, reference_kind, reference_id, created_at, created_by, shop_id")
      .eq("shop_id", sid)
      .order("created_at", { ascending: false })
      .limit(200);

    if (mvErr) {
      setErr(mvErr.message);
      setLoading(false);
      return;
    }

    const rows = (mv ?? []) as StockMove[];
    setMoves(rows);

    const partIds = Array.from(new Set(rows.map((r) => String(r.part_id)).filter(Boolean)));
    const locIds = Array.from(new Set(rows.map((r) => String(r.location_id)).filter(Boolean)));

    if (partIds.length) {
      const { data: pr, error: prErr } = await supabase.from("parts").select("*").in("id", partIds);
      if (prErr) setErr(prErr.message);
      const map: Record<string, PartRow> = {};
      (pr ?? []).forEach((p) => (map[String((p as PartRow).id)] = p as PartRow));
      setParts(map);
    } else setParts({});

    if (locIds.length) {
      const { data: lr, error: lrErr } = await supabase.from("stock_locations").select("*").in("id", locIds);
      if (lrErr) setErr(lrErr.message);
      const map: Record<string, LocRow> = {};
      (lr ?? []).forEach((l) => (map[String((l as LocRow).id)] = l as LocRow));
      setLocs(map);
    } else setLocs({});

    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 space-y-4 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">Parts</div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-blackops), system-ui" }}>
            Stock Movements
          </h1>
          <div className="text-sm text-neutral-400">Immutable inventory ledger (stock_moves).</div>
        </div>
        <button
          onClick={() => void load()}
          className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 px-4 py-2 text-sm text-neutral-100 hover:border-[color:var(--accent-copper,#f97316)]/70 hover:bg-black/70"
        >
          Refresh
        </button>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className={`${card} p-4 text-sm text-neutral-400`}>Loading…</div>
      ) : moves.length === 0 ? (
        <div className={`${card} p-4 text-sm text-neutral-400`}>No movements.</div>
      ) : (
        <div className={`${card} overflow-hidden`}>
          <div className="border-b border-white/10 bg-gradient-to-r from-black/80 via-slate-950/80 to-black/80 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Latest movements
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-400">
                  <th className="p-3">Time</th>
                  <th className="p-3">Part</th>
                  <th className="p-3">Location</th>
                  <th className="p-3">Qty</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Ref</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => {
                  const part = parts[String(m.part_id)];
                  const loc = locs[String(m.location_id)];
                  const qty = n(m.qty_change);
                  const t = m.created_at ? new Date(m.created_at).toLocaleString() : "—";

                  return (
                    <tr key={String(m.id)} className="border-t border-white/10">
                      <td className="p-3 whitespace-nowrap text-neutral-300">{t}</td>
                      <td className="p-3">
                        <div className="font-semibold text-neutral-100">
                          {part?.name ? String(part.name) : String(m.part_id).slice(0, 8)}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          {part?.sku ? String(part.sku) + " • " : ""}
                          {String(m.part_id).slice(0, 8)}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-neutral-100">{loc?.code ? String(loc.code) : "LOC"}</div>
                        <div className="text-[11px] text-neutral-500">{loc?.name ? String(loc.name) : String(m.location_id).slice(0, 8)}</div>
                      </td>
                      <td className="p-3 tabular-nums font-semibold">
                        <span className={qty >= 0 ? "text-emerald-300" : "text-red-300"}>{qty}</span>
                      </td>
                      <td className="p-3">{String(m.reason ?? "")}</td>
                      <td className="p-3 text-[11px] text-neutral-400">
                        {String(m.reference_kind ?? "—")}
                        {m.reference_id ? " • " + String(m.reference_id).slice(0, 8) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-white/10 px-4 py-3 text-[11px] text-neutral-500">
            This is your source of truth. part_stock is a snapshot maintained by triggers on stock_moves.
          </div>
        </div>
      )}
    </div>
  );
}