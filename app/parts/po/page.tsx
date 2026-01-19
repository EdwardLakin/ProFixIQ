// app/parts/po/page.tsx (FULL FILE REPLACEMENT)
// Upgraded to ProFixIQ copper/glass theme, shows supplier names, adds status pills,
// adds safer create flow (uses DB default id if available, falls back to uuid), and better error UX.
// No new dependencies besides uuid (already in your file).

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

type Status = PurchaseOrder["status"];

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function statusPill(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s === "received") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (s === "receiving") return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  if (s === "ordered") return "border-indigo-500/40 bg-indigo-500/10 text-indigo-200";
  if (s === "open" || s === "draft")
    return "border-orange-500/40 bg-orange-500/10 text-orange-200";
  if (s === "cancelled" || s === "canceled")
    return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  return "border-white/10 bg-white/5 text-neutral-200";
}

export default function PurchaseOrdersPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [shopId, setShopId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const supplierNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliers) {
      if (typeof s.id === "string") m.set(s.id, (s.name as string) ?? s.id.slice(0, 8));
    }
    return m;
  }, [suppliers]);

  // Modal state
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [busyCreate, setBusyCreate] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refresh = async (sid: string) => {
    const [poRes, supRes] = await Promise.all([
      supabase
        .from("purchase_orders")
        .select("*")
        .eq("shop_id", sid)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("suppliers")
        .select("*")
        .eq("shop_id", sid)
        .order("name", { ascending: true }),
    ]);

    setPOs((poRes.data as PurchaseOrder[]) ?? []);
    setSuppliers((supRes.data as Supplier[]) ?? []);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrorMsg(null);

      const { data: userRes, error: uErr } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;

      if (uErr) {
        setErrorMsg(uErr.message);
        setLoading(false);
        return;
      }

      if (!uid) {
        setErrorMsg("Not authenticated.");
        setLoading(false);
        return;
      }

      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", uid)
        .maybeSingle();

      if (pErr) {
        setErrorMsg(pErr.message);
        setLoading(false);
        return;
      }

      const sid = (prof?.shop_id as string | null) ?? "";
      setShopId(sid);

      if (sid) await refresh(sid);

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const createPo = async () => {
    if (!shopId || busyCreate) return;

    setBusyCreate(true);
    setErrorMsg(null);

    // Prefer DB defaults if your table has default UUID; but keep a fallback id for older schemas.
    const fallbackId = uuidv4();

    const insert = {
      id: fallbackId,
      shop_id: shopId,
      supplier_id: supplierId || null,
      status: "open" as Status,
      notes: note.trim() ? note.trim() : null,
    };

    const { data, error } = await supabase
      .from("purchase_orders")
      .insert(insert)
      .select("id")
      .single();

    if (error) {
      setErrorMsg(error.message);
      setBusyCreate(false);
      return;
    }

    const newId = (data?.id as string | null) ?? fallbackId;

    setOpen(false);
    setSupplierId("");
    setNote("");

    // keep list in sync
    await refresh(shopId);

    setBusyCreate(false);
    router.push(`/parts/po/${newId}/receive`);
  };

  const closeModal = () => {
    if (busyCreate) return;
    setOpen(false);
    setSupplierId("");
    setNote("");
  };

  const pageWrap =
    "relative p-4 md:p-6 text-white";
  const panel =
    "metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl";
  const headerFont = { fontFamily: "var(--font-blackops), system-ui" } as const;

  return (
    <div className={pageWrap}>
      {/* subtle radial like menu page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.95),#020617_70%)]"
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
            Parts
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-white" style={headerFont}>
            Purchase Orders
          </h1>
          <div className="mt-1 text-xs text-neutral-500">
            Create POs, receive, and auto-allocate to approved requests.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/50 px-4 py-2 text-sm text-neutral-100 hover:border-[color:var(--accent-copper,#f97316)]/70 hover:bg-black/60 disabled:opacity-60"
            onClick={() => (shopId ? void refresh(shopId) : null)}
            disabled={!shopId || loading}
            type="button"
          >
            Refresh
          </button>

          <button
            className="rounded-full border border-[color:var(--accent-copper,#f97316)]/80 bg-gradient-to-r from-black/80 via-[color:var(--accent-copper,#f97316)]/15 to-black/80 px-4 py-2 text-sm font-semibold text-neutral-50 shadow-[0_12px_30px_rgba(0,0,0,0.9)] backdrop-blur-md hover:border-[color:var(--accent-copper-light,#fed7aa)] disabled:opacity-60"
            onClick={() => setOpen(true)}
            disabled={!shopId}
            type="button"
          >
            New PO
          </button>
        </div>
      </div>

      {errorMsg ? (
        <div className={`${panel} mb-4 p-4`}>
          <div className="text-sm text-red-300">{errorMsg}</div>
        </div>
      ) : null}

      {loading ? (
        <div className={`${panel} p-4 text-sm text-neutral-400`}>Loading…</div>
      ) : pos.length === 0 ? (
        <div className={`${panel} p-4 text-sm text-neutral-400`}>
          No purchase orders yet.
        </div>
      ) : (
        <div className={`${panel} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-black/70 via-slate-950/70 to-black/70 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Recent POs
            </div>
            <div className="text-[11px] text-neutral-500">{pos.length} shown</div>
          </div>

          <div className="overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-neutral-400">
                  <th className="p-3">PO</th>
                  <th className="p-3">Supplier</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Created</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pos.map((po) => {
                  const id = po.id as string;
                  const sId = (po.supplier_id as string | null) ?? null;
                  const sName = sId ? supplierNameById.get(sId) ?? sId.slice(0, 8) : "—";
                  const st = (po.status as string | null) ?? "—";

                  return (
                    <tr key={id} className="border-t border-white/5 hover:bg-white/5">
                      <td className="p-3 font-mono text-neutral-100">{id.slice(0, 8)}</td>
                      <td className="p-3 text-neutral-200">{sName}</td>
                      <td className="p-3">
                        <span
                          className={[
                            "inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-medium",
                            statusPill(st),
                          ].join(" ")}
                        >
                          {st}
                        </span>
                      </td>
                      <td className="p-3 text-neutral-300">{fmtDate(po.created_at as string | null)}</td>
                      <td className="p-3 text-right">
                        <Link
                          href={`/parts/po/${id}/receive`}
                          className="inline-flex items-center justify-center rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/40 px-3 py-1.5 text-xs text-neutral-100 hover:border-[color:var(--accent-copper,#f97316)]/70 hover:bg-black/55"
                        >
                          Receive
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New PO Modal */}
      {open ? (
        <div
          className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 p-4"
          onClick={closeModal}
        >
          <div
            className="relative w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`${panel} p-5`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
                    Create
                  </div>
                  <div className="text-xl font-semibold text-white" style={headerFont}>
                    New Purchase Order
                  </div>
                </div>

                <button
                  className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/50 px-3 py-2 text-sm text-neutral-100 hover:border-[color:var(--accent-copper,#f97316)]/70 disabled:opacity-60"
                  onClick={closeModal}
                  disabled={busyCreate}
                  type="button"
                >
                  Close
                </button>
              </div>

              <div className="grid gap-3">
                <div>
                  <div className="mb-1 text-xs text-neutral-400">Supplier (optional)</div>
                  <select
                    className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-2 text-sm text-neutral-100"
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                  >
                    <option value="">— none —</option>
                    {suppliers.map((s) => (
                      <option key={s.id as string} value={s.id as string}>
                        {(s.name as string) ?? String(s.id).slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-xs text-neutral-400">Notes</div>
                  <textarea
                    className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-2 text-sm text-neutral-100"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional notes for this PO…"
                  />
                  <div className="mt-1 text-[11px] text-neutral-500">
                    Tip: keep vendor instructions here (delivery time, core return, etc.).
                  </div>
                </div>

                {errorMsg ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                    {errorMsg}
                  </div>
                ) : null}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/50 px-4 py-2 text-sm text-neutral-100 hover:bg-black/60 disabled:opacity-60"
                    onClick={closeModal}
                    disabled={busyCreate}
                    type="button"
                  >
                    Cancel
                  </button>

                  <button
                    className="rounded-full border border-[color:var(--accent-copper,#f97316)]/80 bg-gradient-to-r from-black/80 via-[color:var(--accent-copper,#f97316)]/15 to-black/80 px-4 py-2 text-sm font-semibold text-neutral-50 shadow-[0_12px_30px_rgba(0,0,0,0.9)] backdrop-blur-md hover:border-[color:var(--accent-copper-light,#fed7aa)] disabled:opacity-60"
                    onClick={() => void createPo()}
                    disabled={!shopId || busyCreate}
                    type="button"
                  >
                    {busyCreate ? "Creating…" : "Create & Receive →"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}