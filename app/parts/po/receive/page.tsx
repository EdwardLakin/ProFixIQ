// app/parts/po/receive/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type PurchaseOrderRow = DB["public"]["Tables"]["purchase_orders"]["Row"];

function safeText(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

export default function ReceiveFromPOPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const [pos, setPOs] = useState<PurchaseOrderRow[]>([]);

  async function load(): Promise<void> {
    setLoading(true);
    setErr(null);

    // Pull recent POs. We keep it broad and allow filtering client-side.
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      setErr(error.message);
      setPOs([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as PurchaseOrderRow[];
    setPOs(rows);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const card =
    "metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl";

  return (
    <div className="p-6 space-y-4 text-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">
            Parts
          </div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            Receive from PO
          </h1>
          <div className="text-sm text-neutral-400">
            Choose a purchase order to receive inventory and update PO line received quantities.
          </div>
        </div>

        <button
          onClick={() => void load()}
          className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 px-4 py-2 text-sm text-neutral-100 hover:border-[color:var(--accent-copper,#f97316)]/70 hover:bg-black/70"
        >
          Refresh
        </button>
      </div>

      {/* Errors */}
      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {/* Main */}
      {loading ? (
        <div className={`${card} p-4 text-sm text-neutral-400`}>Loading…</div>
      ) : pos.length === 0 ? (
        <div className={`${card} p-4 text-sm text-neutral-400`}>
          No purchase orders found.
        </div>
      ) : (
        <div className={`${card} overflow-hidden`}>
          <div className="border-b border-white/10 bg-gradient-to-r from-black/80 via-slate-950/80 to-black/80 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Purchase Orders
            </div>
            <div className="mt-1 text-[11px] text-neutral-500">
              Select a PO to open the receiving screen.
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-400">
                  <th className="p-3">PO</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Created</th>
                  <th className="p-3">Vendor</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {pos.map((po) => {
                  const id = safeText(po.id);
                  const status = safeText(po.status ?? "draft");

                  // vendor is schema-dependent; we keep it defensive
                  const vendor =
                    safeText((po as unknown as { vendor?: unknown }).vendor) ||
                    safeText((po as unknown as { vendor_name?: unknown }).vendor_name) ||
                    safeText((po as unknown as { vendor_id?: unknown }).vendor_id) ||
                    "—";

                  return (
                    <tr key={id} className="border-t border-white/10">
                      <td className="p-3">
                        <div className="font-semibold text-neutral-100">
                          {id ? id.slice(0, 8) : "—"}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          {id ? id : ""}
                        </div>
                      </td>

                      <td className="p-3">
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-neutral-200">
                          {status}
                        </span>
                      </td>

                      <td className="p-3 text-neutral-300">
                        {fmtDate(po.created_at ?? null)}
                      </td>

                      <td className="p-3 text-neutral-300">{vendor}</td>

                      <td className="p-3">
                        <Link
                          href={`/parts/po/${encodeURIComponent(id)}/receive`}
                          className="inline-flex items-center justify-center rounded-full border border-[color:var(--accent-copper,#f97316)]/80 bg-gradient-to-r from-black/80 via-[color:var(--accent-copper,#f97316)]/15 to-black/80 px-4 py-2 text-sm font-semibold text-neutral-50 hover:border-[color:var(--accent-copper-light,#fed7aa)]"
                        >
                          Open receive →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-white/10 px-4 py-3 text-[11px] text-neutral-500">
            Tip: Receiving from a PO updates inventory and increments PO line received_qty (FIFO) until complete.
          </div>
        </div>
      )}
    </div>
  );
}