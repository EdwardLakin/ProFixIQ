// app/parts/po/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { v4 as uuidv4 } from "uuid";

type DB = Database;

type PurchaseOrder = DB["public"]["Tables"]["purchase_orders"]["Row"];
type PurchaseOrderInsert = DB["public"]["Tables"]["purchase_orders"]["Insert"];
type Supplier = DB["public"]["Tables"]["suppliers"]["Row"];
type SupplierInsert = DB["public"]["Tables"]["suppliers"]["Insert"];
type PurchaseOrderLineInsert = DB["public"]["Tables"]["purchase_order_lines"]["Insert"];
type Part = DB["public"]["Tables"]["parts"]["Row"];

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
  if (s === "open" || s === "draft") return "border-orange-500/40 bg-orange-500/10 text-orange-200";
  if (s === "cancelled" || s === "canceled") return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  return "border-white/10 bg-white/5 text-neutral-200";
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function toNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

type LineDraft = {
  id: string; // UI-only
  part_id: string | "";
  vendor_part_number: string;
  ordered_qty: number;
  unit_cost: number;
  notes: string;
};

const DEFAULT_SUPPLIER_NAME = "General / Stock";

export default function PurchaseOrdersPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [shopId, setShopId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [parts, setParts] = useState<Part[]>([]);

  const supplierNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliers) {
      const sid = String(s.id);
      const nm = typeof s.name === "string" && s.name.trim() ? s.name.trim() : sid.slice(0, 8);
      m.set(sid, nm);
    }
    return m;
  }, [suppliers]);

  // Modal state
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string>("");
  const [newSupplierName, setNewSupplierName] = useState<string>("");

  const [poNote, setPoNote] = useState<string>("");

  const [lines, setLines] = useState<LineDraft[]>([
    { id: uuidv4(), part_id: "", vendor_part_number: "", ordered_qty: 1, unit_cost: 0, notes: "" },
  ]);

  const [busyCreate, setBusyCreate] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refresh = async (sid: string): Promise<void> => {
    const [poRes, supRes, partsRes] = await Promise.all([
      supabase.from("purchase_orders").select("*").eq("shop_id", sid).order("created_at", { ascending: false }).limit(200),
      supabase.from("suppliers").select("*").eq("shop_id", sid).order("name", { ascending: true }).limit(1000),
      supabase.from("parts").select("*").eq("shop_id", sid).order("name", { ascending: true }).limit(2000),
    ]);

    if (poRes.error) setErrorMsg(poRes.error.message);
    if (supRes.error) setErrorMsg(supRes.error.message);
    if (partsRes.error) setErrorMsg(partsRes.error.message);

    setPOs((poRes.data as PurchaseOrder[]) ?? []);
    setSuppliers((supRes.data as Supplier[]) ?? []);
    setParts((partsRes.data as Part[]) ?? []);
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

  function resetModal(): void {
    setSupplierId("");
    setNewSupplierName("");
    setPoNote("");
    setLines([{ id: uuidv4(), part_id: "", vendor_part_number: "", ordered_qty: 1, unit_cost: 0, notes: "" }]);
    setErrorMsg(null);
  }

  const closeModal = (): void => {
    if (busyCreate) return;
    setOpen(false);
    resetModal();
  };

  function addLine(): void {
    setLines((prev) => [
      ...prev,
      { id: uuidv4(), part_id: "", vendor_part_number: "", ordered_qty: 1, unit_cost: 0, notes: "" },
    ]);
  }

  function removeLine(id: string): void {
    setLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((x) => x.id !== id);
    });
  }

  function updateLine(id: string, patch: Partial<LineDraft>): void {
    setLines((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function validateLines(): string | null {
    const cleaned = lines
      .map((l) => ({
        ...l,
        vendor_part_number: l.vendor_part_number.trim(),
        notes: l.notes.trim(),
      }))
      .filter((l) => l.part_id);

    if (cleaned.length === 0) return null; // allow “header-only” PO

    for (const l of cleaned) {
      if (!isNonEmptyString(l.part_id)) return "Each line must have a part.";
      if (l.ordered_qty <= 0) return "Line qty must be greater than 0.";
      if (l.unit_cost < 0) return "Unit cost cannot be negative.";
    }

    return null;
  }

  async function createSupplier(nameRaw: string): Promise<string> {
    if (!shopId) throw new Error("Missing shop_id.");

    const name = normalizeName(nameRaw);
    const existing = suppliers.find((s) => normalizeName(String(s.name ?? "")) === name);
    if (existing?.id) return String(existing.id);

    const insert: SupplierInsert = {
      id: uuidv4(),
      shop_id: shopId,
      name,
    };

    const { data, error } = await supabase.from("suppliers").insert(insert).select("*").single();
    if (error) throw new Error(error.message);

    const createdId = (data?.id as string | null) ?? null;
    if (!createdId) throw new Error("Supplier create failed.");

    // keep cache in sync
    setSuppliers((prev) => [data as Supplier, ...prev]);

    return createdId;
  }

  async function ensureSupplierIdRequired(): Promise<string> {
    // Your generated types require purchase_orders.Insert.supplier_id: string
    // So this MUST always return a real supplier id.

    // 1) user selected existing
    if (isNonEmptyString(supplierId)) return supplierId.trim();

    // 2) user typed new supplier
    const typed = normalizeName(newSupplierName);
    if (typed) return await createSupplier(typed);

    // 3) fallback default supplier for generic stock POs
    return await createSupplier(DEFAULT_SUPPLIER_NAME);
  }

  const createPo = async (): Promise<void> => {
    if (!shopId || busyCreate) return;

    setBusyCreate(true);
    setErrorMsg(null);

    try {
      const supplierResolved = await ensureSupplierIdRequired();
      const nowIso = new Date().toISOString();

      const fallbackId = uuidv4();

      // NOTE: keep insert aligned to your generated Insert type (no unknown props).
      // If your Insert requires created_at, this satisfies it.
      const insertPo: PurchaseOrderInsert = {
        id: fallbackId,
        shop_id: shopId,
        supplier_id: supplierResolved,
        status: "open" as Status,
        notes: poNote.trim() ? poNote.trim() : null,
        created_at: nowIso,
      };

      const { data: poData, error: poErr } = await supabase.from("purchase_orders").insert(insertPo).select("id").single();
      if (poErr) throw new Error(poErr.message);

      const newPoId = (poData?.id as string | null) ?? fallbackId;

      // Insert PO lines (only those with a selected part)
      const lineError = validateLines();
      if (lineError) throw new Error(lineError);

      const linesToInsert = lines
        .filter((l) => isNonEmptyString(l.part_id))
        .map((l): PurchaseOrderLineInsert => {
          const vendorPn = l.vendor_part_number.trim();
          const notes = l.notes.trim();

          // Map UI fields -> your table fields (per your generated types)
          // purchase_order_lines expects: qty, unit_cost, sku?, description?, received_qty, created_at, etc.
          const descriptionParts: string[] = [];
          if (vendorPn) descriptionParts.push(`Vendor PN: ${vendorPn}`);
          if (notes) descriptionParts.push(notes);

          const description = descriptionParts.length ? descriptionParts.join(" • ") : null;

          return {
            id: uuidv4(),
            po_id: newPoId,
            part_id: String(l.part_id),
            qty: Math.max(0, Math.floor(toNum(l.ordered_qty, 0))),
            unit_cost: Math.max(0, toNum(l.unit_cost, 0)),
            sku: vendorPn ? vendorPn : null,
            description,
            received_qty: 0,
            location_id: null,
            created_at: nowIso,
          };
        });

      if (linesToInsert.length > 0) {
        const { error: lineErr } = await supabase.from("purchase_order_lines").insert(linesToInsert);
        if (lineErr) throw new Error(lineErr.message);
      }

      setOpen(false);
      resetModal();

      await refresh(shopId);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Create PO failed.");
    } finally {
      setBusyCreate(false);
    }
  };

  const pageWrap = "relative p-4 md:p-6 text-white";
  const panel =
    "metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl";
  const headerFont = { fontFamily: "var(--font-blackops), system-ui" } as const;

  return (
    <div className={pageWrap}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.95),#020617_70%)]"
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Parts</div>
          <h1 className="mt-1 text-2xl font-semibold text-white" style={headerFont}>
            Purchase Orders
          </h1>
          <div className="mt-1 text-xs text-neutral-500">Create stock POs, receive, and track partials.</div>
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
        <div className={`${panel} p-4 text-sm text-neutral-400`}>No purchase orders yet.</div>
      ) : (
        <div className={`${panel} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-black/70 via-slate-950/70 to-black/70 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">Recent POs</div>
            <div className="text-[11px] text-neutral-500">{pos.length} shown</div>
          </div>

          <div className="overflow-auto">
            <table className="w-full min-w-[820px] text-sm">
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
                  const id = String(po.id);
                  const sId = String(po.supplier_id);
                  const sName = supplierNameById.get(sId) ?? sId.slice(0, 8);
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
                        <div className="inline-flex items-center gap-2">
                          <Link
                            href={`/parts/po/${id}`}
                            className="inline-flex items-center justify-center rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/40 px-3 py-1.5 text-xs text-neutral-100 hover:border-[color:var(--accent-copper,#f97316)]/70 hover:bg-black/55"
                          >
                            Open
                          </Link>

                          <Link
                            href={`/parts/po/${id}/receive`}
                            className="inline-flex items-center justify-center rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/40 px-3 py-1.5 text-xs text-neutral-100 hover:border-[color:var(--accent-copper,#f97316)]/70 hover:bg-black/55"
                          >
                            Receive
                          </Link>
                        </div>
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
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 p-4" onClick={closeModal}>
          <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className={`${panel} p-5`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Create</div>
                  <div className="text-xl font-semibold text-white" style={headerFont}>
                    New Purchase Order
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">Add header + optional line items for stock ordering.</div>
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

              <div className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs text-neutral-400">Supplier</div>
                    <select
                      className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-2 text-sm text-neutral-100"
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      disabled={busyCreate}
                    >
                      <option value="">— auto: {DEFAULT_SUPPLIER_NAME} —</option>
                      {suppliers.map((s) => (
                        <option key={String(s.id)} value={String(s.id)}>
                          {typeof s.name === "string" && s.name.trim() ? s.name.trim() : String(s.id).slice(0, 8)}
                        </option>
                      ))}
                    </select>

                    <div className="mt-2 text-[11px] text-neutral-500">or create a new supplier name:</div>
                    <input
                      className="mt-1 w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-2 text-sm text-neutral-100 placeholder:text-neutral-600"
                      value={newSupplierName}
                      onChange={(e) => setNewSupplierName(e.target.value)}
                      placeholder="e.g., NAPA / FleetPride / Cummins…"
                      disabled={busyCreate || !!supplierId}
                    />
                    <div className="mt-1 text-[11px] text-neutral-600">
                      If you select a supplier above, this field is ignored.
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-xs text-neutral-400">PO Notes</div>
                    <textarea
                      className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-2 text-sm text-neutral-100 placeholder:text-neutral-600"
                      rows={5}
                      value={poNote}
                      onChange={(e) => setPoNote(e.target.value)}
                      placeholder="Optional notes for this PO (delivery time, core return, account #, etc.)"
                      disabled={busyCreate}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">PO Lines</div>
                      <div className="mt-1 text-[11px] text-neutral-500">
                        Add stock lines now, or you can create header-only and add lines later.
                      </div>
                    </div>

                    <button
                      type="button"
                      className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/50 px-3 py-1.5 text-xs text-neutral-100 hover:border-[color:var(--accent-copper,#f97316)]/70 disabled:opacity-60"
                      onClick={addLine}
                      disabled={busyCreate}
                    >
                      + Add line
                    </button>
                  </div>

                  <div className="overflow-auto">
                    <table className="w-full min-w-[980px] text-sm">
                      <thead>
                        <tr className="text-left text-neutral-400">
                          <th className="p-2">Part</th>
                          <th className="p-2">Vendor Part #</th>
                          <th className="p-2 text-right">Qty</th>
                          <th className="p-2 text-right">Unit Cost</th>
                          <th className="p-2">Line Notes</th>
                          <th className="p-2 text-right"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l) => (
                          <tr key={l.id} className="border-t border-white/10">
                            <td className="p-2">
                              <select
                                className="w-[380px] rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-2 text-xs text-neutral-100"
                                value={l.part_id}
                                onChange={(e) => updateLine(l.id, { part_id: e.target.value })}
                                disabled={busyCreate}
                              >
                                <option value="">— select —</option>
                                {parts.map((p) => (
                                  <option key={String(p.id)} value={String(p.id)}>
                                    {p.sku
                                      ? `${String(p.sku)} — ${String(p.name ?? "")}`
                                      : String(p.name ?? String(p.id).slice(0, 8))}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="p-2">
                              <input
                                className="w-[220px] rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-2 text-xs text-neutral-100 placeholder:text-neutral-600"
                                value={l.vendor_part_number}
                                onChange={(e) => updateLine(l.id, { vendor_part_number: e.target.value })}
                                placeholder="Vendor / catalog #"
                                disabled={busyCreate}
                              />
                            </td>

                            <td className="p-2 text-right">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                className="w-[120px] rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-2 text-right text-xs text-neutral-100"
                                value={String(l.ordered_qty)}
                                onChange={(e) =>
                                  updateLine(l.id, { ordered_qty: Math.max(0, Math.floor(toNum(e.target.value, 0))) })
                                }
                                disabled={busyCreate}
                              />
                            </td>

                            <td className="p-2 text-right">
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                className="w-[140px] rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-2 text-right text-xs text-neutral-100"
                                value={String(l.unit_cost)}
                                onChange={(e) => updateLine(l.id, { unit_cost: Math.max(0, toNum(e.target.value, 0)) })}
                                disabled={busyCreate}
                              />
                            </td>

                            <td className="p-2">
                              <input
                                className="w-[280px] rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-2 text-xs text-neutral-100 placeholder:text-neutral-600"
                                value={l.notes}
                                onChange={(e) => updateLine(l.id, { notes: e.target.value })}
                                placeholder="Notes (core, urgency, etc.)"
                                disabled={busyCreate}
                              />
                            </td>

                            <td className="p-2 text-right">
                              <button
                                type="button"
                                className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-neutral-100 hover:bg-white/5 disabled:opacity-60"
                                onClick={() => removeLine(l.id)}
                                disabled={busyCreate || lines.length <= 1}
                                title={lines.length <= 1 ? "Keep at least one row" : "Remove line"}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-2 text-[11px] text-neutral-600">
                    Tip: If you don’t know the part yet, you can create the PO header only and add lines later from the PO page.
                  </div>
                </div>

                {errorMsg ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{errorMsg}</div>
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
                    {busyCreate ? "Creating…" : "Create PO"}
                  </button>
                </div>

                <div className="text-[11px] text-neutral-600">
                  After creation, you’ll see it in the list. Click <span className="text-neutral-200">Open</span> to review/edit lines, or{" "}
                  <span className="text-neutral-200">Receive</span> to receive items.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}