// app/parts/inventory/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

  // ---- Theme (glass + burnt copper / metallic; no orange-400/500) ----
  const COPPER_BORDER = "border-[#8b5a2b]/60";
  const COPPER_FOCUS_RING = "focus:ring-2 focus:ring-[#8b5a2b]/35";

  const shell =
    "rounded-xl border border-white/10 bg-neutral-950/35 backdrop-blur-xl " +
    "shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset] text-white";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${widthClass} ${shell} p-4`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className={`rounded-lg border border-white/10 bg-neutral-950/20 px-2 py-1 text-sm hover:bg-white/5 focus:outline-none ${COPPER_FOCUS_RING}`}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div>{children}</div>

        {footer ? (
          <div className={`mt-4 border-t border-white/10 pt-3 ${COPPER_BORDER}`}>{footer}</div>
        ) : null}
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
        className="w-full rounded-lg border border-white/10 bg-neutral-950/40 p-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#8b5a2b]/35"
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
        className="w-full rounded-lg border border-white/10 bg-neutral-950/40 p-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#8b5a2b]/35"
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
        className="w-full rounded-lg border border-white/10 bg-neutral-950/40 p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#8b5a2b]/35"
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

/* ------------------------- Error helper ------------------------- */
function errMsg(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as Record<string, unknown>).message);
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/* ------------------------- RPC helper --------------------------- */
/** Try 6-arg function first; if schema cache hasn’t picked it up,
 * fall back to the 5-arg legacy shape. Strictly typed; ignores return value.
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
): Promise<void> {
  type FnArgs = DB["public"]["Functions"]["apply_stock_move"]["Args"];

  // 6-arg (conditionally include p_ref_id so shapes match)
  const payload6 = {
    p_part: args.p_part,
    p_loc: args.p_loc,
    p_qty: args.p_qty,
    p_reason: args.p_reason as FnArgs extends { p_reason: infer R } ? R : never,
    p_ref_kind: args.p_ref_kind,
    ...(args.p_ref_id !== undefined ? { p_ref_id: args.p_ref_id } : {}),
  } as FnArgs;

  const call6 = await supabase.rpc("apply_stock_move", payload6);
  if (!call6.error) return;

  const msg = (call6.error?.message ?? "").toLowerCase();
  const cacheShapeIssue =
    msg.includes("could not find the function") ||
    msg.includes("schema cache") ||
    msg.includes("function apply_stock_move(");

  if (!cacheShapeIssue) throw new Error(call6.error?.message ?? "apply_stock_move failed");

  // 5-arg (legacy, no p_ref_id)
  const payload5 = {
    p_part: args.p_part,
    p_loc: args.p_loc,
    p_qty: args.p_qty,
    p_reason: args.p_reason as FnArgs extends { p_reason: infer R } ? R : never,
    p_ref_kind: args.p_ref_kind,
  } as FnArgs;

  const call5 = await supabase.rpc("apply_stock_move", payload5);
  if (call5.error) {
    throw new Error(call5.error.message ?? "apply_stock_move failed");
  }
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
  const [initQty, setInitQty] = useState<number | "">("");

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
  const [recvQty, setRecvQty] = useState<number | "">("");

  // CSV Import
  const [csvOpen, setCsvOpen] = useState<boolean>(false);
  const [csvText, setCsvText] = useState<string>("");
  const [csvRows, setCsvRows] = useState<
    { name: string; sku?: string; category?: string; price?: number; qty?: number }[]
  >([]);
  const [csvPreview, setCsvPreview] = useState<boolean>(false);
  const [csvDefaultLoc, setCsvDefaultLoc] = useState<string>("");

  // ---- Theme (glass + burnt copper / metallic; no orange-400/500) ----
  const COPPER_TEXT = "text-[#c88a4d]";
  const COPPER_HOVER_BG = "hover:bg-[#8b5a2b]/10";
  const COPPER_FOCUS_RING = "focus:ring-2 focus:ring-[#8b5a2b]/35";

  const pageWrap = "space-y-4 p-6 text-white";
  const glassCard =
    "rounded-xl border border-white/10 bg-neutral-950/35 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]";
  const glassHeader =
    "bg-gradient-to-b from-white/5 to-transparent border-b border-white/10";

  const inputBase =
    `rounded-lg border bg-neutral-950/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500 border-white/10 focus:outline-none ${COPPER_FOCUS_RING}`;

  const btnBase =
    "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-60";
  const btnGhost = `${btnBase} border-white/10 bg-neutral-950/20 hover:bg-white/5`;
  const btnCopper = `${btnBase} border-white/10 ${COPPER_TEXT} bg-neutral-950/20 ${COPPER_HOVER_BG}`;
  const btnBlue = `${btnBase} border-sky-500/30 bg-sky-950/25 text-sky-200 hover:bg-sky-900/25`;

  const pillBase =
    "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold";
  const pillOk = `${pillBase} border-emerald-500/30 bg-emerald-950/25 text-emerald-200`;
  const pillZero = `${pillBase} border-red-500/30 bg-red-950/35 text-red-200`;

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

  const load = useCallback(
    async (sid: string) => {
      setLoading(true);

      const base = supabase
        .from("parts")
        .select("*")
        .eq("shop_id", sid)
        .order("name", { ascending: true });

      const q = search.trim();

      const { data, error } = await (q
        ? base.or([`name.ilike.%${q}%`, `sku.ilike.%${q}%`, `category.ilike.%${q}%`].join(","))
        : base);

      const partRows = (!error && (data as Part[])) || [];
      setParts(partRows);
      setLoading(false);

      void loadOnHand(sid, partRows.map((p) => p.id));
    },
    [supabase, search, loadOnHand],
  );

  // --- on-hand detail (per-location)
  const openOnHandDetail = useCallback(
    async (p: Part) => {
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
    },
    [supabase, shopId, locs],
  );

  /* boot */
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      if (!uid) return;

      const { data: profA } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", uid)
        .maybeSingle();

      const sidA = (profA?.shop_id as string) || "";

      const sid = sidA || "";
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
      } else if (locRows[0]?.id) {
        setInitLoc(locRows[0].id);
        setRecvLoc(locRows[0].id);
        setCsvDefaultLoc(locRows[0].id);
      }

      await load(sid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, load]);

  /* refetch on search */
  useEffect(() => {
    if (shopId) void load(shopId);
  }, [search, shopId, load]);

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
      } catch (err: unknown) {
        alert(`Part created, but stock receive failed: ${errMsg(err)}`);
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
    } catch (err: unknown) {
      alert(errMsg(err));
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
      const nm = idx.name >= 0 ? row[idx.name] : "";
      const name = (nm ?? "").trim();
      if (!name) continue;

      const sku = idx.sku >= 0 ? (row[idx.sku] ?? "").trim() : "";
      const category = idx.category >= 0 ? (row[idx.category] ?? "").trim() : "";
      const priceStr = idx.price >= 0 ? (row[idx.price] ?? "").trim() : "";
      const qtyStr = idx.qty >= 0 ? (row[idx.qty] ?? "").trim() : "";

      const priceNum = priceStr ? Number(priceStr) : NaN;
      const qtyNum = qtyStr ? Number(qtyStr) : NaN;

      out.push({
        name,
        sku: sku || undefined,
        category: category || undefined,
        price: Number.isFinite(priceNum) ? priceNum : undefined,
        qty: Number.isFinite(qtyNum) ? qtyNum : undefined,
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

    // NOTE: intentionally sequential to keep it safe and predictable for now.
    for (const row of csvRows) {
      let partId: string | null = null;

      if (row.sku) {
        const { data: found } = await supabase
          .from("parts")
          .select("id")
          .eq("shop_id", shopId)
          .eq("sku", row.sku)
          .maybeSingle();

        if (found?.id) partId = String(found.id);
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
          // eslint-disable-next-line no-console
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
        } catch (err: unknown) {
          // eslint-disable-next-line no-console
          console.warn("Stock receive failed for row:", row, errMsg(err));
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
    <div className={pageWrap}>
      <div className={`${glassCard} overflow-hidden`}>
        <div className={`${glassHeader} px-5 py-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">
                Parts
              </div>
              <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-blackops), system-ui" }}>
                Inventory
              </h1>
              <div className="mt-1 text-sm text-neutral-400">
                Create parts, quick receive, and import stock from CSV.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${inputBase} w-72`}
                placeholder="Search name / SKU / category"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <button className={btnCopper} onClick={() => setAddOpen(true)} disabled={!shopId}>
                Add Part
              </button>

              <button className={btnBlue} onClick={() => setCsvOpen(true)} disabled={!shopId}>
                CSV Import
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={`${glassCard} p-4 text-sm text-neutral-300`}>Loading…</div>
      ) : parts.length === 0 ? (
        <div className={`${glassCard} p-4 text-sm text-neutral-300`}>
          No parts yet. Click “Add Part” to create your first item or use CSV Import.
        </div>
      ) : (
        <div className={`${glassCard} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-neutral-400">
                <tr className="text-left">
                  <th className="p-3">Name</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">On hand</th>
                  <th className="w-56 p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((p) => {
                  const total = onHand[p.id] ?? 0;
                  const onHandPill = total > 0 ? pillOk : pillZero;

                  return (
                    <tr key={p.id} className="border-t border-white/10">
                      <td className="p-3">
                        <div className="font-medium text-white">{p.name}</div>
                        <div className="mt-0.5 text-xs text-neutral-500">
                          {p.id ? `#${String(p.id).slice(0, 8)}` : ""}
                        </div>
                      </td>
                      <td className="p-3">{p.sku ?? "—"}</td>
                      <td className="p-3">{p.category ?? "—"}</td>
                      <td className="p-3 tabular-nums">
                        {typeof p.price === "number" ? `$${p.price.toFixed(2)}` : "—"}
                      </td>
                      <td className="p-3">
                        <button
                          className={`${onHandPill} hover:bg-white/5`}
                          onClick={() => void openOnHandDetail(p)}
                          title="View per-location balance"
                        >
                          {total}
                        </button>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          <button className={btnGhost} onClick={() => openEdit(p)}>
                            Edit
                          </button>
                          <button className={btnBlue} onClick={() => openReceive(p)}>
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

          <div className="border-t border-white/10 px-5 py-3 text-xs text-neutral-500">
            Tip: Click the on-hand number to see per-location balances.
          </div>
        </div>
      )}

      {/* Add Part */}
      <Modal
        open={addOpen}
        title="Add Part"
        onClose={() => setAddOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button className={btnCopper} onClick={createPart} disabled={!name.trim()}>
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
          <NumberField label="Price" value={price} onChange={(v) => setPrice(v === "" ? "" : v)} />
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-neutral-950/20 p-3">
          <div className="mb-2 text-sm font-semibold text-white">
            Initial Stock <span className="text-xs font-normal text-neutral-400">(optional)</span>
          </div>
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
            <button className={btnGhost} onClick={() => setEditOpen(false)}>
              Cancel
            </button>
            <button className={btnCopper} onClick={saveEdit} disabled={!editName.trim()}>
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
          <NumberField label="Price" value={editPrice} onChange={(v) => setEditPrice(v === "" ? "" : v)} />
        </div>
      </Modal>

      {/* Receive Stock */}
      <Modal
        open={recvOpen}
        title={recvPart ? `Receive — ${recvPart.name}` : "Receive Stock"}
        onClose={() => setRecvOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setRecvOpen(false)}>
              Cancel
            </button>
            <button
              className={btnBlue}
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
          <div className="text-sm text-neutral-300">No movement found for this part.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10 bg-neutral-950/20">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-neutral-400">
                <tr>
                  <th className="p-3">Location</th>
                  <th className="p-3">Qty</th>
                </tr>
              </thead>
              <tbody>
                {ohLines.map((l, i) => (
                  <tr key={i} className="border-t border-white/10">
                    <td className="p-3">{l.location}</td>
                    <td className="p-3 tabular-nums">{l.qty}</td>
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
          <div className="flex w-full flex-wrap items-end justify-between gap-3">
            <div className="min-w-[260px]">
              <SelectField
                label="Default receive location (for rows with qty)"
                value={csvDefaultLoc}
                onChange={setCsvDefaultLoc}
                options={[
                  { value: "", label: "— none —" },
                  ...locs.map((l) => ({
                    value: l.id,
                    label: `${l.code ?? "LOC"} — ${l.name ?? ""}`,
                  })),
                ]}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                className={btnGhost}
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
                className={btnBlue}
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
          <div className="rounded-xl border border-white/10 bg-neutral-950/20 p-3 text-sm text-neutral-300">
            Expected headers (case-insensitive): <code className={COPPER_TEXT}>name, sku, category, price, qty</code>.
            Extra columns are ignored.
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCsvFile(f);
              }}
              className="text-sm text-neutral-200"
            />
            <button
              className={btnGhost}
              onClick={() => {
                if (csvText.trim().length) parseAndPreviewCSV(csvText);
              }}
            >
              Parse text
            </button>
          </div>

          <textarea
            rows={8}
            className={`${inputBase} font-mono text-xs`}
            placeholder={`Paste CSV here… e.g.:
name,sku,category,price,qty
Oil Filter – Ford,OF-FORD-01,Filters,9.95,10
Spark Plug – Iridium,SP-IR-01,Ignition,9.95,24
`}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />

          {csvPreview && (
            <div className="overflow-hidden rounded-xl border border-white/10 bg-neutral-950/20">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-left text-neutral-400">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Price</th>
                    <th className="p-3">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.map((r, i) => (
                    <tr key={i} className="border-t border-white/10">
                      <td className="p-3">{r.name}</td>
                      <td className="p-3">{r.sku ?? "—"}</td>
                      <td className="p-3">{r.category ?? "—"}</td>
                      <td className="p-3 tabular-nums">
                        {typeof r.price === "number" ? r.price.toFixed(2) : "—"}
                      </td>
                      <td className="p-3 tabular-nums">
                        {typeof r.qty === "number" ? r.qty : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {csvPreview && (
            <div className="text-xs text-neutral-500">
              Rows: <span className="font-semibold text-white">{csvRows.length}</span>
              {csvDefaultLoc ? (
                <>
                  {" "}
                  · Default receive loc: <span className={COPPER_TEXT}>{csvDefaultLoc.slice(0, 8)}</span>
                </>
              ) : (
                <>
                  {" "}
                  · <span className="text-neutral-400">No default receive location set</span>
                </>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}