// app/parts/po/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type PurchaseOrderRow = DB["public"]["Tables"]["purchase_orders"]["Row"];
type PurchaseOrderUpdate = DB["public"]["Tables"]["purchase_orders"]["Update"];

type SupplierRow = DB["public"]["Tables"]["suppliers"]["Row"];
type SupplierInsert = DB["public"]["Tables"]["suppliers"]["Insert"];

type PartRow = DB["public"]["Tables"]["parts"]["Row"];

type POLineRow = DB["public"]["Tables"]["purchase_order_lines"]["Row"];
type POLineInsert = DB["public"]["Tables"]["purchase_order_lines"]["Insert"];

type Status = PurchaseOrderRow["status"];

function n(v: unknown): number {
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : 0;
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function statusPill(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s === "received") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (s === "receiving") return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  if (s === "ordered") return "border-indigo-500/40 bg-indigo-500/10 text-indigo-200";
  if (s === "open" || s === "draft") return "border-[#8b5a2b]/50 bg-[#8b5a2b]/10 text-[#f1c08a]";
  if (s === "cancelled" || s === "canceled") return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  return "border-white/10 bg-white/5 text-neutral-200";
}

type UiLine = POLineRow & {
  ui_part_name: string;
  ui_sku: string;
  ui_ordered: number;
  ui_received: number;
  ui_unit_cost: number;
};

