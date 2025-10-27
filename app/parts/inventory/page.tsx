"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { v4 as uuidv4 } from "uuid";

/* ----------------------------- Types ----------------------------- */

type DB = Database;
type Part = DB["public"]["Tables"]["parts"]["Row"];
type PartInsert = DB["public"]["Tables"]["parts"]["Insert"];
type PartUpdate = DB["public"]["Tables"]["parts"]["Update"];
type StockLoc = DB["public"]["Tables"]["stock_locations"]["Row"];
type StockMove = DB["public"]["Tables"]["stock_moves"]["Row"];

// app-side view of the enum
type StockMoveReason = "receive" | "adjust" | "consume" | "transfer";

/* --------------------------- UI helpers -------------------------- */

function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
}) {
  const { open, title, onClose, children, footer, widthClass = "max-w-xl" } = props;
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className={`w-full ${widthClass} rounded border border-orange-500 bg-neutral-950 p-4 text-white shadow-xl`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div>{children}</div>
        {footer ? <div className="mt-4">{footer}</div> : null}
      </div>
    </div>
  );
}

function TextField(props: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const { label, value, placeholder, onChange } = props;
  return (
    <div>
      <div className="mb-1 text-xs text-neutral-400">{label}</div>
      <input
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: number | "";
  min?: number;
  step?: number;
  onChange: (v: number | "") => void;
}) {
  const { label, value, min = 0, step = 0.01, onChange } = props;
  return (
    <div>
      <div className="mb-1 text-xs text-neutral-400">{label}</div>
      <input
        type="number"
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
        value={value === "" ? "" : value}
        min={min}
        step={step}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? "" : Number(raw));
        }}
      />
    </div>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const { label, value, options, onChange } = props;
  return (
    <div>
      <div className="mb-1 text-xs text-neutral-400">{label}</div>
      <select
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------------------- CSV parsing helper ---------------------- */

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        row.push(cell.trim());
        cell = "";
      } else if (ch === "\n") {
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = "";
      } else if (ch !== "\r") {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.length > 0 && r.some((c) => c.length > 0));
}

/* ------------------------- RPC helper -------------------------- */
/** First tries the 6-arg function; if PostgREST schema cache hasn’t
 *  picked it up yet, falls back to the 5-arg legacy shape.
 *  No `any` used (only `unknown`→concrete type assertions).
 */
async function applyStockMoveRPC(
  supabase: ReturnType<typeof createClientComponentClient<DB>>,
  args: {
    p_part: string;
    p_loc: string;
    p_qty: number;
    p_reason: StockMoveReason;
    p_ref_kind: string;
    p_ref_id?: string | null;
  },
): Promise<string> {
  // The “official” typed args from your generated DB types
  type FnArgs = DB["public"]["Functions"]["apply_stock_move"]["Args"];
  type FnRet = DB["public"]["Functions"]["apply_stock_move"]["Returns"];

  // 6-arg payload (include p_ref_id only when defined to placate strict arg shapes)
  const payload6 = {
    p_part: args.p_part,
    p_loc: args.p_loc,
    p_qty: args.p_qty,
    p_reason: args.p_reason as unknown as FnArgs extends { p_reason: infer R } ? R : never,
    p_ref_kind: args.p_ref_kind,
    ...(args.p_ref_id !== undefined ? { p_ref_id: args.p_ref_id } : {}),
  } as unknown as FnArgs;

  // Try 6-arg first
  let call = await supabase.rpc("apply_stock_move", payload6);
  if (!call.error && call.data) return call.data as FnRet;

  // If it’s a schema-cache shape error, fall back to 5-arg
  const msg = (call.error?.message ?? "").toLowerCase();
  const looksLikeShapeIssue =
    msg.includes("could not find the function") ||
    msg.includes("schema cache") ||
    msg.includes("function apply_stock_move(");

  if (!looksLikeShapeIssue) throw new Error(call.error?.message ?? "apply_stock_move failed");

  // 5-arg legacy payload (no p_ref_id)
  const payload5 = {
    p_part: args.p_part,
    p_loc: args.p_loc,
    p_qty: args.p_qty,
    p_reason: args.p_reason as unknown as FnArgs extends { p_reason: infer R } ? R : never,
    p_ref_kind: args.p_ref_kind,
  } as unknown as FnArgs;

  const call5 = await supabase.rpc("apply_stock_move", payload5);
  if (!call5.error && call5.data) return call5.data as FnRet;

  throw new Error(call5.error?.message ?? "apply_stock_move failed");
}

