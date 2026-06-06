// app/parts/po/receive/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { receiveProgressLabel } from "@/features/parts/lib/status-display";
import PageShell from "@/features/shared/components/PageShell";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";
import { Button } from "@/features/shared/components/ui/Button";

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
  const supabase = useMemo(() => createBrowserSupabase(), []);

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

  const toneForStatus = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized === "received") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
    if (normalized === "receiving") return "border-sky-500/40 bg-sky-500/10 text-sky-200";
    if (normalized === "ordered" || normalized === "open" || normalized === "draft") {
      return "border-indigo-500/40 bg-indigo-500/10 text-indigo-200";
    }
    if (normalized === "cancelled" || normalized === "canceled") return "border-rose-500/40 bg-rose-500/10 text-rose-200";
    return "border-[color:var(--desktop-border)] bg-black/40 text-neutral-200";
  };

  const toolbar = (
    <div className="flex w-full justify-end">
      <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
        Refresh
      </Button>
    </div>
  );

  return (
    <PageShell
      title="Receive from PO"
      eyebrow="Parts"
      description="PO lens into the shared receiving workflow."
      toolbar={toolbar}
    >
      <div className="space-y-4 text-white">

        {err ? <div className="desktop-panel-soft border-red-500/40 bg-red-900/20 p-3 text-sm text-red-200">{err}</div> : null}

        {loading ? (
          <div className={ui.loadingState}>Loading…</div>
        ) : pos.length === 0 ? (
          <div className={ui.emptyState}>No purchase orders found.</div>
        ) : (
          <div className={`${ui.panel} overflow-hidden`}>
            <div className="border-b border-[color:var(--desktop-border)] px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">Purchase orders</div>
              <div className="mt-1 text-[11px] text-neutral-500">Select a PO to open the receiving screen.</div>
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

                    const vendor =
                      safeText((po as unknown as { vendor?: unknown }).vendor) ||
                      safeText((po as unknown as { vendor_name?: unknown }).vendor_name) ||
                      safeText((po as unknown as { vendor_id?: unknown }).vendor_id) ||
                      "—";

                    return (
                      <tr key={id} className="border-t border-[color:var(--desktop-border)]">
                        <td className="p-3">
                          <div className="font-semibold text-neutral-100">{id ? id.slice(0, 8) : "—"}</div>
                          <div className="text-[11px] text-neutral-500">{id ? id : ""}</div>
                        </td>

                        <td className="p-3">
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${toneForStatus(status)}`}>
                            {status}
                          </span>
                        </td>

                        <td className="p-3 text-neutral-300">{fmtDate(po.created_at ?? null)}</td>

                        <td className="p-3 text-neutral-300">{vendor}</td>

                        <td className="p-3">
                          <Link
                            href={`/parts/po/${encodeURIComponent(id)}/receive`}
                            className="desktop-btn-secondary inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold"
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

            <div className="border-t border-[color:var(--desktop-border)] px-4 py-3 text-[11px] text-neutral-500">
              Tip: Shared receive language: {receiveProgressLabel("partial")} and {receiveProgressLabel("received")} apply across Inbox, PO, and Scan.
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