export default function PurchaseOrderDetailPage(): JSX.Element {
  const { id: poId } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState<boolean>(true);

  const [po, setPo] = useState<PurchaseOrderRow | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [lines, setLines] = useState<UiLine[]>([]);

  const [busySaveHeader, setBusySaveHeader] = useState<boolean>(false);
  const [busyAddLine, setBusyAddLine] = useState<boolean>(false);

  // Header edit state
  const [supplierId, setSupplierId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [status, setStatus] = useState<string>("open");

  // Inline supplier create
  const [newSupplierName, setNewSupplierName] = useState<string>("");
  const [creatingSupplier, setCreatingSupplier] = useState<boolean>(false);

  // Add line form (generic stock PO)
  const [linePartId, setLinePartId] = useState<string>("");
  const [lineOrderedQty, setLineOrderedQty] = useState<number>(1);
  const [lineUnitCost, setLineUnitCost] = useState<number>(0);

  const supplierNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliers) {
      const id = String(s.id);
      const nm = typeof s.name === "string" && s.name.trim() ? s.name.trim() : id.slice(0, 8);
      m.set(id, nm);
    }
    return m;
  }, [suppliers]);

  const partById = useMemo(() => {
    const m = new Map<string, PartRow>();
    for (const p of parts) m.set(String(p.id), p);
    return m;
  }, [parts]);

  const totals = useMemo(() => {
    const ordered = lines.reduce((acc, l) => acc + n(l.ui_ordered), 0);
    const received = lines.reduce((acc, l) => acc + n(l.ui_received), 0);
    const remaining = Math.max(0, ordered - received);

    const cost = lines.reduce((acc, l) => acc + n(l.ui_ordered) * n(l.ui_unit_cost), 0);

    return { ordered, received, remaining, cost };
  }, [lines]);

  function uiMapLine(row: POLineRow): UiLine {
    const raw = row as unknown as {
      ordered_qty?: unknown;
      qty_ordered?: unknown;
      qty?: unknown;
      received_qty?: unknown;
      qty_received?: unknown;
      unit_cost?: unknown;
      cost?: unknown;
    };

    const partId = String((row as unknown as { part_id?: unknown }).part_id ?? "");
    const p = partId ? partById.get(partId) ?? null : null;

    const ordered =
      raw.ordered_qty != null
        ? n(raw.ordered_qty)
        : raw.qty_ordered != null
          ? n(raw.qty_ordered)
          : raw.qty != null
            ? n(raw.qty)
            : 0;

    const received =
      raw.received_qty != null ? n(raw.received_qty) : raw.qty_received != null ? n(raw.qty_received) : 0;

    const unitCost = raw.unit_cost != null ? n(raw.unit_cost) : raw.cost != null ? n(raw.cost) : 0;

    return {
      ...row,
      ui_part_name: p?.name ? String(p.name) : partId ? partId.slice(0, 8) : "—",
      ui_sku: p?.sku ? String(p.sku) : "",
      ui_ordered: ordered,
      ui_received: received,
      ui_unit_cost: unitCost,
    };
  }

  async function load(): Promise<void> {
    if (!poId) return;

    setLoading(true);

    const { data: poRow, error: poErr } = await supabase.from("purchase_orders").select("*").eq("id", poId).maybeSingle();

    if (poErr) {
      toast.error(poErr.message);
      setPo(null);
      setLines([]);
      setLoading(false);
      return;
    }

    if (!poRow) {
      setPo(null);
      setLines([]);
      setLoading(false);
      return;
    }

    setPo(poRow as PurchaseOrderRow);

    const shopId = (poRow as unknown as { shop_id?: unknown }).shop_id as string | null;
    if (!shopId) {
      setSuppliers([]);
      setParts([]);
      setLines([]);
      setLoading(false);
      return;
    }

    const [supRes, partsRes, linesRes] = await Promise.all([
      supabase.from("suppliers").select("*").eq("shop_id", shopId).order("name", { ascending: true }).limit(1000),
      supabase.from("parts").select("*").eq("shop_id", shopId).order("name", { ascending: true }).limit(2000),
      supabase.from("purchase_order_lines").select("*").eq("po_id", poId).order("created_at", { ascending: true }),
    ]);

    if (supRes.error) toast.error(supRes.error.message);
    if (partsRes.error) toast.error(partsRes.error.message);
    if (linesRes.error) toast.error(linesRes.error.message);

    const supList = (supRes.data ?? []) as SupplierRow[];
    const partList = (partsRes.data ?? []) as PartRow[];
    const lineList = (linesRes.data ?? []) as POLineRow[];

    setSuppliers(supList);
    setParts(partList);

    // initialize header edit state
    const sid = ((poRow as unknown as { supplier_id?: unknown }).supplier_id as string | null) ?? "";
    setSupplierId(sid);
    setNotes(((poRow as unknown as { notes?: unknown }).notes as string | null) ?? "");
    setStatus(String(((poRow as unknown as { status?: unknown }).status as string | null) ?? "open"));

    // map lines after parts loaded
    const partMap = new Map<string, PartRow>();
    for (const p of partList) partMap.set(String(p.id), p);
    const mapped = lineList.map((r) => {
      const raw = r as unknown as { part_id?: unknown };
      const pid = String(raw.part_id ?? "");
      const p = pid ? partMap.get(pid) ?? null : null;

      const rr = r as unknown as {
        ordered_qty?: unknown;
        qty_ordered?: unknown;
        qty?: unknown;
        received_qty?: unknown;
        qty_received?: unknown;
        unit_cost?: unknown;
        cost?: unknown;
      };

      const ordered =
        rr.ordered_qty != null
          ? n(rr.ordered_qty)
          : rr.qty_ordered != null
            ? n(rr.qty_ordered)
            : rr.qty != null
              ? n(rr.qty)
              : 0;

      const received = rr.received_qty != null ? n(rr.received_qty) : rr.qty_received != null ? n(rr.qty_received) : 0;
      const unitCost = rr.unit_cost != null ? n(rr.unit_cost) : rr.cost != null ? n(rr.cost) : 0;

      return {
        ...r,
        ui_part_name: p?.name ? String(p.name) : pid ? pid.slice(0, 8) : "—",
        ui_sku: p?.sku ? String(p.sku) : "",
        ui_ordered: ordered,
        ui_received: received,
        ui_unit_cost: unitCost,
      } as UiLine;
    });

    setLines(mapped);

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  async function createSupplierInline(): Promise<void> {
    if (!po) return;
    const shopId = (po.shop_id as string | null) ?? null;
    if (!shopId) return;

    const nm = normalizeName(newSupplierName);
    if (!nm) {
      toast.error("Enter a supplier name.");
      return;
    }

    if (creatingSupplier) return;
    setCreatingSupplier(true);

    try {
      const insert: SupplierInsert = {
        shop_id: shopId,
        name: nm,
      } as SupplierInsert;

      const { data, error } = await supabase.from("suppliers").insert(insert).select("*").single();

      if (error) {
        toast.error(error.message);
        return;
      }

      const created = data as SupplierRow;
      setSuppliers((prev) => {
        const next = [...prev, created];
        next.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
        return next;
      });

      setSupplierId(String(created.id));
      setNewSupplierName("");
      toast.success("Supplier created.");
    } finally {
      setCreatingSupplier(false);
    }
  }

  async function saveHeader(): Promise<void> {
    if (!po) return;
    if (busySaveHeader) return;

    const sid = supplierId.trim();
    if (!sid) {
      toast.error("Select a supplier (or create one).");
      return;
    }

    setBusySaveHeader(true);
    try {
      const patch: PurchaseOrderUpdate = {
        supplier_id: sid,
        status: status as Status,
        notes: notes.trim() ? notes.trim() : null,
      } as PurchaseOrderUpdate;

      const { error } = await supabase.from("purchase_orders").update(patch).eq("id", po.id);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("PO updated.");
      await load();
    } finally {
      setBusySaveHeader(false);
    }
  }

  async function addLine(): Promise<void> {
    if (!po) return;
    if (busyAddLine) return;

    const pid = linePartId.trim();
    if (!pid) {
      toast.error("Select a part.");
      return;
    }
    const qty = Math.max(0, Math.floor(n(lineOrderedQty)));
    if (!qty || qty <= 0) {
      toast.error("Enter a quantity > 0.");
      return;
    }

    setBusyAddLine(true);
    try {
      // NOTE: your schema might name these columns differently.
      // We use the strongly-typed Insert shape, then fill common fields.
      // If your generated types don't include ordered_qty/unit_cost, rename them to match your schema.
      const insert = {
        po_id: po.id,
        part_id: pid,
        ordered_qty: qty,
        unit_cost: n(lineUnitCost),
      } as unknown as POLineInsert;

      const { data, error } = await supabase.from("purchase_order_lines").insert(insert).select("*").single();

      if (error) {
        toast.error(error.message);
        return;
      }

      const created = data as POLineRow;

      // Add optimistically to UI
      const mapped = uiMapLine(created);
      setLines((prev) => [...prev, mapped]);

      setLinePartId("");
      setLineOrderedQty(1);
      setLineUnitCost(0);

      toast.success("Line added.");
    } finally {
      setBusyAddLine(false);
    }
  }

  async function deleteLine(lineId: string): Promise<void> {
    const ok = window.confirm("Remove this PO line?");
    if (!ok) return;

    const { data, error } = await supabase.from("purchase_order_lines").delete().eq("id", lineId).select("id").maybeSingle();

    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data?.id) {
      toast.error("Not permitted to delete this line (RLS).");
      return;
    }

    setLines((prev) => prev.filter((x) => String(x.id) !== String(lineId)));
    toast.success("Line removed.");
  }

  const panel =
    "rounded-2xl border border-white/10 bg-neutral-950/35 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]";
  const header =
    "border-b border-white/10 bg-gradient-to-b from-white/5 to-transparent px-5 py-4";
  const input =
    "w-full rounded-xl border border-white/10 bg-neutral-950/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#8b5a2b]/35";
  const select =
    "w-full rounded-xl border border-white/10 bg-neutral-950/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#8b5a2b]/35";

  const btnBase =
    "inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-60";
  const btnGhost = `${btnBase} border-white/10 bg-neutral-950/20 hover:bg-white/5`;
  const btnCopper = `${btnBase} border-[#8b5a2b]/60 text-[#c88a4d] bg-neutral-950/20 hover:bg-[#8b5a2b]/10`;
  const btnDanger = `${btnBase} border-red-900/60 bg-neutral-950/20 text-red-200 hover:bg-red-900/20`;

  if (loading) {
    return (
      <div className="p-6 text-white">
        <div className={`${panel} p-4 text-neutral-300`}>Loading…</div>
      </div>
    );
  }

  if (!po) {
    return (
      <div className="p-6 text-white">
        <button className={btnGhost} onClick={() => router.back()} type="button">
          ← Back
        </button>
        <div className={`${panel} mt-4 p-4 text-neutral-300`}>PO not found / not visible.</div>
      </div>
    );
  }

  const poSupplierId = supplierId || ((po.supplier_id as string | null) ?? "");
  const supplierName = poSupplierId ? supplierNameById.get(poSupplierId) ?? poSupplierId.slice(0, 8) : "—";
  const poStatus = (status || (po.status as string | null) || "open").toLowerCase();

  return (
    <div className="space-y-4 p-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button className={btnGhost} onClick={() => router.back()} type="button">
            ← Back
          </button>

          <Link className={btnGhost} href={`/parts/po/${String(po.id)}/receive`}>
            Receive
          </Link>
        </div>

        <button className={btnCopper} onClick={() => void saveHeader()} disabled={busySaveHeader} type="button">
          {busySaveHeader ? "Saving…" : "Save PO"}
        </button>
      </div>

      <div className={panel}>
        <div className={header}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">Purchase Order</div>
              <div className="mt-1 truncate text-2xl font-semibold text-white">
                PO <span className="text-[#c88a4d]">{String(po.id).slice(0, 8)}</span>
              </div>
              <div className="mt-2 text-sm text-neutral-400">
                Supplier: <span className="text-neutral-200">{supplierName}</span>
                <span className="mx-2 text-neutral-600">·</span>
                Status:{" "}
                <span className={["inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-medium", statusPill(poStatus)].join(" ")}>
                  {poStatus}
                </span>
                <span className="mx-2 text-neutral-600">·</span>
                Created: <span className="text-neutral-200">{fmtDate(po.created_at as string | null)}</span>
              </div>
            </div>

            <div className="grid w-full max-w-md gap-2">
              <div>
                <div className="mb-1 text-xs text-neutral-400">Supplier</div>
                <select className={select} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">— select —</option>
                  {suppliers.map((s) => (
                    <option key={String(s.id)} value={String(s.id)}>
                      {String(s.name ?? String(s.id).slice(0, 8))}
                    </option>
                  ))}
                </select>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className={`${input} flex-1`}
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    placeholder="New supplier name…"
                  />
                  <button
                    className={btnGhost}
                    onClick={() => void createSupplierInline()}
                    disabled={creatingSupplier || !newSupplierName.trim()}
                    type="button"
                  >
                    {creatingSupplier ? "Creating…" : "Add supplier"}
                  </button>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-neutral-400">Status</div>
                  <select className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="open">open</option>
                    <option value="ordered">ordered</option>
                    <option value="receiving">receiving</option>
                    <option value="received">received</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-xs text-neutral-400">Notes</div>
                  <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Vendor instructions / notes…" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-neutral-950/20 p-4">
              <div className="text-xs text-neutral-400">Total Ordered</div>
              <div className="mt-1 text-2xl font-semibold">{totals.ordered}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-neutral-950/20 p-4">
              <div className="text-xs text-neutral-400">Total Received</div>
              <div className="mt-1 text-2xl font-semibold">{totals.received}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-neutral-950/20 p-4">
              <div className="text-xs text-neutral-400">Remaining</div>
              <div className="mt-1 text-2xl font-semibold text-[#c88a4d]">{totals.remaining}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-neutral-950/20 p-4">
              <div className="text-xs text-neutral-400">Est. Cost</div>
              <div className="mt-1 text-2xl font-semibold">{totals.cost.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-neutral-950/20 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-white">Add PO line (stock order)</div>
                <div className="mt-1 text-xs text-neutral-500">
                  Track what the PO is for: part, ordered qty, unit cost. Receiving updates received qty on lines.
                </div>
              </div>

              <button className={btnCopper} onClick={() => void addLine()} disabled={busyAddLine} type="button">
                {busyAddLine ? "Adding…" : "Add line"}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <div className="mb-1 text-xs text-neutral-400">Part</div>
                <select
                  className={select}
                  value={linePartId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setLinePartId(next);
                    const p = next ? partById.get(String(next)) ?? null : null;
                    if (p?.cost != null) setLineUnitCost(n(p.cost));
                  }}
                >
                  <option value="">— select —</option>
                  {parts.map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      {p.sku ? `${String(p.sku)} — ${String(p.name)}` : String(p.name ?? String(p.id).slice(0, 8))}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 text-xs text-neutral-400">Qty ordered</div>
                <input
                  className={input}
                  type="number"
                  min={1}
                  step={1}
                  value={String(lineOrderedQty)}
                  onChange={(e) => setLineOrderedQty(Math.max(1, Math.floor(n(e.target.value))))}
                />
              </div>

              <div>
                <div className="mb-1 text-xs text-neutral-400">Unit cost</div>
                <input
                  className={input}
                  type="number"
                  min={0}
                  step={0.01}
                  value={String(lineUnitCost)}
                  onChange={(e) => setLineUnitCost(Math.max(0, n(e.target.value)))}
                />
              </div>

              {linePartId ? (
                <div className="md:col-span-4 text-[11px] text-neutral-500">
                  Part #: <span className="text-neutral-200">{String(partById.get(linePartId)?.sku ?? "—")}</span>
                  <span className="mx-2 text-neutral-600">·</span>
                  Name:{" "}
                  <span className="text-neutral-200">{String(partById.get(linePartId)?.name ?? "—")}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/20">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">PO Lines</div>
              <div className="text-[11px] text-neutral-500">{lines.length} lines</div>
            </div>

            <div className="overflow-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="text-left text-neutral-400">
                  <tr>
                    <th className="p-3">Part #</th>
                    <th className="p-3">Part</th>
                    <th className="p-3 text-right">Ordered</th>
                    <th className="p-3 text-right">Received</th>
                    <th className="p-3 text-right">Remaining</th>
                    <th className="p-3 text-right">Unit cost</th>
                    <th className="p-3 text-right">Line cost</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {lines.length === 0 ? (
                    <tr className="border-t border-white/10">
                      <td className="p-4 text-neutral-500" colSpan={8}>
                        No PO lines yet. Add a line above.
                      </td>
                    </tr>
                  ) : (
                    lines.map((l) => {
                      const ordered = n(l.ui_ordered);
                      const received = n(l.ui_received);
                      const remaining = Math.max(0, ordered - received);
                      const unitCost = n(l.ui_unit_cost);
                      const lineCost = ordered * unitCost;

                      return (
                        <tr key={String(l.id)} className="border-t border-white/10 hover:bg-white/5">
                          <td className="p-3 font-mono text-neutral-200">{l.ui_sku || "—"}</td>
                          <td className="p-3 text-neutral-200">{l.ui_part_name}</td>
                          <td className="p-3 text-right tabular-nums text-neutral-200">{ordered}</td>
                          <td className="p-3 text-right tabular-nums text-neutral-200">{received}</td>
                          <td className="p-3 text-right tabular-nums text-[#c88a4d]">{remaining}</td>
                          <td className="p-3 text-right tabular-nums text-neutral-200">{unitCost.toFixed(2)}</td>
                          <td className="p-3 text-right tabular-nums text-neutral-200">{lineCost.toFixed(2)}</td>
                          <td className="p-3 text-right">
                            <button className={btnDanger} onClick={() => void deleteLine(String(l.id))} type="button">
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-white/10 px-4 py-3 text-[11px] text-neutral-500">
              Receiving is done on the <span className="text-neutral-200">Receive PO</span> page and should increment the line’s received qty.
              If your line columns are named differently, we’ll rename the insert + UI mapping to match your schema.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}