/* ---------------------------- Page ---------------------------- */

export default function InventoryPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shopId, setShopId] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // stock locations
  const [locs, setLocs] = useState<StockLoc[]>([]);

  // on-hand map: partId -> total qty
  const [onHand, setOnHand] = useState<Record<string, number>>({});
  // per-location detail modal
  const [ohOpen, setOhOpen] = useState<boolean>(false);
  const [ohForPart, setOhForPart] = useState<Part | null>(null);
  const [ohLines, setOhLines] = useState<{ location: string; qty: number }[]>([]);

  // add modal
  const [addOpen, setAddOpen] = useState<boolean>(false);
  const [name, setName] = useState<string>("");
  const [sku, setSku] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [price, setPrice] = useState<number | "">("");

  // initial receive (optional) for Add
  const [initLoc, setInitLoc] = useState<string>("");
  const [initQty, setInitQty] = useState<number | "">(""); // allow empty

  // edit modal
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [editPart, setEditPart] = useState<Part | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editSku, setEditSku] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editPrice, setEditPrice] = useState<number | "">("");

  // receive modal (standalone quick receive)
  const [recvOpen, setRecvOpen] = useState<boolean>(false);
  const [recvPart, setRecvPart] = useState<Part | null>(null);
  const [recvLoc, setRecvLoc] = useState<string>("");
  const [recvQty, setRecvQty] = useState<number | "">(""); // allow empty

  // CSV Import
  const [csvOpen, setCsvOpen] = useState<boolean>(false);
  const [csvText, setCsvText] = useState<string>("");
  const [csvRows, setCsvRows] = useState<
    { name: string; sku?: string; category?: string; price?: number; qty?: number }[]
  >([]);
  const [csvPreview, setCsvPreview] = useState<boolean>(false);
  const [csvDefaultLoc, setCsvDefaultLoc] = useState<string>("");

  // ---------- on-hand loader (pass sid directly; avoids first-render zeros)
  const loadOnHand = useCallback(
    async (sid: string, partIds: string[]) => {
      if (!partIds.length) {
        setOnHand({});
        return;
      }
      const { data, error } = await supabase
        .from("stock_moves")
        .select("part_id, qty_change")
        .in("part_id", partIds)
        .eq("shop_id", sid);

      if (error || !data) {
        setOnHand({});
        return;
      }

      const totals: Record<string, number> = {};
      (data as StockMove[]).forEach((m) => {
        const delta = Number(m.qty_change) || 0;
        totals[m.part_id] = (totals[m.part_id] ?? 0) + delta;
      });
      setOnHand(totals);
    },
    [supabase],
  );

  const load = async (sid: string) => {
    setLoading(true);
    const base = supabase
      .from("parts")
      .select("*")
      .eq("shop_id", sid)
      .order("name", { ascending: true });

    const { data, error } = await (search.trim()
      ? base.or(
          [
            `name.ilike.%${search}%`,
            `sku.ilike.%${search}%`,
            `category.ilike.%${search}%`,
          ].join(","),
        )
      : base);

    const partRows = (!error && (data as Part[])) || [];
    setParts(partRows);
    setLoading(false);

    void loadOnHand(sid, partRows.map((p) => p.id));
  };

  // --- on-hand detail (per-location)
  const openOnHandDetail = async (p: Part) => {
    setOhForPart(p);
    const { data, error } = await supabase
      .from("stock_moves")
      .select("location_id, qty_change")
      .eq("part_id", p.id)
      .eq("shop_id", shopId);

    if (error || !data) {
      setOhLines([]);
      setOhOpen(true);
      return;
    }

    const byLoc: Record<string, number> = {};
    (data as StockMove[]).forEach((r) => {
      const loc = r.location_id as string;
      const q = Number(r.qty_change) || 0;
      byLoc[loc] = (byLoc[loc] ?? 0) + q;
    });

    const lines = locs
      .map((l) => ({
        location: `${l.code ?? "LOC"} — ${l.name ?? ""}`,
        qty: byLoc[l.id] ?? 0,
      }))
      .filter((x) => x.qty !== 0);

    setOhLines(lines);
    setOhOpen(true);
  };

  /* boot */
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      if (!uid) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", uid)
        .maybeSingle();

      const sid = (prof?.shop_id as string) || "";
      setShopId(sid);
      if (!sid) return;

      const { data: l } = await supabase
        .from("stock_locations")
        .select("*")
        .eq("shop_id", sid)
        .order("code");

      const locRows = (l as StockLoc[]) ?? [];
      setLocs(locRows);

      const main = locRows.find((x) => (x.code ?? "").toUpperCase() === "MAIN");
      if (main) {
        setInitLoc(main.id);
        setRecvLoc(main.id);
        setCsvDefaultLoc(main.id);
      }

      await load(sid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  /* refetch on search */
  useEffect(() => {
    if (shopId) void load(shopId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, shopId]);

  /* ----------------------- CRUD handlers ----------------------- */

  const createPart = async () => {
    if (!shopId || !name.trim()) return;

    const id = uuidv4();
    const insert: PartInsert = {
      id,
      shop_id: shopId,
      name: name.trim(),
      sku: sku.trim() ? sku.trim() : undefined,
      category: category.trim() ? category.trim() : undefined,
      price: typeof price === "number" ? price : undefined,
    };

    const { error } = await supabase.from("parts").insert(insert);
    if (error) {
      alert(error.message);
      return;
    }

    // optional initial receive
    if (initLoc && typeof initQty === "number" && initQty > 0) {
      try {
        await applyStockMoveRPC(supabase, {
          p_part: id,
          p_loc: initLoc,
          p_qty: initQty,
          p_reason: "receive",
          p_ref_kind: "manual_receive",
          p_ref_id: null,
        });
      } catch (e: any) {
        alert(`Part created, but stock receive failed: ${e.message ?? e}`);
      }
    }

    setAddOpen(false);
    setName("");
    setSku("");
    setCategory("");
    setPrice("");
    setInitQty("");
    await load(shopId);
  };

  const openEdit = (p: Part) => {
    setEditPart(p);
    setEditName(p.name ?? "");
    setEditSku(p.sku ?? "");
    setEditCategory(p.category ?? "");
    setEditPrice(typeof p.price === "number" ? p.price : "");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editPart?.id) return;

    const patch: PartUpdate = {
      name: editName.trim() ? editName.trim() : undefined,
      sku: editSku.trim() ? editSku.trim() : undefined,
      category: editCategory.trim() ? editCategory.trim() : undefined,
      price: typeof editPrice === "number" ? editPrice : undefined,
    };

    const { error } = await supabase.from("parts").update(patch).eq("id", editPart.id);
    if (error) {
      alert(error.message);
      return;
    }

    setEditOpen(false);
    await load(shopId);
  };

  const openReceive = (p: Part) => {
    setRecvPart(p);
    setRecvQty("");
    setRecvOpen(true);
  };

  const applyReceive = async () => {
    if (!recvPart?.id || !recvLoc || typeof recvQty !== "number" || recvQty <= 0) return;
    try {
      await applyStockMoveRPC(supabase, {
        p_part: recvPart.id,
        p_loc: recvLoc,
        p_qty: recvQty,
        p_reason: "receive",
        p_ref_kind: "manual_receive",
        p_ref_id: null,
      });
      setRecvOpen(false);
      await load(shopId);
    } catch (e: any) {
      alert(e.message ?? String(e));
    }
  };

  /* -------------------------- CSV Import -------------------------- */

  const parseAndPreviewCSV = (raw: string) => {
    const rows = parseCSV(raw);
    if (!rows.length) {
      setCsvRows([]);
      setCsvPreview(false);
      return;
    }
    const header = rows[0].map((h) => h.toLowerCase().trim());
    const idx = {
      name: header.indexOf("name"),
      sku: header.indexOf("sku"),
      category: header.indexOf("category"),
      price: header.indexOf("price"),
      qty: header.indexOf("qty"),
    };

    const out: { name: string; sku?: string; category?: string; price?: number; qty?: number }[] = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const name = idx.name >= 0 ? row[idx.name] : "";
      if (!name) continue;
      const sku = idx.sku >= 0 ? row[idx.sku] : undefined;
      const category = idx.category >= 0 ? row[idx.category] : undefined;
      const priceStr = idx.price >= 0 ? row[idx.price] : undefined;
      const qtyStr = idx.qty >= 0 ? row[idx.qty] : undefined;

      const price = priceStr && priceStr.length ? Number(priceStr) : undefined;
      const qty = qtyStr && qtyStr.length ? Number(qtyStr) : undefined;

      out.push({
        name,
        sku: sku && sku.length ? sku : undefined,
        category: category && category.length ? category : undefined,
        price: typeof price === "number" && !Number.isNaN(price) ? price : undefined,
        qty: typeof qty === "number" && !Number.isNaN(qty) ? qty : undefined,
      });
    }

    setCsvRows(out);
    setCsvPreview(true);
  };

  const handleCsvFile = async (file: File) => {
    const text = await file.text();
    setCsvText(text);
    parseAndPreviewCSV(text);
  };

  const runCsvImport = async () => {
    if (!shopId || !csvRows.length) return;

    for (const row of csvRows) {
      let partId: string | null = null;

      if (row.sku) {
        const { data: found } = await supabase
          .from("parts")
          .select("id")
          .eq("shop_id", shopId)
          .eq("sku", row.sku)
          .maybeSingle();
        if (found?.id) partId = found.id;
      }

      if (!partId) {
        const id = uuidv4();
        const insert: PartInsert = {
          id,
          shop_id: shopId,
          name: row.name,
          sku: row.sku || undefined,
          category: row.category || undefined,
          price: typeof row.price === "number" ? row.price : undefined,
        };
        const { error } = await supabase.from("parts").insert(insert);
        if (error) {
          console.warn("Insert failed:", row, error.message);
          continue;
        }
        partId = id;
      } else {
        const patch: PartUpdate = {
          name: row.name || undefined,
          sku: row.sku || undefined,
          category: row.category || undefined,
          price: typeof row.price === "number" ? row.price : undefined,
        };
        await supabase.from("parts").update(patch).eq("id", partId);
      }

      if (partId && csvDefaultLoc && typeof row.qty === "number" && row.qty > 0) {
        try {
          await applyStockMoveRPC(supabase, {
            p_part: partId,
            p_loc: csvDefaultLoc,
            p_qty: row.qty,
            p_reason: "receive",
            p_ref_kind: "csv_import",
            p_ref_id: null,
          });
        } catch (e) {
          console.warn("Stock receive failed for row:", row, e);
        }
      }
    }

    setCsvOpen(false);
    setCsvPreview(false);
    setCsvText("");
    setCsvRows([]);
    await load(shopId);
  };

  /* ----------------------------- UI ----------------------------- */

  return (
    <div className="space-y-4 p-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <div className="flex items-center gap-2">
          <input
            className="w-64 rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
            placeholder="Search name / SKU / category"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="font-header rounded border border-orange-500 px-3 py-1.5 text-sm hover:bg-orange-500/10 disabled:opacity-60"
            onClick={() => setAddOpen(true)}
            disabled={!shopId}
          >
            Add Part
          </button>
          <button
            className="font-header rounded border border-blue-600 px-3 py-1.5 text-sm text-blue-300 hover:bg-blue-900/20 disabled:opacity-60"
            onClick={() => setCsvOpen(true)}
            disabled={!shopId}
          >
            CSV Import
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
          Loading…
        </div>
      ) : parts.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
          No parts yet. Click “Add Part” to create your first item or use CSV Import.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-neutral-800 bg-neutral-900">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900">
              <tr className="text-left text-neutral-400">
                <th className="p-2">Name</th>
                <th className="p-2">SKU</th>
                <th className="p-2">Category</th>
                <th className="p-2">Price</th>
                <th className="p-2">On hand</th>
                <th className="p-2 w-48 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => {
                const total = onHand[p.id] ?? 0;
                return (
                  <tr key={p.id} className="border-t border-neutral-800">
                    <td className="p-2">{p.name}</td>
                    <td className="p-2">{p.sku ?? "—"}</td>
                    <td className="p-2">{p.category ?? "—"}</td>
                    <td className="p-2">
                      {typeof p.price === "number" ? `$${p.price.toFixed(2)}` : "—"}
                    </td>
                    <td className="p-2">
                      <button
                        className="rounded border border-neutral-700 px-2 py-0.5 text-xs hover:bg-neutral-800"
                        onClick={() => openOnHandDetail(p)}
                        title="View per-location balance"
                      >
                        {total}
                      </button>
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-2">
                        <button
                          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                          onClick={() => openEdit(p)}
                        >
                          Edit
                        </button>
                        <button
                          className="rounded border border-blue-600 px-2 py-1 text-xs text-blue-300 hover:bg-blue-900/20"
                          onClick={() => openReceive(p)}
                        >
                          Receive
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Part */}
      <Modal
        open={addOpen}
        title="Add Part"
        onClose={() => setAddOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </button>
            <button
              className="rounded border border-orange-500 px-3 py-1.5 text-sm hover:bg-orange-500/10 disabled:opacity-60"
              onClick={createPart}
              disabled={!name.trim()}
            >
              Save Part
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField label="Name*" value={name} onChange={setName} placeholder="Part name" />
          </div>
          <TextField label="SKU" value={sku} onChange={setSku} placeholder="Optional" />
          <TextField label="Category" value={category} onChange={setCategory} placeholder="Optional" />
          <NumberField label="Price" value={price} onChange={setPrice} />
        </div>

        <div className="mt-4 rounded border border-neutral-800 bg-neutral-900 p-3">
          <div className="mb-2 text-sm font-semibold">Initial Stock (optional)</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Location"
              value={initLoc}
              onChange={setInitLoc}
              options={[
                { value: "", label: "— none —" },
                ...locs.map((l) => ({
                  value: l.id,
                  label: `${l.code ?? "LOC"} — ${l.name ?? ""}`,
                })),
              ]}
            />
            <NumberField
              label="Qty"
              value={initQty}
              min={0}
              step={1}
              onChange={(v) => setInitQty(v === "" ? "" : Math.max(0, v))}
            />
          </div>
        </div>
      </Modal>

      {/* Edit Part */}
      <Modal
        open={editOpen}
        title="Edit Part"
        onClose={() => setEditOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </button>
            <button
              className="rounded border border-orange-500 px-3 py-1.5 text-sm hover:bg-orange-500/10 disabled:opacity-60"
              onClick={saveEdit}
              disabled={!editName.trim()}
            >
              Save Changes
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField label="Name*" value={editName} onChange={setEditName} />
          </div>
          <TextField label="SKU" value={editSku} onChange={setEditSku} />
          <TextField label="Category" value={editCategory} onChange={setEditCategory} />
          <NumberField label="Price" value={editPrice} onChange={setEditPrice} />
        </div>
      </Modal>

      {/* Receive Stock */}
      <Modal
        open={recvOpen}
        title={recvPart ? `Receive — ${recvPart.name}` : "Receive Stock"}
        onClose={() => setRecvOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
              onClick={() => setRecvOpen(false)}
            >
              Cancel
            </button>
            <button
              className="rounded border border-blue-600 px-3 py-1.5 text-sm text-blue-300 hover:bg-blue-900/20 disabled:opacity-60"
              onClick={applyReceive}
              disabled={!recvPart?.id || !recvLoc || typeof recvQty !== "number" || recvQty <= 0}
            >
              Apply Receive
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Location"
            value={recvLoc}
            onChange={setRecvLoc}
            options={locs.map((l) => ({
              value: l.id,
              label: `${l.code ?? "LOC"} — ${l.name ?? ""}`,
            }))}
          />
        <NumberField
            label="Qty"
            value={recvQty}
            min={0}
            step={1}
            onChange={(v) => setRecvQty(v === "" ? "" : Math.max(0, v))}
          />
        </div>
      </Modal>

      {/* On-hand detail */}
      <Modal
        open={ohOpen}
        title={ohForPart ? `On hand — ${ohForPart.name}` : "On hand"}
        onClose={() => setOhOpen(false)}
        widthClass="max-w-lg"
      >
        {ohLines.length === 0 ? (
          <div className="text-sm text-neutral-400">No movement found for this part.</div>
        ) : (
          <div className="rounded border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-400">
                <tr>
                  <th className="p-2">Location</th>
                  <th className="p-2">Qty</th>
                </tr>
              </thead>
              <tbody>
                {ohLines.map((l, i) => (
                  <tr key={i} className="border-t border-neutral-800">
                    <td className="p-2">{l.location}</td>
                    <td className="p-2">{l.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* CSV Import */}
      <Modal
        open={csvOpen}
        title="CSV Import"
        onClose={() => setCsvOpen(false)}
        widthClass="max-w-3xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SelectField
                label="Default receive location (for rows with qty)"
                value={csvDefaultLoc}
                onChange={setCsvDefaultLoc}
                options={[
                  { value: "", label: "— none —" },
                  ...locs.map((l) => ({ value: l.id, label: `${l.code ?? "LOC"} — ${l.name ?? ""}` })),
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
                onClick={() => {
                  setCsvPreview(false);
                  setCsvText("");
                  setCsvRows([]);
                  setCsvOpen(false);
                }}
              >
                Close
              </button>
              <button
                className="rounded border border-blue-600 px-3 py-1.5 text-sm text-blue-300 hover:bg-blue-900/20 disabled:opacity-60"
                onClick={runCsvImport}
                disabled={!csvPreview || csvRows.length === 0}
              >
                Import
              </button>
            </div>
          </div>
        }
      >
        <div className="grid gap-3">
          <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-300">
            Expected headers (case-insensitive): <code>name, sku, category, price, qty</code>. Extra columns are ignored.
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCsvFile(f);
              }}
              className="text-sm"
            />
            <button
              className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
              onClick={() => {
                if (csvText.trim().length) parseAndPreviewCSV(csvText);
              }}
            >
              Parse text
            </button>
          </div>

          <textarea
            rows={8}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
            placeholder={`Paste CSV here… e.g.:
name,sku,category,price,qty
Oil Filter – Ford,OF-FORD-01,Filters,9.95,10
Spark Plug – Iridium,SP-IR-01,Ignition,9.95,24
`}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />

          {csvPreview && (
            <div className="rounded border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="text-left text-neutral-400">
                  <tr>
                    <th className="p-2">Name</th>
                    <th className="p-2">SKU</th>
                    <th className="p-2">Category</th>
                    <th className="p-2">Price</th>
                    <th className="p-2">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.map((r, i) => (
                    <tr key={i} className="border-t border-neutral-800">
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{r.sku ?? "—"}</td>
                      <td className="p-2">{r.category ?? "—"}</td>
                      <td className="p-2">{typeof r.price === "number" ? r.price.toFixed(2) : "—"}</td>
                      <td className="p-2">{typeof r.qty === "number" ? r.qty : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}