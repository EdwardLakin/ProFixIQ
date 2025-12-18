
---
## app/api/parts/consume/route.ts

```ts
// app/api/parts/consume/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumePart } from "@work-orders/lib/parts/consumePart";

// Strict payload schema (no anys)
const Payload = z.object({
  work_order_line_id: z.string().min(1),
  part_id: z.string().min(1),
  qty: z.number().positive(),
  location_id: z.string().min(1).optional(),
});

type Payload = z.infer<typeof Payload>;

export async function POST(req: NextRequest) {
  try {
    const json: unknown = await req.json();
    const parsed = Payload.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const body: Payload = parsed.data;

    const result = await consumePart({
      work_order_line_id: body.work_order_line_id,
      part_id: body.part_id,
      qty: body.qty,
      location_id: body.location_id,
    });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to consume part";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}



```

---
## app/api/parts/requests/create/route.ts

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PRInsert = DB["public"]["Tables"]["part_requests"]["Insert"];
type PRIInsert = DB["public"]["Tables"]["part_request_items"]["Insert"];
type WORow = DB["public"]["Tables"]["work_orders"]["Row"];
type WOLUpdate = DB["public"]["Tables"]["work_order_lines"]["Update"];

const DEFAULT_MARKUP = 30; // %

type BodyItem = {
  description: string;
  qty: number;
};

type Body = {
  workOrderId: string;
  jobId?: string | null;
  items: BodyItem[];
  notes?: string | null;
};

// extend the generated insert type with the columns you just added in Supabase
type PartRequestItemInsertWithExtras = PRIInsert & {
  markup_pct: number;
  work_order_line_id: string | null;
};

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // 1) parse + validate
  const body = (await req.json().catch(() => null)) as Body | null;
  if (
    !body ||
    typeof body.workOrderId !== "string" ||
    !Array.isArray(body.items) ||
    body.items.length === 0
  ) {
    return NextResponse.json(
      { error: "Invalid body. Expect { workOrderId, items[] }." },
      { status: 400 },
    );
  }

  const { workOrderId, jobId, items, notes } = body;

  // 2) auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 3) load WO for shop_id
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, shop_id")
    .eq("id", workOrderId)
    .maybeSingle<WORow>();

  if (woErr) {
    return NextResponse.json({ error: woErr.message }, { status: 400 });
  }
  if (!wo?.id || !wo.shop_id) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  // 4) insert header
  const header: PRInsert = {
    work_order_id: workOrderId,
    shop_id: wo.shop_id,
    requested_by: user.id,
    status: "requested",
    notes: notes ?? null,
  };

  const { data: pr, error: prErr } = await supabase
    .from("part_requests")
    .insert(header)
    .select("id")
    .single();

  if (prErr || !pr?.id) {
    return NextResponse.json(
      { error: prErr?.message ?? "Failed to create part request" },
      { status: 500 },
    );
  }

  // 5) insert item rows — now with markup_pct + work_order_line_id
  const itemRows: PartRequestItemInsertWithExtras[] = items.map((it) => ({
    request_id: pr.id,
    description: it.description.trim(),
    qty: Number(it.qty),
    approved: false,
    part_id: null,
    quoted_price: null,
    vendor: null,
    markup_pct: DEFAULT_MARKUP,
    work_order_line_id: jobId ?? null,
  }));

  const { error: itemsErr } = await supabase
    .from("part_request_items")
    .insert(itemRows);

  if (itemsErr) {
    // best-effort rollback if items fail
    await supabase.from("part_requests").delete().eq("id", pr.id);
    return NextResponse.json(
      { error: itemsErr.message ?? "Failed to insert request items" },
      { status: 500 },
    );
  }

  // 6) optionally put the line on hold / approval pending
  if (jobId) {
    // When a parts request is created for a job:
    // - move the line to on_hold
    // - mark approval_state pending
    // - record that this is an "Awaiting parts" hold
    // - clear punch timestamps so the job is no longer active OR finished
    const updatePayload: WOLUpdate = {
      status: "on_hold",
      approval_state: "pending",
      hold_reason: "Awaiting parts",
      punched_in_at: null,
      punched_out_at: null,
    };

    const { error: lineErr } = await supabase
      .from("work_order_lines")
      .update(updatePayload)
      .eq("id", jobId);

    if (lineErr) {
      // If we fail here, the parts request exists but the job state didn't update;
      // surface the error to the caller so they know something is off.
      return NextResponse.json(
        { error: lineErr.message ?? "Failed to update job for parts hold" },
        { status: 500 },
      );
    }

    // Make sure the parent work order no longer shows as "in_progress"
    // when we've parked a job for parts.
    await supabase
      .from("work_orders")
      .update({ status: "awaiting_approval" })
      .eq("id", workOrderId);
  }

  return NextResponse.json({ requestId: pr.id });
}
```

---
## app/parts/inventory/page.tsx

```tsx
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
        } catch (err: unknown) {
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
          <NumberField
            label="Price"
            value={price}
            onChange={(v) => setPrice(v === "" ? "" : v)}
          />
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
```

---
## app/parts/page.tsx

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type StockMoveRow = DB["public"]["Tables"]["stock_moves"]["Row"];
type RequestRow = DB["public"]["Tables"]["part_requests"]["Row"];

// ---------- UI helpers ----------

function Sparkline({
  points,
  width = 120,
  height = 28,
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  if (!points.length) {
    return (
      <svg width={width} height={height} aria-hidden>
        <line
          x1="0"
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke="currentColor"
          opacity={0.2}
        />
      </svg>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / Math.max(1, points.length - 1);
  const path = points
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={path} fill="none" stroke="currentColor" />
    </svg>
  );
}

// shared card primitives (mirrors main dashboard look)
function OverviewCard({
  title,
  value,
  href,
}: {
  title: string;
  value: React.ReactNode;
  href?: string;
}) {
  const content = (
    <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 shadow-card backdrop-blur-md transition hover:border-accent hover:shadow-glow">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),transparent_60%)] opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative">
        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
          {title}
        </p>
        <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

function QuickButton({
  href,
  children,
  accent,
}: {
  href: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm text-whitetypedefs shadow-sm backdrop-blur-md transition ${
        accent
          ? "border-orange-400/60 bg-white/[0.03] hover:bg-orange-500/10 hover:border-orange-400"
          : "border-neutral-700 bg-white/[0.02] hover:bg-neutral-800/80"
      }`}
    >
      {children}
    </Link>
  );
}

// ---------- Page ----------
export default function PartsDashboardPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [loading, setLoading] = useState(true);

  // KPIs
  const [skuTotal, setSkuTotal] = useState<number>(0);
  const [skuNewThis7d, setSkuNewThis7d] = useState<number>(0);

  const [moves7dCount, setMoves7dCount] = useState<number>(0);
  const [moves30Spark, setMoves30Spark] = useState<number[]>([]);

  const [openRequestsCount, setOpenRequestsCount] = useState<number | null>(
    null,
  );

  // Recent moves (list)
  const [recentMoves, setRecentMoves] = useState<
    Pick<
      StockMoveRow,
      "id" | "created_at" | "reason" | "qty_change" | "part_id"
    >[]
  >([]);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const now = new Date();
      const d7Ago = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      const d30Ago = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

      // -------- parts (for SKUs + 7d new) --------
      const { data: parts, error: perr } = await supabase
        .from("parts")
        .select("id, created_at");

      if (perr) {
        // eslint-disable-next-line no-console
        console.error("[parts] load failed:", perr);
      }
      const partsRows = (parts ?? []) as Pick<
        PartRow,
        "id" | "created_at"
      >[];

      setSkuTotal(partsRows.length);

      const createdInLast7 = partsRows.filter((p) => {
        const ts = p.created_at ? new Date(p.created_at) : null;
        return !!ts && ts >= d7Ago && ts < now;
      }).length;
      setSkuNewThis7d(createdInLast7);

      // -------- stock_moves (for 7d count + 30d sparkline + list) --------
      const { data: moves, error: merr } = await supabase
        .from("stock_moves")
        .select("id, part_id, qty_change, reason, created_at")
        .gte("created_at", d30Ago.toISOString())
        .order("created_at", { ascending: true });

      if (merr) {
        // eslint-disable-next-line no-console
        console.error("[stock_moves] load failed:", merr);
      }

      const mv = (moves ?? []) as Pick<
        StockMoveRow,
        "id" | "part_id" | "qty_change" | "reason" | "created_at"
      >[];

      // 7d moves count
      setMoves7dCount(
        mv.filter((m) => new Date(m.created_at) >= d7Ago).length,
      );

      // 30-day sparkline (daily net qty_change)
      const days = 30;
      const buckets = Array<number>(days).fill(0);
      for (const m of mv) {
        const dt = new Date(m.created_at);
        const idx = Math.min(
          days - 1,
          Math.max(
            0,
            Math.floor(
              (dt.getTime() - d30Ago.getTime()) / (24 * 3600 * 1000),
            ),
          ),
        );
        buckets[idx] += Number(m.qty_change ?? 0);
      }
      setMoves30Spark(buckets);

      // Recent list (latest 10, descending)
      const recent = [...mv]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        )
        .slice(0, 10);
      setRecentMoves(recent);

      // -------- open parts requests count --------
      const {
        count: openCount,
        error: rerr,
      } = await supabase
        .from("part_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["requested", "quoted", "approved"] as RequestRow["status"][]);

      if (rerr) {
        // eslint-disable-next-line no-console
        console.error("[part_requests] count failed:", rerr);
        setOpenRequestsCount(0);
      } else {
        setOpenRequestsCount(openCount ?? 0);
      }

      setLoading(false);
    })();
  }, [supabase]);

  const skuTotalDisplay = loading ? "…" : skuTotal.toLocaleString();
  const newSkuDisplay = loading ? "…" : String(skuNewThis7d);
  const moves7dDisplay = loading ? "…" : moves7dCount.toLocaleString();
  const openReqDisplay =
    openRequestsCount === null || loading
      ? "…"
      : openRequestsCount.toLocaleString();

  return (
    <div className="relative space-y-8 p-6 text-white fade-in">
      {/* soft gradient background for this page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.9),#020617_70%)]"
      />

      {/* welcome panel */}
      <section className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 shadow-card backdrop-blur-md">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            Parts dashboard
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Overview of your catalog, movement, and open requests.
          </p>
        </div>
      </section>

      {/* overview cards */}
      <section className="grid gap-4 md:grid-cols-4">
        <OverviewCard
          title="SKUs in catalog"
          value={skuTotalDisplay}
          href="/parts/inventory"
        />
        <OverviewCard
          title="New SKUs (7 days)"
          value={newSkuDisplay}
          href="/parts/inventory"
        />
        <OverviewCard
          title="Stock moves (7 days)"
          value={moves7dDisplay}
          href="/parts/inventory"
        />
        <OverviewCard
          title="Open parts requests"
          value={openReqDisplay}
          href="/parts/requests"
        />
      </section>

      {/* quick actions */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-300">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <QuickButton href="/parts/po" accent>
            Create PO
          </QuickButton>
          <QuickButton href="/parts/inventory">Inventory</QuickButton>
          <QuickButton href="/parts/receive">Scan to receive</QuickButton>
          <QuickButton href="/parts/requests">Requests</QuickButton>
          <QuickButton href="/parts/vendors">Vendors</QuickButton>
        </div>
      </section>

      {/* recent moves */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 shadow-card backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Recent stock moves</h2>
            <p className="text-xs text-neutral-400">
              Last 30 days of inventory activity.
            </p>
          </div>
          <Sparkline points={moves30Spark} />
        </div>

        {loading ? (
          <div className="text-sm text-neutral-400">Loading…</div>
        ) : recentMoves.length === 0 ? (
          <div className="text-sm text-neutral-400">No recent moves</div>
        ) : (
          <ul className="divide-y divide-neutral-800 text-sm">
            {recentMoves.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between py-2"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {String(m.reason ?? "move").replaceAll("_", " ")}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {new Date(m.created_at as string).toLocaleString()}
                  </div>
                </div>
                <div className="pl-3 font-semibold">
                  {Number(m.qty_change ?? 0) >= 0 ? "+" : ""}
                  {Number(m.qty_change ?? 0)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

---
## app/parts/po/[id]/receive/page.tsx

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { resolveScannedCode } from "@/features/parts/server/scanActions";

// Quagga shim/types
type QuaggaModule = typeof import("@ericblade/quagga2");
type QuaggaResult = { codeResult?: { code?: string | null } | null };
let Quagga: QuaggaModule["default"] | null = null;
if (typeof window !== "undefined") {
  void import("@ericblade/quagga2").then((m) => (Quagga = m.default));
}

type DB = Database;
type PurchaseOrder = DB["public"]["Tables"]["purchase_orders"]["Row"];
type POLine = DB["public"]["Tables"]["purchase_order_lines"]["Row"];
type StockLoc = DB["public"]["Tables"]["stock_locations"]["Row"];

export default function ReceivePOPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [po, setPO] = useState<PurchaseOrder | null>(null);
  const [lines, setLines] = useState<POLine[]>([]);
  const [locs, setLocs] = useState<StockLoc[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string>("");

  const [qty, setQty] = useState<number>(1);
  const [lastScan, setLastScan] = useState<string>("");

  const videoRef = useRef<HTMLDivElement | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);

  // load PO + lines + locations
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: poRow } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      const poTyped = (poRow as PurchaseOrder | null) ?? null;
      setPO(poTyped);

      const [{ data: lineRows }, { data: locRows }] = await Promise.all([
        supabase
          .from("purchase_order_lines")
          .select("*")
          .eq("po_id", id)
          .order("created_at", { ascending: true }),
        poTyped?.shop_id
          ? supabase
              .from("stock_locations")
              .select("*")
              .eq("shop_id", poTyped.shop_id)
              .order("code")
          : Promise.resolve({ data: [] }),
      ]);

      const locsTyped = (locRows ?? []) as StockLoc[];
      setLines((lineRows ?? []) as POLine[]);
      setLocs(locsTyped);
      const main = locsTyped.find((l) => (l.code ?? "").toUpperCase() === "MAIN");
      if (main) setSelectedLoc(main.id);
    })();
  }, [id, supabase]);

  // scanner
  const startScan = async () => {
    if (!Quagga || scanning || !videoRef.current) return;
    setScanning(true);
    Quagga.init(
      {
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: videoRef.current,
          constraints: { facingMode: "environment" },
        },
        decoder: {
          readers: [
            "upc_reader",
            "upc_e_reader",
            "ean_reader",
            "ean_8_reader",
            "code_128_reader",
          ],
        },
        locate: true,
      },
      (err?: Error) => {
        if (err) {
          // eslint-disable-next-line no-console
          console.error(err);
          setScanning(false);
          return;
        }
        Quagga?.start();
      }
    );

    Quagga.onDetected(async (res: QuaggaResult) => {
      const code = res.codeResult?.code ?? "";
      if (!code || code === lastScan) return;
      setLastScan(code);

      const { part_id } = await resolveScannedCode({
        code,
        supplier_id: po?.supplier_id ?? null,
      });

      if (!part_id) {
        alert(`No part found for "${code}".`);
        return;
      }
      if (!selectedLoc) {
        alert("Select a location first.");
        return;
      }

      await fetch("/api/receive-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part_id,
          location_id: selectedLoc,
          qty,
          po_id: po?.id ?? null,
        }),
      });

      const locLabel =
        locs.find((l) => l.id === selectedLoc)?.code ?? "LOC";
      alert(`Received ×${qty} to ${locLabel}`);
      window.dispatchEvent(new CustomEvent("parts:received"));
      window.setTimeout(() => setLastScan(""), 1000);
    });
  };

  const stopScan = () => {
    try {
      Quagga?.stop();
    } catch {
      /* ignore */
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => stopScan();
  }, []);

  const remaining = (ln: POLine): number => {
    const ordered = Number(ln.qty ?? 0);
    const received = Number(ln.received_qty ?? 0);
    return Math.max(0, ordered - received);
  };

  return (
    <div className="p-6 space-y-4 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Receive PO</h1>
        <Link
          href="/parts/po"
          className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
        >
          Back to POs
        </Link>
      </div>

      {po ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
          <div className="font-medium">
            {po.id.slice(0, 8)} • {po.status ?? "draft"}
          </div>
          <div className="text-neutral-400">
            Supplier: {po.supplier_id ?? "—"}
          </div>
        </div>
      ) : (
        <div className="text-neutral-400">Loading PO…</div>
      )}

      <div className="rounded border border-neutral-800 bg-neutral-900 p-3 grid gap-3 sm:grid-cols-3">
        <div>
          <div className="text-xs text-neutral-400 mb-1">Location</div>
          <select
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
            value={selectedLoc}
            onChange={(e) => setSelectedLoc(e.target.value)}
          >
            {locs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code ?? "LOC"} — {l.name ?? ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-xs text-neutral-400 mb-1">Quantity</div>
          <input
            type="number"
            min={0.01}
            step="0.01"
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
            value={qty}
            onChange={(e) => setQty(Math.max(0, Number(e.target.value || 0)))}
          />
        </div>
      </div>

      <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
        <div className="mb-2 flex items-center gap-2">
          {!scanning ? (
            <button
              onClick={startScan}
              className="rounded border border-orange-500 px-3 py-1.5 text-sm text-orange-300 hover:bg-orange-900/20"
            >
              Start Scanner
            </button>
          ) : (
            <button
              onClick={stopScan}
              className="rounded border border-red-500 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/20"
            >
              Stop Scanner
            </button>
          )}
          <span className="text-xs text-neutral-400">
            Scan item barcodes to receive against this PO.
          </span>
        </div>
        <div
          ref={videoRef}
          className="aspect-video w-full overflow-hidden rounded border border-neutral-800 bg-black"
        />
      </div>

      <div className="rounded border border-neutral-800 bg-neutral-900">
        <div className="border-b border-neutral-800 p-2 text-sm font-semibold">
          Lines
        </div>
        {lines.length === 0 ? (
          <div className="p-3 text-neutral-400">No lines yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-400">
                <th className="p-2">Part</th>
                <th className="p-2">Ordered</th>
                <th className="p-2">Received</th>
                <th className="p-2">Remaining</th>
              </tr>
            </thead>
            <tbody>
  {lines.map((ln) => (
    <tr key={ln.id} className="border-t border-neutral-800">
      <td className="p-2">{ln.part_id ? ln.part_id.slice(0, 8) : "—"}</td>
      <td className="p-2">{Number(ln.qty ?? 0)}</td>
      <td className="p-2">{Number(ln.received_qty ?? 0)}</td>
      <td className="p-2">{remaining(ln)}</td>
    </tr>
  ))}
</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

---
## app/parts/po/page.tsx

```tsx
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

export default function PurchaseOrdersPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [shopId, setShopId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);

  // New PO modal state
  const [open, setOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;
      if (!uid) { setLoading(false); return; }

      const { data: prof } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", uid)
        .single();

      const sid = prof?.shop_id ?? "";
      setShopId(sid);

      if (sid) {
        const [poRes, supRes] = await Promise.all([
          supabase
            .from("purchase_orders")
            .select("*")
            .eq("shop_id", sid)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("suppliers")
            .select("*")
            .eq("shop_id", sid)
            .order("name", { ascending: true }),
        ]);
        setPOs((poRes.data as PurchaseOrder[]) ?? []);
        setSuppliers((supRes.data as Supplier[]) ?? []);
      }

      setLoading(false);
    })();
  }, [supabase]);

  const createPo = async () => {
    if (!shopId) return;
    const id = uuidv4();
    const insert = {
      id,
      shop_id: shopId,
      supplier_id: supplierId || null,
      status: "open" as PurchaseOrder["status"],
      notes: note || null,
    };
    const { error } = await supabase.from("purchase_orders").insert(insert);
    if (!error) {
      setOpen(false);
      setSupplierId("");
      setNote("");
      router.push(`/parts/po/${id}/receive`);
    } else {
      // keep UI minimal for now
      alert(error.message);
    }
  };

  return (
    <div className="p-6 space-y-4 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Purchase Orders</h1>
        <button
          className="font-header rounded border border-orange-500 px-3 py-1.5 text-sm hover:bg-orange-500/10 disabled:opacity-60"
          onClick={() => setOpen(true)}
          disabled={!shopId}
        >
          New PO
        </button>
      </div>

      {loading ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
          Loading…
        </div>
      ) : pos.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
          No purchase orders yet.
        </div>
      ) : (
        <div className="rounded border border-neutral-800 bg-neutral-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-400">
                <th className="p-2">PO</th>
                <th className="p-2">Supplier</th>
                <th className="p-2">Status</th>
                <th className="p-2">Created</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po) => (
                <tr key={po.id} className="border-t border-neutral-800">
                  <td className="p-2 font-mono">{po.id.slice(0, 8)}</td>
                  <td className="p-2">{po.supplier_id ?? "—"}</td>
                  <td className="p-2">{po.status}</td>
                  <td className="p-2">{po.created_at ? new Date(po.created_at).toLocaleString() : "—"}</td>
                  <td className="p-2">
                    <Link
                      href={`/parts/po/${po.id}/receive`}
                      className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800"
                    >
                      Receive
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New PO "modal" (lightweight inline panel to keep dependencies low) */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded border border-orange-500 bg-neutral-950 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New Purchase Order</h2>
              <button
                className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs text-neutral-400">Supplier (optional)</div>
                <select
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">— none —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name ?? s.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-1 text-xs text-neutral-400">Notes</div>
                <textarea
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional notes for this PO…"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="rounded border border-orange-500 px-3 py-1.5 text-sm hover:bg-orange-500/10 disabled:opacity-60"
                  onClick={createPo}
                  disabled={!shopId}
                >
                  Create & Receive →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

---
## app/parts/quoting/page.tsx

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { format } from "date-fns";
import dynamic from "next/dynamic";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import VoiceContextSetter from "@/features/shared/voice/VoiceContextSetter";
import VoiceButton from "@/features/shared/voice/VoiceButton";
import { requestQuoteSuggestion } from "@inspections/lib/inspection/aiQuote";

const PartsDrawer = dynamic(
  () => import("@/features/parts/components/PartsDrawer"),
  {
    ssr: false,
  }
);

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type QueueRow = WorkOrderLine & {
  work_order: WorkOrder | null;
  vehicle: Vehicle | null;
  customer: Customer | null;
};

type MenuUpsertResponse = {
  ok: boolean;
  menuItemId?: string;
  updated?: boolean;
  error?: string;
  detail?: string;
};

const BASE_BADGE =
  "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium";
const BADGE: Record<string, string> = {
  awaiting: "bg-sky-900/20 border-sky-500/40 text-sky-300",
  awaiting_approval: "bg-blue-900/20 border-blue-500/40 text-blue-300",
  queued: "bg-indigo-900/20 border-indigo-500/40 text-indigo-300",
  in_progress: "bg-orange-900/20 border-orange-500/40 text-orange-300",
  on_hold: "bg-amber-900/20 border-amber-500/40 text-amber-300",
  completed: "bg-green-900/20 border-green-500/40 text-green-300",
};
const chip = (s: string | null | undefined): string => {
  const k = (s ?? "awaiting").toLowerCase().replaceAll(" ", "_");
  return `${BASE_BADGE} ${BADGE[k] ?? BADGE.awaiting}`;
};

export default function QuotingQueuePage(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId]
  );

  const [bulkQueue, setBulkQueue] = useState<string[]>([]);
  const bulkActive = bulkQueue.length > 0;

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data: lines, error: lerr } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("approval_state", "pending")
        .order("created_at", { ascending: true });

      if (lerr) throw lerr;

      const wol = (lines ?? []) as WorkOrderLine[];
      if (wol.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const woIds = [
        ...new Set(
          wol.map((l) => l.work_order_id).filter(Boolean) as string[]
        ),
      ];
      const { data: woRows } = await supabase
        .from("work_orders")
        .select("*")
        .in("id", woIds);

      const woById = new Map<string, WorkOrder>();
      (woRows ?? []).forEach((w) => woById.set(w.id, w as WorkOrder));

      const vehIds = [
        ...new Set(
          (woRows ?? [])
            .map((w) => (w as WorkOrder).vehicle_id)
            .filter(Boolean) as string[]
        ),
      ];
      const custIds = [
        ...new Set(
          (woRows ?? [])
            .map((w) => (w as WorkOrder).customer_id)
            .filter(Boolean) as string[]
        ),
      ];

      const [vehRes, custRes] = await Promise.all([
        vehIds.length
          ? supabase.from("vehicles").select("*").in("id", vehIds)
          : Promise.resolve({ data: [] } as const),
        custIds.length
          ? supabase.from("customers").select("*").in("id", custIds)
          : Promise.resolve({ data: [] } as const),
      ]);

      const vById = new Map<string, Vehicle>();
      (vehRes.data ?? []).forEach((v) =>
        vById.set((v as Vehicle).id, v as Vehicle)
      );

      const cById = new Map<string, Customer>();
      (custRes.data ?? []).forEach((c) =>
        cById.set((c as Customer).id, c as Customer)
      );

      const out: QueueRow[] = wol.map((l) => {
        const wo = l.work_order_id
          ? woById.get(l.work_order_id) ?? null
          : null;
        const vehicle = wo?.vehicle_id
          ? vById.get(wo.vehicle_id) ?? null
          : null;
        const customer = wo?.customer_id
          ? cById.get(wo.customer_id) ?? null
          : null;
        return { ...l, work_order: wo, vehicle, customer };
      });

      setRows(out);
    } catch (e) {
      const msg =
        (e as { message?: string })?.message ??
        "Failed to load quoting queue.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    const ch = supabase
      .channel("quote-queue")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_lines",
          filter: "approval_state=eq.pending",
        },
        () => void fetchQueue()
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        // ignore
      }
    };
  }, [supabase, fetchQueue]);

  const startBulk = useCallback(() => {
    if (!rows.length) return;
    const ids = rows.map((r) => r.id);
    setBulkQueue(ids);
    setSelectedId(ids[0] ?? null);
    toast.message(`Quoting ${ids.length} pending line(s)…`);
  }, [rows]);

  useEffect(() => {
    if (!selectedId) return;
    const evt = `parts-drawer:closed:${selectedId}`;
    const handler = () => {
      if (bulkActive) {
        const [, ...rest] = bulkQueue;
        setBulkQueue(rest);
        setSelectedId(rest[0] ?? null);
        if (rest.length === 0) void fetchQueue();
      } else {
        setSelectedId(null);
        void fetchQueue();
      }
    };
    window.addEventListener(evt, handler as EventListener);
    return () => window.removeEventListener(evt, handler as EventListener);
  }, [selectedId, bulkActive, bulkQueue, fetchQueue]);

  // ---- AI Apply: suggest + server inserts allocations + labor
  const aiApply = useCallback(
    async (row: QueueRow) => {
      if (!row.id) return;
      toast.loading("AI preparing parts & labor…", { id: `ai-${row.id}` });

      try {
        const suggestion = await requestQuoteSuggestion({
          item: row.description ?? "Job",
          notes: row.notes ?? "",
          section: "Quote Queue",
          status: "recommend",
          vehicle: row.vehicle ?? undefined,
        });

        if (!suggestion) {
          toast.error("AI returned no suggestion.", { id: `ai-${row.id}` });
          return;
        }

        const r = await fetch("/api/quotes/apply-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderLineId: row.id, suggestion }),
        });

        const j = (await r.json()) as {
          ok?: boolean;
          labor_applied?: boolean;
          unmatched?: { name: string; qty: number }[];
          error?: string;
        };
        if (!r.ok || !j?.ok) {
          throw new Error(j?.error || "Apply AI failed");
        }

        if (j.unmatched && j.unmatched.length) {
          const list = j.unmatched
            .map((u) => `${u.qty}× ${u.name}`)
            .join(", ");
          toast.message(`Some parts need manual matching: ${list}`, {
            id: `ai-${row.id}`,
          });
        } else {
          toast.success("AI parts & labor applied", { id: `ai-${row.id}` });
        }
        await fetchQueue();
      } catch (e) {
        toast.error(
          (e as { message?: string })?.message ?? "AI apply failed",
          { id: `ai-${row.id}` }
        );
      }
    },
    [fetchQueue]
  );

  // ---- Mark as quoted (still pending approval) + grow Saved Menu
  const markQuoted = useCallback(
    async (row: QueueRow) => {
      if (!row.id) return;
      toast.loading("Marking as quoted…", { id: `quoted-${row.id}` });

      try {
        // Create/merge Saved Menu record for this line
        const r = await fetch("/api/menu-items/upsert-from-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderLineId: row.id }),
        });

        let body: MenuUpsertResponse | null = null;
        let raw: string | null = null;
        try {
          raw = await r.text();
          body = raw ? (JSON.parse(raw) as MenuUpsertResponse) : null;
        } catch {
          // non-JSON or empty body
        }

        if (!r.ok || !body?.ok) {
          console.error("Menu upsert failed", {
            status: r.status,
            body: body ?? raw,
          });

          const reason =
            body?.detail ||
            body?.error ||
            (r.ok ? "Unknown error" : `HTTP ${r.status}`);

          // This mirrors the "Quoted, but couldn’t save to menu items" vibe,
          // but also surfaces the detail so you know *why*.
          toast.warning(
            `Quoted, but couldn’t save to menu items. ${reason}`,
            { id: `quoted-${row.id}` }
          );
          return;
        }

        // Keep approval_state as pending, but mark status + notes as quoted
        const nextNotes = `${row.notes ?? ""}`.includes("[quoted]")
          ? row.notes
          : [row.notes ?? "", "[quoted]"].filter(Boolean).join(" ").trim();

        const { error: ue } = await supabase
          .from("work_order_lines")
          .update(
            {
              status: "quoted",
              notes: nextNotes,
            } as DB["public"]["Tables"]["work_order_lines"]["Update"]
          )
          .eq("id", row.id);

        if (ue) {
          console.warn("Could not set line to quoted:", ue.message);
          toast.success(
            "Saved Menu updated, but line status could not be set to quoted.",
            { id: `quoted-${row.id}` }
          );
        } else {
          toast.success(
            "Marked as quoted (awaiting approval). Saved Menu updated.",
            { id: `quoted-${row.id}` }
          );
        }

        await fetchQueue();
      } catch (e) {
        console.error("markQuoted failed:", e);
        toast.error(
          (e as { message?: string })?.message ??
            "Failed to mark as quoted",
          { id: `quoted-${row.id}` }
        );
      }
    },
    [supabase, fetchQueue]
  );

  return (
    <div className="p-4 sm:p-6 text-white">
      <VoiceContextSetter currentView="parts_quoting" />

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Quoting Queue</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/parts/inventory"
            className="text-sm text-orange-400 hover:underline"
          >
            Open Inventory →
          </Link>
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            onClick={startBulk}
            disabled={rows.length === 0}
          >
            Quote all pending ({rows.length})
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-red-300">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
        {/* LEFT: queue */}
        <div className="rounded border border-neutral-800 bg-neutral-900">
          <div className="border-b border-neutral-800 p-3 text-sm text-neutral-300">
            Pending approval lines
          </div>
          {loading ? (
            <div className="p-3 text-neutral-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-3 text-neutral-400">
              Nothing awaiting quoting.
            </div>
          ) : (
            <ul className="divide-y divide-neutral-800">
              {rows.map((r) => (
                <li key={r.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {r.description || r.complaint || "Untitled job"}
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-400">
                        WO:{" "}
                        {r.work_order?.custom_id ||
                          r.work_order?.id?.slice(0, 8) ||
                          "—"}{" "}
                        •{" "}
                        {r.vehicle
                          ? `${r.vehicle.year ?? ""} ${
                              r.vehicle.make ?? ""
                            } ${r.vehicle.model ?? ""}`.trim()
                          : "No vehicle"}{" "}
                        •{" "}
                        {r.created_at
                          ? format(new Date(r.created_at), "PPp")
                          : "—"}
                      </div>
                      {r.notes && (
                        <div className="mt-1 truncate text-xs text-neutral-400">
                          Notes: {r.notes}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span className={chip(r.status)}>
                        {(r.status ?? "awaiting").replaceAll("_", " ")}
                      </span>
                      <button
                        type="button"
                        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                        onClick={() => void aiApply(r)}
                        title="AI: allocate parts + labor"
                      >
                        AI Apply
                      </button>
                      <button
                        type="button"
                        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                        onClick={() => setSelectedId(r.id)}
                        title="Open Parts Drawer"
                      >
                        Quote
                      </button>
                      <button
                        type="button"
                        className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-black hover:bg-emerald-500"
                        onClick={() => void markQuoted(r)}
                        title="Mark as quoted (keeps awaiting approval) and grow Saved Menu"
                      >
                        Mark Quoted
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* RIGHT: details */}
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="mb-2 text-lg font-semibold">Details</h2>
          {selected ? (
            <div className="space-y-2 text-sm">
              <div className="text-neutral-400">Work Order</div>
              <div className="font-medium">
                {selected.work_order
                  ? selected.work_order.custom_id ||
                    selected.work_order.id?.slice(0, 8)
                  : "—"}
              </div>

              <div className="text-neutral-400">Vehicle</div>
              <div className="font-medium">
                {selected.vehicle
                  ? (
                      `${selected.vehicle.year ?? ""} ${
                        selected.vehicle.make ?? ""
                      } ${selected.vehicle.model ?? ""}`.trim() || "—"
                    )
                  : "—"}
              </div>

              <div className="text-neutral-400">Customer</div>
              <div className="font-medium">
                {selected.customer
                  ? (
                      [
                        selected.customer.first_name ?? "",
                        selected.customer.last_name ?? "",
                      ]
                        .filter(Boolean)
                        .join(" ") || "—"
                    )
                  : "—"}
              </div>

              <div className="text-neutral-400">Description</div>
              <div className="font-medium">
                {selected.description ?? "—"}
              </div>

              <div className="text-neutral-400">Notes</div>
              <div className="whitespace-pre-wrap font-medium">
                {selected.notes ?? "—"}
              </div>
            </div>
          ) : (
            <div className="text-neutral-400">
              Select a line on the left to see details.
            </div>
          )}
        </div>
      </div>

      {/* Parts drawer */}
      {selected && selected.work_order?.id && (
        <PartsDrawer
          open
          workOrderId={selected.work_order.id}
          workOrderLineId={selected.id}
          vehicleSummary={
            selected.vehicle
              ? {
                  year:
                    (selected.vehicle.year as string | number | null)
                      ?.toString() ?? null,
                  make: selected.vehicle.make ?? null,
                  model: selected.vehicle.model ?? null,
                }
              : null
          }
          jobDescription={selected.description ?? null}
          jobNotes={selected.notes ?? null}
          closeEventName={`parts-drawer:closed:${selected.id}`}
        />
      )}

      <VoiceButton />
    </div>
  );
}
```

---
## app/parts/receive/page.tsx

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { resolveScannedCode } from "@/features/parts/server/scanActions";

// Quagga (typed shim)
type QuaggaModule = typeof import("@ericblade/quagga2");
type QuaggaResult = { codeResult?: { code?: string | null } | null };
let Quagga: QuaggaModule["default"] | null = null;
if (typeof window !== "undefined") {
  void import("@ericblade/quagga2").then((m) => {
    Quagga = m.default;
  });
}

type DB = Database;
type PurchaseOrder = DB["public"]["Tables"]["purchase_orders"]["Row"];
type StockLoc = DB["public"]["Tables"]["stock_locations"]["Row"];

export default function ReceivePage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [, setShopId] = useState<string>("");
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [selectedPo, setSelectedPo] = useState<string>("");
  const [selectedLoc, setSelectedLoc] = useState<string>("");
  const [locs, setLocs] = useState<StockLoc[]>([]);
  const [lastScan, setLastScan] = useState<string>("");

  const videoRef = useRef<HTMLDivElement | null>(null);
  const [scanning, setScanning] = useState<boolean>(false);
  const [qty, setQty] = useState<number>(1);

  // bootstrap: shop, POs, locations
  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", uid)
        .single();

      const sid = prof?.shop_id ?? "";
      setShopId(sid);
      if (!sid) return;

      const [poRes, locRes] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("*")
          .eq("shop_id", sid)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("stock_locations")
          .select("*")
          .eq("shop_id", sid)
          .order("code"),
      ]);

      setPOs((poRes.data ?? []) as PurchaseOrder[]);
      const locRows = (locRes.data ?? []) as StockLoc[];
      setLocs(locRows);
      const main = locRows.find((l) => (l.code ?? "").toUpperCase() === "MAIN");
      if (main) setSelectedLoc(main.id);
    })();
  }, [supabase]);

  // start/stop camera
  const startScan = async () => {
    if (!Quagga || scanning || !videoRef.current) return;
    setScanning(true);

    Quagga.init(
      {
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: videoRef.current,
          constraints: { facingMode: "environment" },
        },
        decoder: {
          readers: [
            "upc_reader",
            "upc_e_reader",
            "ean_reader",
            "ean_8_reader",
            "code_128_reader",
          ],
        },
        locate: true,
      },
      (err?: Error) => {
        if (err) {
          // eslint-disable-next-line no-console
          console.error(err);
          setScanning(false);
          return;
        }
        Quagga?.start();
      }
    );

    Quagga.onDetected(async (res: QuaggaResult) => {
      const code = res.codeResult?.code ?? "";
      if (!code || code === lastScan) return;
      setLastScan(code);

      const supplierId =
        pos.find((p) => p.id === selectedPo)?.supplier_id ?? null;

      const { part_id } = await resolveScannedCode({
        code,
        supplier_id: supplierId,
      });

      if (!part_id) {
        alert(
          `No part found for "${code}". Map it in Parts → Inventory → Edit → Barcodes.`
        );
        return;
      }

      if (!selectedLoc) {
        alert("Select a location first.");
        return;
      }

      await fetch("/api/receive-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part_id,
          location_id: selectedLoc,
          qty,
          po_id: selectedPo || null,
        }),
      });

      const locLabel =
        locs.find((l) => l.id === selectedLoc)?.code ?? "LOC";
      alert(`Received ×${qty} to ${locLabel}`);
      window.dispatchEvent(new CustomEvent("parts:received"));
      window.setTimeout(() => setLastScan(""), 1000);
    });
  };

  const stopScan = () => {
    try {
      Quagga?.stop();
    } catch {
      /* ignore */
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => stopScan();
  }, []);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-white">Scan to Receive</h1>

      <div className="rounded border border-neutral-800 bg-neutral-900 p-3 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <div className="text-xs text-neutral-400 mb-1">
            Purchase Order (optional)
          </div>
          <select
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white"
            value={selectedPo}
            onChange={(e) => setSelectedPo(e.target.value)}
          >
            <option value="">— No PO —</option>
            {pos.map((po) => (
              <option key={po.id} value={po.id}>
                {po.id.slice(0, 8)} • {po.status ?? "draft"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-xs text-neutral-400 mb-1">Location</div>
          <select
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white"
            value={selectedLoc}
            onChange={(e) => setSelectedLoc(e.target.value)}
          >
            {locs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code ?? "LOC"} — {l.name ?? ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-xs text-neutral-400 mb-1">Quantity</div>
          <input
            type="number"
            min={0.01}
            step="0.01"
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white"
            value={qty}
            onChange={(e) => setQty(Math.max(0, Number(e.target.value || 0)))}
          />
        </div>
      </div>

      <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
        <div className="mb-2 flex items-center gap-2">
          {!scanning ? (
            <button
              onClick={startScan}
              className="rounded border border-orange-500 px-3 py-1.5 text-sm text-orange-300 hover:bg-orange-900/20"
            >
              Start Scanner
            </button>
          ) : (
            <button
              onClick={stopScan}
              className="rounded border border-red-500 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/20"
            >
              Stop Scanner
            </button>
          )}
          <span className="text-xs text-neutral-400">
            Use mobile camera to scan UPC/EAN/Code128.
          </span>
        </div>
        <div
          ref={videoRef}
          className="aspect-video w-full overflow-hidden rounded border border-neutral-800 bg-black"
        />
      </div>
    </div>
  );
}
```

---
## app/parts/requests/[id]/page.tsx

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Request = DB["public"]["Tables"]["part_requests"]["Row"];
type Item = DB["public"]["Tables"]["part_request_items"]["Row"] & {
  // schema is catching up
  work_order_line_id?: string | null;
  markup_pct?: number | null;
  qty?: number | null;
};
type Status = Request["status"];
type Part = DB["public"]["Tables"]["parts"]["Row"];
type QuoteUpdate =
  DB["public"]["Tables"]["work_order_quote_lines"]["Update"];

const DEFAULT_MARKUP = 30; // %

type UpsertResponse = {
  ok: boolean;
  menuItemId?: string;
  updated?: boolean;
  error?: string;
  detail?: string;
};

export default function PartsRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [req, setReq] = useState<Request | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingItem, setAddingItem] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [markupPct, setMarkupPct] = useState<Record<string, number>>({});
  const [savedRows, setSavedRows] = useState<Record<string, boolean>>({});
  // per-line manual part inputs
  const [manualParts, setManualParts] = useState<
    Record<string, { name: string; sku: string }>
  >({});

  async function load() {
    setLoading(true);

    // header
    const { data: r, error: rErr } = await supabase
      .from("part_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (rErr) toast.error(rErr.message);
    setReq(r ?? null);

    // items
    const { data: its, error: itErr } = await supabase
      .from("part_request_items")
      .select("*")
      .eq("request_id", id);
    if (itErr) toast.error(itErr.message);
    const itemsList = (its ?? []) as Item[];
    setItems(itemsList);

    // inventory
    if (r?.shop_id) {
      const { data: ps } = await supabase
        .from("parts")
        .select("*")
        .eq("shop_id", r.shop_id)
        .order("name")
        .limit(500);
      setParts(ps ?? []);
    } else {
      setParts([]);
    }

    // markup init
    const m: Record<string, number> = {};
    for (const it of itemsList) {
      m[it.id] =
        typeof it.markup_pct === "number" && !Number.isNaN(it.markup_pct)
          ? it.markup_pct
          : DEFAULT_MARKUP;
    }
    setMarkupPct(m);

    // clear saved flags on fresh load
    setSavedRows({});

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function getLineIdFromItems(list: Item[]): string | null {
    for (const it of list) {
      if (it.work_order_line_id) return it.work_order_line_id;
    }
    return null;
  }

  async function addItem() {
    if (!req) {
      toast.error("Request not loaded yet.");
      return;
    }
    setAddingItem(true);
    try {
      const lineId = getLineIdFromItems(items);

      const insertPayload: DB["public"]["Tables"]["part_request_items"]["Insert"] =
        {
          request_id: req.id,
          work_order_line_id: lineId ?? null,
          description: "",
          qty: 1,
          quoted_price: 0,
          vendor: null,
        };

      const { data, error } = await supabase
        .from("part_request_items")
        .insert(insertPayload)
        .select("*")
        .maybeSingle<Item>();

      if (error) {
        toast.error(error.message);
        return;
      }
      if (!data) {
        toast.error("Could not create a new item.");
        return;
      }

      // append to local state so it feels instant
      setItems((prev) => [...prev, data]);
      setMarkupPct((prev) => ({
        ...prev,
        [data.id]: DEFAULT_MARKUP,
      }));
      setSavedRows((prev) => ({ ...prev, [data.id]: false }));
    } finally {
      setAddingItem(false);
    }
  }

  async function deleteLine(itemId: string) {
    const ok = window.confirm("Remove this item from the request?");
    if (!ok) return;

    const { error } = await supabase
      .from("part_request_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      toast.error(error.message);
      return;
    }

    setItems((prev) => prev.filter((it) => it.id !== itemId));
    setMarkupPct((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
    setSavedRows((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
    setManualParts((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });

    toast.success("Item removed.");
  }

  async function setStatus(s: Status) {
    const { error } = await supabase.rpc("set_part_request_status", {
      p_request: id,
      p_status: s,
    });
    if (error) {
      toast.error(error.message);
      return;
    }

    if (s === "quoted") {
      const lineId = getLineIdFromItems(items);
      if (lineId) {
        // ✅ mark line quoted and pending approval on the WO
        const { error: wolErr } = await supabase
          .from("work_order_lines")
          .update({
            status: "quoted",
            approval_state: "pending",
            hold_reason: "Parts quote ready – awaiting customer approval",
          } as DB["public"]["Tables"]["work_order_lines"]["Update"])
          .eq("id", lineId);
        if (wolErr) {
          console.warn("could not set line to quoted:", wolErr.message);
        }

        // 🔗 sync pricing into work_order_quote_lines for this WO line
        if (req?.work_order_id) {
          let partsTotalForLine = 0;

          for (const it of items) {
            if (it.work_order_line_id !== lineId) continue;

            const cost =
              typeof it.quoted_price === "number" &&
              !Number.isNaN(it.quoted_price)
                ? it.quoted_price
                : 0;
            const m = markupPct[it.id] ?? DEFAULT_MARKUP;
            const unitSell = cost * (1 + m / 100);
            const qty =
              typeof it.qty === "number" && it.qty > 0
                ? Number(it.qty)
                : 0;

            partsTotalForLine += unitSell * qty;
          }

          const { error: quoteErr } = await supabase
            .from("work_order_quote_lines")
            .update({
              stage: "advisor_pending",
              parts_total: partsTotalForLine,
              grand_total: partsTotalForLine,
            } as QuoteUpdate)
            .match({
              work_order_id: req.work_order_id,
              work_order_line_id: lineId,
            });

          if (quoteErr) {
            console.warn(
              "could not sync work_order_quote_lines from parts quote:",
              quoteErr.message,
            );
          }
        }

        // save to menu items (grow Saved Menu)
        try {
          const res = await fetch("/api/menu-items/upsert-from-line", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workOrderLineId: lineId }),
          });

          const j = (await res.json().catch(() => null)) as UpsertResponse | null;

          if (!res.ok || !j?.ok) {
            console.warn("menu save failed:", j);
            const msg =
              j?.detail ||
              j?.error ||
              "Quoted, but couldn’t save to menu items (see server logs / RLS).";
            toast.warning(msg);
          } else {
            const suffix = j.updated ? "updated" : "saved";
            toast.success(`Quoted and ${suffix} to menu items.`);
          }
        } catch (e) {
          console.warn("menu save error:", e);
          const msg =
            e instanceof Error
              ? `Quoted, but couldn’t save to menu items: ${e.message}`
              : "Quoted, but couldn’t save to menu items (network error).";
          toast.warning(msg);
        }
      } else {
        // no linked work_order_line_id → can’t grow menu, just mark quoted
        toast.success("Parts request marked as quoted.");
      }
    } else {
      toast.success(`Parts request marked as ${s}.`);
    }

    await load();
  }

  async function saveLine(it: Item) {
    const qty =
      typeof it.qty === "number" && !Number.isNaN(it.qty) ? it.qty : null;
    if (!qty || qty <= 0) {
      toast.error("Enter a quantity greater than 0 before saving.");
      return;
    }

    const cost =
      typeof it.quoted_price === "number" && !Number.isNaN(it.quoted_price)
        ? it.quoted_price
        : 0;
    const m = markupPct[it.id] ?? DEFAULT_MARKUP;

    const { error } = await supabase
      .from("part_request_items")
      .update({
        vendor: it.vendor ?? null,
        quoted_price: cost,
        qty,
        markup_pct: m,
      })
      .eq("id", it.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setSavedRows((prev) => ({ ...prev, [it.id]: true }));
    toast.success("Line saved");
  }

  async function attachPartToItem(itemId: string, partId: string) {
    const p = parts.find((x) => x.id === partId);
    const desc = p?.name ?? "Part";

    const { error } = await supabase
      .from("part_request_items")
      .update({
        part_id: partId,
        description: desc,
      })
      .eq("id", itemId);

    if (error) {
      console.warn("attachPartToItem failed:", error.message);
      toast.error("Cannot attach part — check RLS.");
    } else {
      // change → unsave
      setSavedRows((prev) => ({ ...prev, [itemId]: false }));
      await load();
    }
  }

  // manual: create part in inventory, then attach
  async function createManualPartAndAttach(
    itemId: string,
    name: string,
    sku: string,
  ) {
    const item = items.find((x) => x.id === itemId);
    if (!item) return;
    if (!req?.shop_id) {
      toast.error("Cannot create part — missing shop.");
      return;
    }
    if (!name.trim()) {
      toast.error("Enter a name for the part.");
      return;
    }

    // create part in inventory
    const { data: inserted, error } = await supabase
      .from("parts")
      .insert({
        shop_id: req.shop_id,
        name: name.trim(),
        sku: sku.trim() || null,
      })
      .select("*")
      .maybeSingle<Part>();

    if (error) {
      toast.error(error.message);
      return;
    }

    if (!inserted) {
      toast.error("Unable to create part.");
      return;
    }

    // attach to item
    const { error: attachErr } = await supabase
      .from("part_request_items")
      .update({
        part_id: inserted.id,
        description: inserted.name ?? name.trim(),
      })
      .eq("id", itemId);

    if (attachErr) {
      toast.error(attachErr.message);
      return;
    }

    toast.success("Part created and attached.");
    // clear manual fields for that line
    setManualParts((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });

    // reload so the new part shows up in the select too
    await load();
  }

  const grandTotals = (() => {
    let sum = 0;
    for (const it of items) {
      const cost =
        typeof it.quoted_price === "number" && !Number.isNaN(it.quoted_price)
          ? it.quoted_price
          : 0;
      const m = markupPct[it.id] ?? DEFAULT_MARKUP;
      const unitSell = cost * (1 + m / 100);
      const qty =
        typeof it.qty === "number" && it.qty > 0 ? Number(it.qty) : 0;
      sum += unitSell * qty;
    }
    return sum;
  })();

  return (
    <div className="space-y-4 p-6 text-white">
      <button
        className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
        onClick={() => router.back()}
      >
        ← Back
      </button>

      {loading || !req ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-neutral-400">
          Loading…
        </div>
      ) : (
        <>
          {/* header */}
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xl font-semibold">
                  Request #{req.id.slice(0, 8)}
                </div>
                <div className="text-sm text-neutral-400">
                  WO: {req.work_order_id ?? "—"} ·{" "}
                  {req.created_at
                    ? new Date(req.created_at).toLocaleString()
                    : "—"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs capitalize text-neutral-200">
                  Status: {req.status}
                </span>
                {req.status !== "approved" && (
                  <button
                    className="rounded border border-blue-600 px-3 py-1.5 text-sm text-blue-300 hover:bg-blue-900/20"
                    onClick={() => void setStatus("approved")}
                  >
                    Mark Approved
                  </button>
                )}
                {req.status !== "quoted" && (
                  <button
                    className="rounded border border-orange-500 px-3 py-1.5 text-sm text-orange-300 hover:bg-orange-500/10"
                    onClick={() => void setStatus("quoted")}
                  >
                    Mark Quoted
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* items + table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-200">
                Items in this request
              </h2>
              <button
                type="button"
                className="inline-flex items-center rounded border border-neutral-600 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-100 hover:bg-neutral-800 disabled:opacity-60"
                onClick={() => void addItem()}
                disabled={addingItem}
              >
                {addingItem ? "Adding…" : "＋ Add item"}
              </button>
            </div>

            <div className="overflow-hidden rounded border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="bg-neutral-900 text-neutral-400">
                  <tr>
                    <th className="p-2 text-left">Inventory</th>
                    <th className="p-2 text-left">Description</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-left">Vendor</th>
                    <th className="p-2 text-right">Cost (unit)</th>
                    <th className="p-2 text-right">Markup %</th>
                    <th className="p-2 text-right">Sell (unit)</th>
                    <th className="p-2 text-right">Line total</th>
                    <th className="w-32 p-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const cost =
                      typeof it.quoted_price === "number" &&
                      !Number.isNaN(it.quoted_price)
                        ? it.quoted_price
                        : 0;
                    const m = markupPct[it.id] ?? DEFAULT_MARKUP;
                    const qty =
                      typeof it.qty === "number" && it.qty > 0
                        ? it.qty
                        : null;
                    const unitSell = cost * (1 + m / 100);
                    const lineTotal = unitSell * (qty ?? 0);
                    const isSaved = savedRows[it.id] === true;

                    const manual = manualParts[it.id] || {
                      name: "",
                      sku: "",
                    };

                    return (
                      <tr
                        key={it.id}
                        className={`border-t border-neutral-800 ${
                          isSaved ? "bg-neutral-900/50 text-neutral-400" : ""
                        }`}
                      >
                        <td className="p-2 align-top">
                          <div className="flex flex-col gap-1">
                            <select
                              className="w-40 rounded border border-neutral-700 bg-neutral-900 p-1 text-xs disabled:opacity-50"
                              value={it.part_id ?? ""}
                              onChange={(e) => {
                                setSavedRows((prev) => ({
                                  ...prev,
                                  [it.id]: false,
                                }));
                                void attachPartToItem(it.id, e.target.value);
                              }}
                              disabled={isSaved}
                            >
                              <option value="">— select —</option>
                              {parts.map((p) => (
                                <option key={p.id} value={p.id as string}>
                                  {p.sku ? `${p.sku} — ${p.name}` : p.name}
                                </option>
                              ))}
                            </select>

                            {/* manual entry */}
                            <div className="flex gap-1">
                              <input
                                className="flex-1 rounded border border-neutral-700 bg-neutral-900 p-1 text-xs disabled:opacity-50"
                                placeholder="Manual part name"
                                value={manual.name}
                                onChange={(e) =>
                                  setManualParts((prev) => ({
                                    ...prev,
                                    [it.id]: {
                                      name: e.target.value,
                                      sku: prev[it.id]?.sku ?? "",
                                    },
                                  }))
                                }
                                disabled={isSaved}
                              />
                              <input
                                className="w-20 rounded border border-neutral-700 bg-neutral-900 p-1 text-xs disabled:opacity-50"
                                placeholder="SKU"
                                value={manual.sku}
                                onChange={(e) =>
                                  setManualParts((prev) => ({
                                    ...prev,
                                    [it.id]: {
                                      name: prev[it.id]?.name ?? "",
                                      sku: e.target.value,
                                    },
                                  }))
                                }
                                disabled={isSaved}
                              />
                            </div>
                            <button
                              className="rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs hover:bg-neutral-800 disabled:opacity-50"
                              onClick={() =>
                                void createManualPartAndAttach(
                                  it.id,
                                  manual.name,
                                  manual.sku,
                                )
                              }
                              disabled={isSaved}
                            >
                              Add & attach
                            </button>
                          </div>
                        </td>
                        <td className="p-2 align-top">
                          <input
                            className="w-full rounded border border-neutral-700 bg-neutral-900 p-1 text-xs disabled:opacity-50"
                            value={it.description ?? ""}
                            placeholder="Description"
                            onChange={(e) => {
                              const v = e.target.value;
                              setItems((prev) =>
                                prev.map((x) =>
                                  x.id === it.id
                                    ? ({ ...x, description: v } as Item)
                                    : x,
                                ),
                              );
                              setSavedRows((prev) => ({
                                ...prev,
                                [it.id]: false,
                              }));
                            }}
                            disabled={isSaved}
                          />
                        </td>
                        <td className="p-2 text-right align-top">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className="w-16 rounded border border-neutral-700 bg-neutral-900 p-1 text-right disabled:opacity-50"
                            value={qty ?? ""} // allow empty
                            onChange={(e) => {
                              const raw = e.target.value;
                              setItems((prev) => {
                                return prev.map((x) => {
                                  if (x.id !== it.id) return x;
                                  return {
                                    ...x,
                                    qty: raw === "" ? null : Number(raw),
                                  } as Item;
                                });
                              });
                              setSavedRows((prev) => ({
                                ...prev,
                                [it.id]: false,
                              }));
                            }}
                            disabled={isSaved}
                          />
                        </td>
                        <td className="p-2 align-top">
                          <input
                            className="w-32 rounded border border-neutral-700 bg-neutral-900 p-1 disabled:opacity-50"
                            value={it.vendor ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setItems((prev) =>
                                prev.map((x) =>
                                  x.id === it.id ? { ...x, vendor: v } : x,
                                ),
                              );
                              setSavedRows((prev) => ({
                                ...prev,
                                [it.id]: false,
                              }));
                            }}
                            disabled={isSaved}
                          />
                        </td>
                        <td className="p-2 text-right align-top">
                          <input
                            type="number"
                            step={0.01}
                            className="w-24 rounded border border-neutral-700 bg-neutral-900 p-1 text-right disabled:opacity-50"
                            value={cost === 0 ? "" : cost}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const v = raw === "" ? null : Number(raw);
                              setItems((prev) =>
                                prev.map((x) =>
                                  x.id === it.id
                                    ? ({ ...x, quoted_price: v } as Item)
                                    : x,
                                ),
                              );
                              setSavedRows((prev) => ({
                                ...prev,
                                [it.id]: false,
                              }));
                            }}
                            disabled={isSaved}
                          />
                        </td>
                        <td className="p-2 text-right align-top">
                          <input
                            type="number"
                            step={1}
                            className="w-20 rounded border border-neutral-700 bg-neutral-900 p-1 text-right disabled:opacity-50"
                            value={m}
                            onChange={(e) => {
                              setMarkupPct((prev) => ({
                                ...prev,
                                [it.id]: Math.max(
                                  0,
                                  Number(e.target.value || DEFAULT_MARKUP),
                                ),
                              }));
                              setSavedRows((prev) => ({
                                ...prev,
                                [it.id]: false,
                              }));
                            }}
                            disabled={isSaved}
                          />
                        </td>
                        <td className="p-2 text-right tabular-nums align-top">
                          {unitSell.toFixed(2)}
                        </td>
                        <td className="p-2 text-right tabular-nums align-top">
                          {lineTotal.toFixed(2)}
                        </td>
                        <td className="p-2 align-top">
                          <div className="flex flex-col items-stretch gap-1">
                            <button
                              className={`rounded border px-2 py-1 text-xs ${
                                isSaved
                                  ? "cursor-default border-neutral-700 bg-neutral-800/60 text-neutral-300"
                                  : "border-neutral-700 hover:bg-neutral-800"
                              }`}
                              onClick={() => !isSaved && void saveLine(it)}
                              disabled={isSaved}
                            >
                              {isSaved ? "Saved" : "Save"}
                            </button>
                            <button
                              className="rounded border border-red-700 px-2 py-1 text-xs text-red-200 hover:bg-red-900/40"
                              onClick={() => void deleteLine(it.id as string)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-neutral-900/50">
                    <td className="p-2 text-right" colSpan={7}>
                      <span className="text-sm text-neutral-300">
                        Total (with markup)
                      </span>
                    </td>
                    <td className="p-2 text-right tabular-nums font-semibold">
                      {grandTotals.toFixed(2)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

---
## app/parts/requests/page.tsx

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Request = DB["public"]["Tables"]["part_requests"]["Row"];
type Item = DB["public"]["Tables"]["part_request_items"]["Row"];
type WorkOrderMeta = {
  id: string;
  custom_id: string | null;
};

const ALL_STATUSES: Request["status"][] = [
  "requested",
  "quoted",
  "approved",
  "fulfilled",
  "rejected",
  "cancelled",
];

// Status columns we actually want to show on THIS page
const VISIBLE_STATUSES: Request["status"][] = [
  "requested",
  "quoted",
  "approved",
];

function makeEmptyBuckets(): Record<
  Request["status"],
  (Request & { items: Item[] })[]
> {
  return {
    requested: [],
    quoted: [],
    approved: [],
    fulfilled: [],
    rejected: [],
    cancelled: [],
  };
}

export default function PartsRequestsPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [byStatus, setByStatus] = useState<
    Record<Request["status"], (Request & { items: Item[] })[]>
  >(makeEmptyBuckets());

  const [workOrdersById, setWorkOrdersById] = useState<
    Record<string, WorkOrderMeta>
  >({});

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);

      // 1) fetch all requests
      const { data: reqs, error } = await supabase
        .from("part_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("load part_requests failed:", error.message);
        toast.error("Failed to load parts requests");
        setLoading(false);
        return;
      }

      const requestList = (reqs ?? []) as Request[];
      const requestIds = requestList.map((r) => r.id);

      // 2) fetch all items for these requests
      const itemsMap: Record<string, Item[]> = {};
      if (requestIds.length) {
        const { data: items } = await supabase
          .from("part_request_items")
          .select("*")
          .in("request_id", requestIds);

        for (const it of items ?? []) {
          (itemsMap[it.request_id] ||= []).push(it);
        }
      }

      // 3) fetch work order metadata for display (TU000001 instead of UUID)
      const woIds = Array.from(
        new Set(
          requestList
            .map((r) => r.work_order_id)
            .filter((id): id is string => typeof id === "string" && !!id),
        ),
      );

      const woMap: Record<string, WorkOrderMeta> = {};
      if (woIds.length) {
        const { data: workOrders, error: woError } = await supabase
          .from("work_orders")
          .select("id, custom_id")
          .in("id", woIds);

        if (woError) {
          console.error(
            "load work_orders for parts requests failed:",
            woError.message,
          );
        } else {
          for (const wo of workOrders ?? []) {
            woMap[wo.id] = {
              id: wo.id,
              custom_id: wo.custom_id ?? null,
            };
          }
        }
      }
      setWorkOrdersById(woMap);

      // 4) group by status
      const grouped = makeEmptyBuckets();

      for (const r of requestList) {
        const status = (r.status ?? "requested") as Request["status"];
        const bucket = grouped[status] ?? grouped.requested;
        bucket.push({ ...r, items: itemsMap[r.id] ?? [] });
      }

      setByStatus(grouped);
      setLoading(false);
    })();
  }, [supabase]);

  // Derived: apply search filter client-side
  const filteredByStatus = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return byStatus;

    const filtered = makeEmptyBuckets();

    (ALL_STATUSES as Request["status"][]).forEach((status) => {
      const list = byStatus[status] ?? [];
      filtered[status] = list.filter((r) => {
        const woMeta = r.work_order_id
          ? workOrdersById[r.work_order_id]
          : undefined;

        // label used both for display and search
        const woLabel =
          woMeta?.custom_id ||
          woMeta?.id ||
          r.work_order_id || // fall back to raw FK if meta missing
          "";

        const inWorkOrder = woLabel.toLowerCase().includes(q);
        const inRequestId = r.id.toLowerCase().includes(q);
        const inItems = (r.items ?? []).some((it) =>
          (it.description ?? "").toLowerCase().includes(q),
        );

        return inWorkOrder || inRequestId || inItems;
      });
    });

    return filtered;
  }, [search, byStatus, workOrdersById]);

  const handleDelete = async (requestId: string) => {
    const confirmed = window.confirm(
      "Delete this parts request? This will also remove its items.",
    );
    if (!confirmed) return;

    // delete items first (in case cascade is not configured)
    const { error: itemsError } = await supabase
      .from("part_request_items")
      .delete()
      .eq("request_id", requestId);

    if (itemsError) {
      console.error(
        "delete part_request_items failed:",
        itemsError.message,
      );
      toast.error("Unable to delete request items.");
      return;
    }

    const { error } = await supabase
      .from("part_requests")
      .delete()
      .eq("id", requestId);

    if (error) {
      console.error("delete part_requests failed:", error.message);
      toast.error("Unable to delete parts request.");
      return;
    }

    // update local state
    setByStatus((prev) => {
      const next = makeEmptyBuckets();
      (ALL_STATUSES as Request["status"][]).forEach((status) => {
        next[status] = (prev[status] ?? []).filter(
          (r) => r.id !== requestId,
        );
      });
      return next;
    });

    toast.success("Parts request deleted.");
  };

  const totalVisibleCount = VISIBLE_STATUSES.reduce(
    (sum, status) => sum + (filteredByStatus[status]?.length ?? 0),
    0,
  );

  return (
    <div className="space-y-4 p-6 text-white">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Parts Requests</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Active requests that still need quoting or approval. Completed
            requests move off this list.
          </p>
        </div>
        <Link
          href="/parts"
          className="inline-flex items-center rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
        >
          Parts Catalog
        </Link>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-xs text-neutral-500">
          Search by WO#, request id, or line description. Showing{" "}
          <span className="font-semibold text-neutral-200">
            {totalVisibleCount}
          </span>{" "}
          active request{totalVisibleCount === 1 ? "" : "s"}.
        </p>
        <div className="w-full md:w-80">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search requests…"
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-neutral-400">
          Loading…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {VISIBLE_STATUSES.map((status) => {
            const list = filteredByStatus[status] ?? [];
            return (
              <div
                key={status}
                className="flex flex-col rounded border border-neutral-800 bg-neutral-900"
              >
                <div className="border-b border-neutral-800 px-3 py-2 text-sm capitalize text-neutral-300">
                  {status}
                </div>
                <div className="flex-1 space-y-3 p-3">
                  {list.length === 0 ? (
                    <div className="text-sm text-neutral-500">
                      No requests
                    </div>
                  ) : (
                    list.map((r) => {
                      const woMeta = r.work_order_id
                        ? workOrdersById[r.work_order_id]
                        : undefined;

                      // Prefer TU000001-style custom id; otherwise fall back
                      // to whatever FK we have, shortened.
                      const woDisplayId =
                        woMeta?.custom_id ||
                        (woMeta?.id ??
                          r.work_order_id ??
                          "")
                          .toString()
                          .slice(0, 8) || null;

                      return (
                        <div
                          key={r.id}
                          className="rounded border border-neutral-800 bg-neutral-950"
                        >
                          <Link
                            href={`/parts/requests/${r.id}`}
                            className="block p-3 hover:border-orange-500"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold">
                                  WO: {woDisplayId ?? "—"}
                                </div>
                                <div className="text-xs text-neutral-400">
                                  {r.created_at
                                    ? new Date(
                                        r.created_at,
                                      ).toLocaleString()
                                    : "—"}
                                </div>
                              </div>
                            </div>

                            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                              {(r.items ?? []).slice(0, 4).map((it) => (
                                <li key={it.id}>
                                  {it.description} × {Number(it.qty)}
                                </li>
                              ))}
                              {(r.items ?? []).length > 4 && (
                                <li>
                                  + {(r.items ?? []).length - 4} more…
                                </li>
                              )}
                            </ul>
                          </Link>

                          <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-3 py-2">
                            <button
                              type="button"
                              onClick={() => void handleDelete(r.id)}
                              className="text-xs font-medium text-red-300 hover:text-red-200"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

--
## app/parts/vendors/page.tsx

```tsx
"use client";
import { useState } from "react";

export default function VendorKeysPage() {
  const [vendor, setVendor] = useState("partstech");
  const [apiKey, setApiKey] = useState("");

  const save = async () => {
    // TODO: call /api/vendors/save to encrypt & store per shop
    alert(`Would save key for ${vendor}: ${apiKey.slice(0,4)}…`);
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Vendor Integrations</h1>
      <div className="rounded border border-neutral-800 bg-neutral-900 p-4 max-w-lg space-y-2">
        <label className="text-sm">Vendor</label>
        <select className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
          value={vendor} onChange={e=>setVendor(e.target.value)}>
          <option value="partstech">PartsTech</option>
          <option value="generic-email">Generic Email PO</option>
        </select>
        <label className="text-sm mt-2">API Key / Credential</label>
        <input className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
          placeholder="paste key…" value={apiKey} onChange={e=>setApiKey(e.target.value)} />
        <div className="pt-2">
          <button className="rounded bg-orange-500 px-3 py-2 text-black" onClick={save}>Save</button>
        </div>
      </div>
      <p className="text-xs text-neutral-500">Keys are stored per shop (encrypted at rest).</p>
    </div>
  );
}

```

---
## app/parts/warranties/page.tsx

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { v4 as uuidv4 } from "uuid";
import { format, addMonths, isBefore, differenceInDays } from "date-fns";
import { toast } from "sonner";

/* ----------------------------- Local Types ----------------------------- */
type UUID = string;

type Warranty = {
  id: UUID;
  shop_id: UUID;
  part_id: UUID;
  work_order_id: UUID | null;
  work_order_line_id: UUID | null;
  customer_id: UUID | null;
  vehicle_id: UUID | null;
  supplier_id: UUID | null;
  installed_at: string;
  warranty_months: number;
  expires_at: string;
  notes: string | null;
  created_at?: string | null;
};

type WarrantyClaimStatus = "open" | "approved" | "denied" | "replaced" | "closed";

type WarrantyClaim = {
  id: UUID;
  warranty_id: UUID;
  opened_at: string;
  status: WarrantyClaimStatus;
  supplier_rma: string | null;
  notes: string | null;
  created_at?: string | null;
};

type Lookups = {
  parts: Record<string, { name: string | null; sku: string | null }>;
  suppliers: Record<string, { name: string | null }>;
  customers: Record<string, { first_name: string | null; last_name: string | null }>;
  vehicles: Record<string, { year: number | null; make: string | null; model: string | null }>;
  work_orders: Record<string, { custom_id: string | null }>;
};

/* Minimal Part type for the picker (matches your parts table) */
type PartLite = {
  id: UUID;
  shop_id: UUID | null;
  name: string | null;
  sku: string | null;
  category: string | null;
};

/* ----------------------------- UI Helpers ----------------------------- */
const outlineBtn =
  "font-header rounded border px-3 py-2 text-sm transition-colors";
const outlineNeutral = `${outlineBtn} border-neutral-700 text-neutral-200 hover:bg-neutral-800`;
const outlineInfo = `${outlineBtn} border-blue-600 text-blue-300 hover:bg-blue-900/20`;

type Tab = "active" | "expiring" | "expired" | "all";

/* ===================================================================== */
/*                        Part Picker (inline dialog)                     */
/* ===================================================================== */
function PartPickerDialog({
  open,
  onClose,
  shopId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  onPick: (p: PartLite) => void;
}): JSX.Element | null {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [q, setQ] = useState<string>("");
  const [rows, setRows] = useState<PartLite[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!open || !shopId) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        // Base query
        let query = supabase
          .from("parts")
          .select("id, shop_id, name, sku, category")
          .eq("shop_id", shopId)
          .order("name", { ascending: true })
          .limit(50);

        const term = q.trim();
        if (term) {
          query = query.or(
            `name.ilike.%${term}%,sku.ilike.%${term}%,category.ilike.%${term}%`
          );
        }

        const { data, error } = await query;
        if (!cancelled) {
          if (error) {
            toast.error(error.message);
            setRows([]);
          } else {
            setRows((data ?? []) as PartLite[]);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, q, shopId, supabase]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[340] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-[350] w-full max-w-2xl rounded border border-orange-400 bg-neutral-950 p-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-semibold">Pick a Part</div>
          <button
            className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="mb-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name / SKU / category…"
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
          />
        </div>

        <div className="rounded border border-neutral-800 max-h-80 overflow-auto">
          {loading ? (
            <div className="p-3 text-neutral-300 text-sm">Searching…</div>
          ) : rows.length === 0 ? (
            <div className="p-3 text-neutral-400 text-sm">No parts found.</div>
          ) : (
            <ul className="divide-y divide-neutral-800">
              {rows.map((p) => (
                <li key={p.id}>
                  <button
                    className="block w-full px-3 py-2 text-left hover:bg-neutral-900/60"
                    onClick={() => {
                      onPick(p);
                      onClose();
                    }}
                  >
                    <div className="font-medium truncate">{p.name ?? "Part"}</div>
                    <div className="text-xs text-neutral-400">
                      {p.sku ?? "—"} • {p.category ?? "Uncategorized"}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex justify-end">
          <button className={outlineNeutral} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===================================================================== */
/*                               PAGE                                    */
/* ===================================================================== */
export default function WarrantiesPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient(), []);

  const [shopId, setShopId] = useState<string>("");
  const [ready, setReady] = useState(false);

  const [rows, setRows] = useState<Warranty[]>([]);
  const [claimsByWarranty, setClaimsByWarranty] = useState<Record<string, WarrantyClaim[]>>({});
  const [lookups, setLookups] = useState<Lookups>({
    parts: {},
    suppliers: {},
    customers: {},
    vehicles: {},
    work_orders: {},
  });

  const [tab, setTab] = useState<Tab>("active");
  const [q, setQ] = useState("");

  // Modal state
  const [openReg, setOpenReg] = useState(false);
  const [openClaim, setOpenClaim] = useState<null | { warranty: Warranty }>(null);
  const [openPartPicker, setOpenPartPicker] = useState(false);

  // Register form
  const [partId, setPartId] = useState("");
  const [months, setMonths] = useState<number>(12);
  const [installedAt, setInstalledAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState<string>("");
  const [woId, setWoId] = useState<string>("");
  const [woLineId, setWoLineId] = useState<string>("");
  const [vehicleId, setVehicleId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Claim form
  const [claimStatus, setClaimStatus] = useState<WarrantyClaimStatus>("open");
  const [claimRma, setClaimRma] = useState("");
  const [claimNotes, setClaimNotes] = useState("");

  // Feature-detection
  const [hasTables, setHasTables] = useState<{ warranties: boolean; claims: boolean }>({
    warranties: true,
    claims: true,
  });

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setReady(true);
          return;
        }
        const { data: prof } = await supabase
          .from("profiles")
          .select("shop_id")
          .eq("user_id", user.id)
          .maybeSingle();
        const sid = String(prof?.shop_id ?? "");
        setShopId(sid);

        const w = await supabase.from("warranties").select("id").limit(1);
        const c = await supabase.from("warranty_claims").select("id").limit(1);
        setHasTables({ warranties: !w.error, claims: !c.error });

        if (!sid || w.error) {
          setReady(true);
          return;
        }

        await loadAll(sid);
      } finally {
        setReady(true);
      }
    })();
  }, [supabase]);

  const loadAll = async (sid: string) => {
    const { data, error } = await supabase
      .from("warranties")
      .select("*")
      .eq("shop_id", sid)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    const ws = (data ?? []) as Warranty[];
    setRows(ws);

    if (ws.length && hasTables.claims) {
      const ids = ws.map((w) => w.id);
      const { data: cs } = await supabase
        .from("warranty_claims")
        .select("*")
        .in("warranty_id", ids)
        .order("created_at", { ascending: false });
      const byW: Record<string, WarrantyClaim[]> = {};
      (cs ?? []).forEach((cRow) => {
        const wId = (cRow as WarrantyClaim).warranty_id;
        if (!byW[wId]) byW[wId] = [];
        byW[wId].push(cRow as WarrantyClaim);
      });
      setClaimsByWarranty(byW);
    } else {
      setClaimsByWarranty({});
    }

    await loadLookups(ws);
  };

  const loadLookups = async (ws: Warranty[]) => {
    const partsIds = Array.from(new Set(ws.map((w) => w.part_id).filter(Boolean)));
    const suppIds = Array.from(new Set(ws.map((w) => w.supplier_id).filter(Boolean) as string[]));
    const custIds = Array.from(new Set(ws.map((w) => w.customer_id).filter(Boolean) as string[]));
    const vehIds = Array.from(new Set(ws.map((w) => w.vehicle_id).filter(Boolean) as string[]));
    const woIds = Array.from(new Set(ws.map((w) => w.work_order_id).filter(Boolean) as string[]));

    const [pRes, sRes, cRes, vRes, woRes] = await Promise.all([
      partsIds.length
        ? supabase.from("parts").select("id,name,sku").in("id", partsIds)
        : Promise.resolve({ data: [] }),
      suppIds.length
        ? supabase.from("suppliers").select("id,name").in("id", suppIds)
        : Promise.resolve({ data: [] }),
      custIds.length
        ? supabase.from("customers").select("id,first_name,last_name").in("id", custIds)
        : Promise.resolve({ data: [] }),
      vehIds.length
        ? supabase.from("vehicles").select("id,year,make,model").in("id", vehIds)
        : Promise.resolve({ data: [] }),
      woIds.length
        ? supabase.from("work_orders").select("id,custom_id").in("id", woIds)
        : Promise.resolve({ data: [] }),
    ]);

    const lk: Lookups = {
      parts: Object.fromEntries((pRes.data ?? []).map((r) => [String(r.id), { name: r.name ?? null, sku: r.sku ?? null }])),
      suppliers: Object.fromEntries((sRes.data ?? []).map((r) => [String(r.id), { name: r.name ?? null }])),
      customers: Object.fromEntries((cRes.data ?? []).map((r) => [String(r.id), { first_name: r.first_name ?? null, last_name: r.last_name ?? null }])),
      vehicles: Object.fromEntries((vRes.data ?? []).map((r) => [String(r.id), { year: r.year ?? null, make: r.make ?? null, model: r.model ?? null }])),
      work_orders: Object.fromEntries((woRes.data ?? []).map((r) => [String(r.id), { custom_id: r.custom_id ?? null }])),
    };
    setLookups(lk);
  };

  const now = new Date();
  const filtered = rows.filter((w) => {
    const exp = new Date(w.expires_at);
    const isExpired = isBefore(exp, now);
    const days = differenceInDays(exp, now);
    const expSoon = days >= 0 && days <= 30;

    const keep =
      tab === "all" ||
      (tab === "expired" && isExpired) ||
      (tab === "expiring" && expSoon) ||
      (tab === "active" && !isExpired && !expSoon);

    if (!keep) return false;

    const p = lookups.parts[w.part_id];
    const supplier = w.supplier_id ? lookups.suppliers[w.supplier_id] : undefined;
    const hay = [
      p?.name ?? "",
      p?.sku ?? "",
      supplier?.name ?? "",
      w.notes ?? "",
      lookups.work_orders[w.work_order_id ?? ""]?.custom_id ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const registerWarranty = async () => {
    if (!shopId || !partId || !months || months <= 0) {
      toast.error("Part, months, and shop are required");
      return;
    }
    const installedIso = new Date(installedAt).toISOString();
    const expiresIso = addMonths(new Date(installedIso), months).toISOString();

    const payload: Warranty = {
      id: uuidv4(),
      shop_id: shopId,
      part_id: partId,
      supplier_id: supplierId || null,
      work_order_id: woId || null,
      work_order_line_id: woLineId || null,
      customer_id: customerId || null,
      vehicle_id: vehicleId || null,
      installed_at: installedIso,
      warranty_months: months,
      expires_at: expiresIso,
      notes: notes.trim() || null,
    };

    const { error } = await supabase.from("warranties").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Warranty registered");
    setOpenReg(false);
    setPartId("");
    setSupplierId("");
    setWoId("");
    setWoLineId("");
    setCustomerId("");
    setVehicleId("");
    setMonths(12);
    setInstalledAt(new Date().toISOString().slice(0, 10));
    setNotes("");

    await loadAll(shopId);
  };

  const openClaimFor = (w: Warranty) => {
    setOpenClaim({ warranty: w });
    setClaimStatus("open");
    setClaimRma("");
    setClaimNotes("");
  };

  const createClaim = async () => {
    if (!openClaim) return;
    const payload: WarrantyClaim = {
      id: uuidv4(),
      warranty_id: openClaim.warranty.id,
      opened_at: new Date().toISOString(),
      status: claimStatus,
      supplier_rma: claimRma.trim() || null,
      notes: claimNotes.trim() || null,
    };
    const { error } = await supabase.from("warranty_claims").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Claim created");
    setOpenClaim(null);
    await loadAll(shopId);
  };

  const updateClaimStatus = async (claimId: string, next: WarrantyClaimStatus) => {
    const { error } = await supabase.from("warranty_claims").update({ status: next }).eq("id", claimId);
    if (error) {
      toast.error(error.message);
      return;
    }
    await loadAll(shopId);
  };

  if (!ready) {
    return <div className="p-6 text-white">Loading…</div>;
  }

  if (!hasTables.warranties) {
    return (
      <div className="p-6 text-white">
        <h1 className="text-2xl font-semibold">Warranties</h1>
        <div className="mt-3 rounded border border-amber-600 bg-amber-900/20 p-4 text-amber-200">
          <div className="font-semibold mb-1">Setup required</div>
          <p className="text-sm">
            The <code>warranties</code> (and optionally <code>warranty_claims</code>) tables don’t exist yet.
            Create them to enable this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Warranties</h1>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search parts / WO / notes…"
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
          />
          <button className={outlineInfo} onClick={() => setOpenReg(true)}>Register Warranty</button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["active", "expiring", "expired", "all"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`rounded px-2 py-1 text-sm border ${
              tab === t ? "border-orange-500 text-orange-300" : "border-neutral-700 text-neutral-300"
            }`}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-neutral-300">
          No warranties found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-950 text-neutral-400">
              <tr>
                <th className="px-3 py-2 text-left">Part</th>
                <th className="px-3 py-2 text-left">Supplier</th>
                <th className="px-3 py-2 text-left">Installed</th>
                <th className="px-3 py-2 text-left">Months</th>
                <th className="px-3 py-2 text-left">Expires</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">WO</th>
                <th className="px-3 py-2 text-left">Vehicle</th>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-left">Claims</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => {
                const p = lookups.parts[w.part_id];
                const s = w.supplier_id ? lookups.suppliers[w.supplier_id] : undefined;
                const wo = w.work_order_id ? lookups.work_orders[w.work_order_id] : undefined;
                const v = w.vehicle_id ? lookups.vehicles[w.vehicle_id] : undefined;
                const c = w.customer_id ? lookups.customers[w.customer_id] : undefined;

                const expDate = new Date(w.expires_at);
                const expired = isBefore(expDate, now);
                const days = differenceInDays(expDate, now);
                const expSoon = days >= 0 && days <= 30;

                const claims = claimsByWarranty[w.id] ?? [];
                const statusChip =
                  expired
                    ? "bg-red-900/30 border-red-600 text-red-300"
                    : expSoon
                    ? "bg-amber-900/20 border-amber-600 text-amber-300"
                    : "bg-green-900/20 border-green-600 text-green-300";

                return (
                  <tr key={w.id} className="border-t border-neutral-800">
                    <td className="px-3 py-2">
                      <div className="font-medium">{p?.name ?? "Part"}</div>
                      <div className="text-xs text-neutral-400">{p?.sku ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2">{s?.name ?? "—"}</td>
                    <td className="px-3 py-2">{format(new Date(w.installed_at), "PP")}</td>
                    <td className="px-3 py-2">{w.warranty_months}</td>
                    <td className="px-3 py-2">{format(expDate, "PP")}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded border px-2 py-0.5 text-xs ${statusChip}`}>
                        {expired ? "Expired" : expSoon ? `Expiring (${days}d)` : "Active"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {w.work_order_id ? (
                        <Link
                          className="text-orange-400 hover:underline"
                          href={`/work-orders/${w.work_order_id}`}
                          title="Open work order"
                        >
                          {wo?.custom_id ?? w.work_order_id.slice(0, 8)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {v ? <span>{[v.year, v.make, v.model].filter(Boolean).join(" ")}</span> : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {c ? <span>{[c.first_name, c.last_name].filter(Boolean).join(" ")}</span> : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {claims.length === 0 ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {claims.map((cl) => (
                            <div key={cl.id} className="flex items-center justify-between gap-2">
                              <span className="text-xs">
                                {format(new Date(cl.opened_at), "PP")} • {cl.status}
                                {cl.supplier_rma ? ` • RMA ${cl.supplier_rma}` : ""}
                              </span>
                              <div className="flex items-center gap-1">
                                {(["open", "approved", "replaced", "closed", "denied"] as WarrantyClaimStatus[]).map(
                                  (st) => (
                                    <button
                                      key={st}
                                      className="rounded border border-neutral-700 px-1.5 py-0.5 text-[11px] hover:bg-neutral-800"
                                      onClick={() => updateClaimStatus(cl.id, st)}
                                      title={`Set ${st}`}
                                    >
                                      {st}
                                    </button>
                                  ),
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button className={outlineInfo} onClick={() => openClaimFor(w)}>
                          Open Claim
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

      {/* Register modal */}
      {openReg && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpenReg(false)} />
          <div
            className="relative z-[310] w-full max-w-xl rounded border border-orange-400 bg-neutral-950 p-4 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-lg font-semibold">Register Warranty</div>
              <button
                className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
                onClick={() => setOpenReg(false)}
              >
                ✕
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Part field with picker */}
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm text-neutral-300">Part</label>
                <div className="flex items-center gap-2">
                  <input
                    value={partId}
                    onChange={(e) => setPartId(e.target.value)}
                    placeholder="Part UUID (or use picker)"
                    className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                  />
                  <button
                    type="button"
                    className={outlineInfo}
                    onClick={() => setOpenPartPicker(true)}
                    disabled={!shopId}
                    title={shopId ? "Search parts" : "No shop selected"}
                  >
                    Pick
                  </button>
                </div>
                {partId && lookups.parts[partId] ? (
                  <div className="mt-1 text-xs text-neutral-400">
                    {lookups.parts[partId]?.name} ({lookups.parts[partId]?.sku})
                  </div>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Supplier (optional)</label>
                <input
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  placeholder="Supplier UUID"
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Installed Date</label>
                <input
                  type="date"
                  value={installedAt}
                  onChange={(e) => setInstalledAt(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Warranty Months</label>
                <input
                  type="number"
                  min={1}
                  value={months}
                  onChange={(e) => setMonths(Math.max(1, Number(e.target.value || 1)))}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Work Order (optional)</label>
                <input
                  value={woId}
                  onChange={(e) => setWoId(e.target.value)}
                  placeholder="Work order UUID"
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">WO Line (optional)</label>
                <input
                  value={woLineId}
                  onChange={(e) => setWoLineId(e.target.value)}
                  placeholder="Work order line UUID"
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Vehicle (optional)</label>
                <input
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  placeholder="Vehicle UUID"
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Customer (optional)</label>
                <input
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  placeholder="Customer UUID"
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm text-neutral-300">Notes</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                  placeholder="Terms, conditions, etc."
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className={outlineNeutral} onClick={() => setOpenReg(false)}>
                Cancel
              </button>
              <button className={outlineInfo} onClick={registerWarranty}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Claim modal */}
      {openClaim && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpenClaim(null)} />
          <div
            className="relative z-[310] w/full max-w-lg rounded border border-orange-400 bg-neutral-950 p-4 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-lg font-semibold">Open Warranty Claim</div>
              <button
                className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
                onClick={() => setOpenClaim(null)}
              >
                ✕
              </button>
            </div>

            <div className="grid gap-3">
              <div>
                <div className="text-sm text-neutral-400">For warranty</div>
                <div className="text-sm">
                  {lookups.parts[openClaim.warranty.part_id]?.name ?? "Part"} •{" "}
                  {format(new Date(openClaim.warranty.installed_at), "PP")} →{" "}
                  {format(new Date(openClaim.warranty.expires_at), "PP")}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Status</label>
                <select
                  value={claimStatus}
                  onChange={(e) => setClaimStatus(e.target.value as WarrantyClaimStatus)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                >
                  {(["open", "approved", "replaced", "closed", "denied"] as WarrantyClaimStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Supplier RMA (optional)</label>
                <input
                  value={claimRma}
                  onChange={(e) => setClaimRma(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                  placeholder="RMA #"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-neutral-300">Notes</label>
                <textarea
                  rows={3}
                  value={claimNotes}
                  onChange={(e) => setClaimNotes(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
                  placeholder="Describe failure, diagnostics, photos link, etc."
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className={outlineNeutral} onClick={() => setOpenClaim(null)}>
                Cancel
              </button>
              <button className={outlineInfo} onClick={createClaim}>
                Create Claim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Part search picker */}
      <PartPickerDialog
        open={openPartPicker}
        onClose={() => setOpenPartPicker(false)}
        shopId={shopId}
        onPick={(p) => {
          setPartId(p.id);
          // light lookup hydrate so the “selected” caption shows instantly
          setLookups((prev) => ({
            ...prev,
            parts: {
              ...prev.parts,
              [p.id]: { name: p.name, sku: p.sku },
            },
          }));
        }}
      />
    </div>
  );
}
```

---
## features/dashboard/app/dashboard/parts/page.tsx

```tsx
// app/dashboard/parts/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import clsx from "clsx";
import { toast } from "sonner";
import PartsRequestChat from "@parts/components/PartsRequestChat";

type PartsRequest = Database["public"]["Tables"]["parts_requests"]["Row"];

export default function PartsDashboard() {
  const supabase = createClientComponentClient<Database>();
  const [requests, setRequests] = useState<PartsRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [touchStartY, setTouchStartY] = useState(0);
  const [swipeOffset, setSwipeOffset] = useState(0);

  // Fetch current user
  useEffect(() => {
    supabase.auth.getUser().then((res) => {
      setUserId(res.data.user?.id ?? null);
    });
  }, [supabase]);

  // Fetch initial requests
  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("parts_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (data) setRequests(data);
    };
    fetch();
  }, [supabase]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("parts-requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parts_requests" },
        (payload) => {
          const updated = payload.new as PartsRequest;
          setRequests((prev) => {
            const exists = prev.find((r) => r.id === updated.id);

            // Insert
            if (!exists && payload.eventType === "INSERT") {
              toast.info(`New parts request: ${updated.part_name}`);
              return [updated, ...prev];
            }

            // Update
            return prev.map((r) => (r.id === updated.id ? updated : r));
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const handleView = async (id: string) => {
    setSelectedId(id);
    const req = requests.find((r) => r.id === id);
    if (req && !req.viewed_at) {
      const now = new Date().toISOString();
      await supabase.from("parts_requests").update({ viewed_at: now }).eq("id", id);
    }
  };

  const handleFulfill = async (id: string) => {
    const now = new Date().toISOString();
    await supabase.from("parts_requests").update({ fulfilled_at: now }).eq("id", id);
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, fulfilled_at: now } : r)));
  };

  const filtered = requests.filter((r) => (tab === "active" ? !r.fulfilled_at : !!r.fulfilled_at));

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto text-white font-blackops">
      <h1 className="text-3xl text-orange-500 mb-6">Parts Requests</h1>

      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setTab("active")}
          className={clsx(
            "px-4 py-2 rounded font-semibold",
            tab === "active" ? "bg-orange-500 text-white" : "bg-neutral-700 hover:bg-neutral-600",
          )}
        >
          Active
        </button>
        <button
          onClick={() => setTab("archived")}
          className={clsx(
            "px-4 py-2 rounded font-semibold",
            tab === "archived" ? "bg-orange-500 text-white" : "bg-neutral-700 hover:bg-neutral-600",
          )}
        >
          Archived
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-400">No {tab} requests found.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((req) => {
            const isNew = !req.viewed_at;
            const photos: string[] = Array.isArray(req.photo_urls) ? req.photo_urls : [];

            return (
              <div
                key={req.id}
                className={clsx(
                  "rounded p-4 border shadow transition",
                  isNew && tab === "active"
                    ? "border-yellow-500 bg-yellow-900/20 animate-pulse"
                    : "border-gray-600 bg-gray-800",
                )}
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                  <div>
                    <p className="text-lg font-semibold text-orange-300">
                      {req.part_name} × {req.quantity}
                    </p>
                    <p className="text-sm text-gray-400">
                      <strong>Urgency:</strong> {req.urgency}{" "}
                      <strong className="ml-4">Requested by:</strong> {req.requested_by}
                    </p>
                    <p className="text-xs text-gray-500">
                      <strong>Sent:</strong>{" "}
                      {req.created_at ? new Date(req.created_at).toLocaleString() : "—"} <br />
                      <strong>Viewed:</strong>{" "}
                      {req.viewed_at ? new Date(req.viewed_at).toLocaleString() : "—"} <br />
                      <strong>Fulfilled:</strong>{" "}
                      {req.fulfilled_at ? new Date(req.fulfilled_at).toLocaleString() : "—"}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    {tab === "active" && (
                      <button
                        onClick={() => handleView(req.id)}
                        className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {req.viewed_at ? "View Again" : "View"}
                      </button>
                    )}
                    {tab === "active" && !req.fulfilled_at && (
                      <button
                        onClick={() => handleFulfill(req.id)}
                        className="px-3 py-1 rounded bg-green-600 hover:bg-green-700 text-white"
                      >
                        Mark Fulfilled
                      </button>
                    )}
                  </div>
                </div>

                {selectedId === req.id && req.notes && (
                  <div className="mt-2 text-sm text-white">
                    <strong>Notes:</strong> {req.notes}
                  </div>
                )}

                {/* ✅ Safely render photos */}
                {selectedId === req.id && photos.length > 0 && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {photos.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt="Part"
                        className="w-20 h-20 rounded border border-gray-500 object-cover"
                      />
                    ))}
                  </div>
                )}

                {selectedId === req.id && userId && (
                  <>
                    {/* Mobile Full-Screen Chat with Swipe-to-Close */}
                    <div
                      className="fixed inset-0 bg-black bg-opacity-80 z-50 sm:hidden flex flex-col transition-transform duration-300 ease-out"
                      style={{ touchAction: "none", transform: `translateY(${swipeOffset}px)` }}
                      onTouchStart={(e) => setTouchStartY(e.touches[0].clientY)}
                      onTouchMove={(e) => {
                        const delta = e.touches[0].clientY - touchStartY;
                        if (delta > 0) setSwipeOffset(delta);
                      }}
                      onTouchEnd={() => {
                        if (swipeOffset > 100) setSelectedId(null);
                        else setSwipeOffset(0);
                      }}
                    >
                      <div className="flex justify-between items-center p-3 bg-neutral-900 text-white border-b border-gray-700">
                        <h2 className="text-lg font-semibold">Request Chat</h2>
                        <button
                          onClick={() => setSelectedId(null)}
                          className="text-gray-300 hover:text-white text-sm"
                        >
                          Close ✕
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto bg-neutral-800">
                        <PartsRequestChat requestId={req.id} senderId={userId} />
                      </div>
                    </div>

                    {/* Desktop Inline View */}
                    <div className="hidden sm:block mt-4">
                      <PartsRequestChat requestId={req.id} senderId={userId} />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

---
## features/integrations/parts/index.ts

```ts
/**
 * Parts Integration Layer
 * Wrapper for PartsTech / WorldPac / NAPA inputs.
 */

export interface PartsSearchInput {
  vin?: string;
  keywords?: string;
}

export interface PartResult {
  id: string;
  supplier: string;
  description: string;
  price: number;
  stock: number;
}

export interface PartsProvider {
  search(input: PartsSearchInput): Promise<PartResult[]>;
}

class MockPartsProvider implements PartsProvider {
  async search(input: PartsSearchInput): Promise<PartResult[]> {
    return [
      {
        id: "demo-123",
        supplier: "MockSupplier",
        description: `Example part for ${input.keywords ?? input.vin}`,
        price: 42,
        stock: 3,
      },
    ];
  }
}

export const Parts = new MockPartsProvider();

```

---
## features/parts/actions.ts

```ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

/** Keep this in sync with your Postgres enum stock_move_reason */
export type StockMoveReason =
  | "receive"
  | "adjust"
  | "consume"
  | "sale"
  | "waste"
  | "return_in"
  | "return_out";

export async function createPart(input: {
  shop_id: string;
  sku?: string;
  name: string;
  description?: string;
  default_cost?: number;
  default_price?: number;
  category?: string;
  subcategory?: string;
  low_stock_threshold?: number;
}) {
  const supabase = createServerActionClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("parts")
    .insert(input)
    .select("id")
    .single();
  if (error) throw error;

  revalidatePath("/parts");
  return data.id as string;
}

/** RPC payload for apply_stock_move */
type ApplyStockMoveArgs = {
  p_part: string;
  p_loc: string;
  p_qty: number;
  p_reason: StockMoveReason | string; // Supabase RPC arg is `string`
  p_ref_kind: string;                 // must be string, not undefined/null
  p_ref_id: string;                   // must be string, not undefined/null
};

/**
 * Adjust on-hand stock for a part at a location.
 * Matches SQL: apply_stock_move(p_part, p_loc, p_qty, p_reason, p_ref_kind, p_ref_id) RETURNS uuid
 */
export async function adjustStock(input: {
  part_id: string;
  location_id: string;
  qty_change: number;
  reason: StockMoveReason;
  reference_kind?: string | null;
  reference_id?: string | null;
}) {
  const supabase = createServerActionClient<DB>({ cookies });

  const rpcArgs: ApplyStockMoveArgs = {
    p_part: input.part_id,
    p_loc: input.location_id,
    p_qty: input.qty_change,
    // The generated type for RPC often expects `string`; our union is compatible.
    p_reason: input.reason,
    // IMPORTANT: RPC arg types are `string`, so pass "" when omitted.
    p_ref_kind: input.reference_kind ?? "",
    p_ref_id: input.reference_id ?? "",
  };

  const { data, error } = await supabase.rpc("apply_stock_move", rpcArgs);
  if (error) throw error;

  // Supabase returns the function result directly; for RETURNS uuid it's a string.
  const moveId =
    typeof data === "string"
      ? data
      : (data as unknown as string); // retain type safety without `any`

  revalidatePath(`/parts/${input.part_id}`);
  return moveId;
}
```

---
## features/parts/app/parts/[id]/page.tsx

```tsx
import { getPart } from "@/features/parts/lib/parts.queries";
import { AdjustStockForm } from "@/features/parts/components/AdjustStockForm";

export default async function PartDetail({ params }: { params: { id: string } }) {
  const part = await getPart(params.id);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{part.name}</h1>
        <p className="text-neutral-600">{part.sku ?? ""}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-xl p-4">
          <div className="font-semibold mb-2">Stock</div>
          {(part.v_part_stock ?? []).length ? (
            part.v_part_stock.map((s: any) => (
              <div key={s.location_id} className="flex justify-between py-1">
                <span>Loc {String(s.location_id).slice(0, 6)}…</span>
                <span>
                  {s.qty_available} avail (on hand {s.qty_on_hand})
                </span>
              </div>
            ))
          ) : (
            <div className="text-neutral-500">No stock yet</div>
          )}
        </div>

        <div className="border rounded-xl p-4">
          <div className="font-semibold mb-2">Quick Adjust</div>
          <AdjustStockForm partId={part.id} />
        </div>
      </div>
    </div>
  );
}

```

---
## features/parts/app/parts/locations/page.tsx

```tsx
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { listLocations, ensureMainLocation } from "@/features/parts/lib/locations";
import { LocationForm } from "@/features/parts/components/LocationForm";
type DB = Database;

async function getShopId(): Promise<string> {
  const supabase = createServerComponentClient<DB>({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "";
  const { data } = await supabase.from("profiles").select("shop_id").eq("user_id", user.id).single();
  return data?.shop_id ?? "";
}

export default async function LocationsPage() {
  const shopId = await getShopId();
  if (!shopId) {
    return <div className="p-6 text-sm text-neutral-500">No shop selected.</div>;
  }

  await ensureMainLocation(shopId);
  const locs = await listLocations(shopId);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock Locations</h1>
        <p className="text-neutral-600 text-sm">Manage bins/shelves for parts.</p>
      </div>

      <div className="border rounded-xl p-4">
        <div className="font-semibold mb-2">Add Location</div>
        <LocationForm shopId={shopId} />
      </div>

      <div className="border rounded-xl p-4">
        <div className="font-semibold mb-2">Existing</div>
        <div className="grid gap-2">
          {locs.map(l => (
            <div key={l.id} className="flex justify-between border rounded p-2">
              <span className="font-medium">{l.code}</span>
              <span className="text-neutral-600">{l.name}</span>
            </div>
          ))}
          {locs.length === 0 && <div className="text-sm text-neutral-500">No locations yet.</div>}
        </div>
      </div>
    </div>
  );
}

```

---
## features/parts/app/parts/new/page.tsx

```tsx
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { PartForm } from "@parts/components/PartForm";

type DB = Database;

async function getShopId(): Promise<string> {
  const supabase = createServerComponentClient<DB>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "";

  const { data } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("user_id", user.id)
    .single();

  return data?.shop_id ?? "";
}

export default async function NewPartPage() {
  const shopId = await getShopId();

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">New Part</h1>

      {!shopId ? (
        <div className="text-sm text-neutral-500">
          No shop selected. Make sure your profile has a <code>shop_id</code>.
        </div>
      ) : (
        <PartForm shopId={shopId} />
      )}
    </div>
  );
}

```

---
## features/parts/app/parts/page.tsx

```tsx
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { listParts } from "@/features/parts/lib/parts.queries";

type DB = Database;

async function getShopId(): Promise<string> {
  const supabase = createServerComponentClient<DB>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("user_id", user.id)
    .single();

  return profile?.shop_id ?? "";
}

export default async function PartsPage() {
  const shopId = await getShopId();
  const parts = shopId ? await listParts(shopId) : [];

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Parts</h1>

      <a
        href="/parts/new"
        className="px-3 py-2 rounded-xl bg-neutral-900 text-white"
      >
        New Part
      </a>

      {!shopId ? (
        <div className="text-sm text-neutral-500">
          No shop selected. Make sure your profile has a <code>shop_id</code>.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {parts.map((p) => (
            <a
              key={p.id}
              href={`/parts/${p.id}`}
              className="border rounded-xl p-3 hover:bg-neutral-50"
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-neutral-500">
                {p.sku ?? "—"} • {p.category ?? "Uncategorized"}
              </div>
            </a>
          ))}
          {parts.length === 0 && (
            <div className="text-sm text-neutral-500">No parts yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

```

---
## features/parts/app/parts/suppliers/page.tsx

```tsx
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { listSuppliers } from "@/features/parts/lib/suppliers";
import { SupplierForm } from "@/features/parts/components/SupplierForm";
type DB = Database;

async function getShopId(): Promise<string> {
  const supabase = createServerComponentClient<DB>({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "";
  const { data } = await supabase.from("profiles").select("shop_id").eq("user_id", user.id).single();
  return data?.shop_id ?? "";
}

export default async function SuppliersPage() {
  const shopId = await getShopId();
  if (!shopId) {
    return <div className="p-6 text-sm text-neutral-500">No shop selected.</div>;
  }

  const suppliers = await listSuppliers(shopId);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Suppliers</h1>
        <p className="text-neutral-600 text-sm">Create and manage parts vendors.</p>
      </div>

      <div className="border rounded-xl p-4">
        <div className="font-semibold mb-2">Add Supplier</div>
        <SupplierForm shopId={shopId} />
      </div>

      <div className="border rounded-xl p-4">
        <div className="font-semibold mb-2">Existing</div>
        <div className="grid gap-2">
          {suppliers.map(s => (
            <div key={s.id} className="flex justify-between border rounded p-2">
              <span className="font-medium">{s.name}</span>
              <span className="text-neutral-600 text-sm">{s.email ?? ""} {s.phone ? `• ${s.phone}` : ""}</span>
            </div>
          ))}
          {suppliers.length === 0 && <div className="text-sm text-neutral-500">No suppliers yet.</div>}
        </div>
      </div>
    </div>
  );
}

```

---
## features/parts/components/AdjustStockForm.tsx

```tsx
"use client";
import { useState, useTransition } from "react";
import { adjustStock } from "@/features/parts/actions";

export function AdjustStockForm({ partId }: { partId: string }) {
  const [locationId, setLocationId] = useState("");
  const [qty, setQty] = useState<number>(0);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await adjustStock({
            part_id: partId,
            location_id: locationId,
            qty_change: qty,
            reason: qty >= 0 ? "receive" : "adjust",
          });
        });
      }}
      className="space-y-2"
    >
      <input
        className="border rounded px-3 py-2 w-full"
        placeholder="Location ID"
        value={locationId}
        onChange={(e) => setLocationId(e.target.value)}
      />
      <input
        className="border rounded px-3 py-2 w-full"
        placeholder="Qty (+/-)"
        type="number"
        step="0.01"
        value={qty}
        onChange={(e) =>
          setQty(parseFloat(e.target.value || "0"))
        }
      />
      <button
        disabled={pending}
        className="px-3 py-2 rounded-xl bg-neutral-900 text-white"
      >
        {pending ? "Saving…" : "Apply"}
      </button>
    </form>
  );
}

```

---
## features/parts/components/LocationForm.tsx

```tsx
"use client";
import { useState, useTransition } from "react";
import { createLocation } from "@/features/parts/lib/locations";

export function LocationForm({ shopId }: { shopId: string }) {
  const [code, setCode] = useState("MAIN");
  const [name, setName] = useState("Main Stock");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        start(async () => {
          try {
            await createLocation({ shop_id: shopId, code: code.trim(), name: name.trim() });
            window.location.reload();
          } catch (e: any) {
            setErr(e?.message ?? "Failed");
          }
        });
      }}
    >
      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <div className="text-sm font-medium mb-1">Code</div>
          <input className="border rounded w-full px-3 py-2" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className="block">
          <div className="text-sm font-medium mb-1">Name</div>
          <input className="border rounded w-full px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <button disabled={pending} className="px-3 py-2 rounded-xl bg-neutral-900 text-white">
        {pending ? "Saving…" : "Create Location"}
      </button>
    </form>
  );
}

```

---
## features/parts/components/PartForm.tsx

```tsx
"use client";
import { useState, useTransition } from "react";
import { createPart } from "@/features/parts/actions";

export function PartForm({ shopId }: { shopId: string }) {
  const [form, setForm] = useState({
    sku: "",
    name: "",
    description: "",
    unit: "ea",
    category: "",
    subcategory: "",
    default_cost: 0,
    default_price: 0,
    low_stock_threshold: 0,
    taxable: true,
  });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          try {
            const id = await createPart({
              shop_id: shopId,
              sku: form.sku || undefined,
              name: form.name,
              description: form.description || undefined,
              default_cost: Number(form.default_cost) || 0,
              default_price: Number(form.default_price) || 0,
              category: form.category || undefined,
              subcategory: form.subcategory || undefined,
              low_stock_threshold: Number(form.low_stock_threshold) || 0,
            });
            window.location.href = `/parts/${id}`;
          } catch (err: any) {
            setError(err?.message ?? "Failed to create part");
          }
        });
      }}
    >
      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        <label className="block">
          <div className="text-sm font-medium mb-1">Name</div>
          <input
            className="border rounded w-full px-3 py-2"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </label>

        <label className="block">
          <div className="text-sm font-medium mb-1">SKU</div>
          <input
            className="border rounded w-full px-3 py-2"
            value={form.sku}
            onChange={(e) => set("sku", e.target.value)}
            placeholder="optional"
          />
        </label>

        <label className="block md:col-span-2">
          <div className="text-sm font-medium mb-1">Description</div>
          <textarea
            className="border rounded w-full px-3 py-2"
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="optional"
          />
        </label>

        <label className="block">
          <div className="text-sm font-medium mb-1">Category</div>
          <input
            className="border rounded w-full px-3 py-2"
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
            placeholder="e.g., filters"
          />
        </label>

        <label className="block">
          <div className="text-sm font-medium mb-1">Subcategory</div>
          <input
            className="border rounded w-full px-3 py-2"
            value={form.subcategory}
            onChange={(e) => set("subcategory", e.target.value)}
            placeholder="e.g., oil filter"
          />
        </label>

        <label className="block">
          <div className="text-sm font-medium mb-1">Unit</div>
          <input
            className="border rounded w-full px-3 py-2"
            value={form.unit}
            onChange={(e) => set("unit", e.target.value)}
            placeholder="ea, box, set"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <div className="text-sm font-medium mb-1">Default Cost</div>
            <input
              type="number"
              step="0.01"
              className="border rounded w-full px-3 py-2"
              value={form.default_cost}
              onChange={(e) => set("default_cost", Number(e.target.value))}
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium mb-1">Default Price</div>
            <input
              type="number"
              step="0.01"
              className="border rounded w-full px-3 py-2"
              value={form.default_price}
              onChange={(e) => set("default_price", Number(e.target.value))}
            />
          </label>
        </div>

        <label className="block">
          <div className="text-sm font-medium mb-1">Low Stock Threshold</div>
          <input
            type="number"
            className="border rounded w-full px-3 py-2"
            value={form.low_stock_threshold}
            onChange={(e) => set("low_stock_threshold", Number(e.target.value))}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending || !form.name}
        className="px-4 py-2 rounded-xl bg-neutral-900 text-white"
      >
        {pending ? "Saving…" : "Create Part"}
      </button>
    </form>
  );
}

```

---
## features/parts/components/PartPicker.tsx

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import {
  useAiPartSuggestions,
  type AiPartSuggestion,
} from "@/features/parts/hooks/useAiPartSuggestions";

type DB = Database;
type UUID = string;

type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type StockLoc = DB["public"]["Tables"]["stock_locations"]["Row"];

type VStock = {
  part_id: UUID;
  location_id: UUID;
  qty_available: number;
  qty_on_hand: number;
  qty_reserved: number;
};

export type AvailabilityFlag =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "unknown";

export type PickedPart = {
  part_id: UUID;
  location_id?: UUID;
  qty: number;
  unit_cost: number | null;
  availability?: AvailabilityFlag | null;
};

type Props = {
  open: boolean;
  channel?: string;
  initialSearch?: string;
  workOrderId?: string;
  workOrderLineId?: string | null;
  vehicleSummary?:
    | {
        year?: number | string | null;
        make?: string | null;
        model?: string | null;
      }
    | null;
  jobDescription?: string | null;
  jobNotes?: string | null;
  onClose?: () => void;
  onPick?: (sel: PickedPart) => void;
};

export function PartPicker({
  open,
  channel = "partpicker",
  initialSearch = "",
  workOrderId,
  workOrderLineId,
  vehicleSummary,
  jobDescription,
  jobNotes,
  onClose,
  onPick,
}: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shopId, setShopId] = useState<UUID>("");
  const [search, setSearch] = useState(initialSearch);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [stock, setStock] = useState<Record<UUID, VStock[]>>({});
  const [locs, setLocs] = useState<StockLoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [selectedPartId, setSelectedPartId] = useState<UUID | null>(null);
  const [selectedLocId, setSelectedLocId] = useState<UUID | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [unitCostStr, setUnitCostStr] = useState<string>("");

  const {
    loading: aiLoading,
    items: aiItems,
    error: aiErr,
    suggest,
  } = useAiPartSuggestions();

  const mainLocId = useMemo(() => {
    const m = locs.find((l) => (l.code ?? "").toUpperCase() === "MAIN");
    return (m?.id as UUID | undefined) ?? null;
  }, [locs]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setErr(null);
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;

      const { data: prof, error: pe } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", userId)
        .single();
      if (pe) {
        setErr(pe.message);
        return;
      }
      const sid = (prof?.shop_id as UUID | null) ?? "";
      setShopId(sid);
      if (!sid) return;

      const { data: locsData, error: le } = await supabase
        .from("stock_locations")
        .select("id, code, name, shop_id")
        .eq("shop_id", sid)
        .order("code");
      if (le) {
        setErr(le.message);
        return;
      }
      setLocs(locsData ?? []);
    })();
  }, [open, supabase]);

  useEffect(() => {
    if (!open || !workOrderId) return;
    void suggest({
      workOrderId,
      workOrderLineId: workOrderLineId ?? null,
      vehicle: vehicleSummary ?? null,
      description: jobDescription ?? null,
      notes: jobNotes ?? null,
      topK: 5,
    });
  }, [
    open,
    workOrderId,
    workOrderLineId,
    vehicleSummary,
    jobDescription,
    jobNotes,
    suggest,
  ]);

  useEffect(() => {
    if (!open || !shopId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        let q = supabase
          .from("parts")
          .select("*")
          .eq("shop_id", shopId)
          .order("name")
          .limit(50);

        const term = search.trim();
        if (term) {
          q = q.or(
            `name.ilike.%${term}%,sku.ilike.%${term}%,category.ilike.%${term}%`,
          );
        }

        const { data: rows, error } = await q;
        if (error) throw error;
        if (cancelled) return;

        const rowsSafe = (rows ?? []) as PartRow[];
        setParts(rowsSafe);

        const ids = rowsSafe.map((r) => r.id as UUID);
        if (ids.length) {
          const { data: vs, error: ve } = await supabase
            .from("v_part_stock")
            .select(
              "part_id, location_id, qty_available, qty_on_hand, qty_reserved",
            )
            .in("part_id", ids);
          if (ve) throw ve;

          const grouped: Record<UUID, VStock[]> = {};
          (vs ?? []).forEach((s) => {
            const key = s.part_id as UUID;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push({
              part_id: s.part_id as UUID,
              location_id: s.location_id as UUID,
              qty_available: Number(s.qty_available),
              qty_on_hand: Number(s.qty_on_hand),
              qty_reserved: Number(s.qty_reserved),
            });
          });
          if (!cancelled) setStock(grouped);
        } else {
          setStock({});
        }
      } catch (e: unknown) {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, shopId, search, supabase]);

  useEffect(() => {
    if (!open) return;
    setSelectedPartId(null);
    setSelectedLocId(null);
    setQty(1);
    setUnitCostStr("");
    setSearch(initialSearch);
  }, [open, initialSearch]);

  const selectedStocks = selectedPartId ? stock[selectedPartId] ?? [] : [];
  const locMap = new Map<UUID, StockLoc>(locs.map((l) => [l.id as UUID, l]));
  const defaultLocId: UUID | null =
    selectedLocId ?? mainLocId ?? (selectedStocks[0]?.location_id ?? null);

  const emit = (name: "close" | "pick", detail?: unknown) => {
    const ev = new CustomEvent(`${channel}:${name}`, { detail });
    window.dispatchEvent(ev);
  };

  const close = () => {
    onClose?.();
    emit("close");
  };

  const parsedUnitCost = useMemo(() => {
    const n = parseFloat(unitCostStr);
    return Number.isFinite(n) ? n : 0;
  }, [unitCostStr]);

  const availabilityLabel = useMemo(() => {
    if (!selectedPartId) return "—";
    if (!selectedStocks.length) return "No stock records";
    const totalAvail = selectedStocks.reduce(
      (sum, s) => sum + Number(s.qty_available || 0),
      0,
    );
    if (totalAvail <= 0) return "Out of stock";
    if (totalAvail < qty) return "Low / partial stock";
    return "In stock";
  }, [selectedPartId, selectedStocks, qty]);

  const computeAvailabilityFlag = (): AvailabilityFlag | null => {
    if (!selectedPartId || !selectedStocks.length) return "unknown";
    const totalAvail = selectedStocks.reduce(
      (sum, s) => sum + Number(s.qty_available || 0),
      0,
    );
    if (totalAvail <= 0) return "out_of_stock";
    if (totalAvail < qty) return "low_stock";
    return "in_stock";
  };

  const confirmPick = () => {
    if (!selectedPartId || qty <= 0) return;
    const payload: PickedPart = {
      part_id: selectedPartId,
      location_id: selectedLocId ?? undefined,
      qty,
      unit_cost: parsedUnitCost || null,
      availability: computeAvailabilityFlag(),
    };
    onPick?.(payload);
    emit("pick", payload);
    close();
  };

  async function resolveSuggestionToPartId(
    s: AiPartSuggestion,
  ): Promise<string | null> {
    if (!shopId) return null;
    if (s.sku) {
      const { data } = await supabase
        .from("parts")
        .select("id")
        .eq("shop_id", shopId)
        .eq("sku", s.sku)
        .maybeSingle();
      if (data?.id) return data.id as string;
    }
    if (s.name) {
      const { data } = await supabase
        .from("parts")
        .select("id")
        .eq("shop_id", shopId)
        .ilike("name", s.name)
        .maybeSingle();
      if (data?.id) return data.id as string;
    }
    return null;
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center"
      onClick={(e) => {
        // kill bubbling to job card
        e.stopPropagation();
      }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
        onClick={() => {
          close();
        }}
      />

      {/* Panel */}
      <div
        className="relative z-[510] w-full max-w-3xl rounded-lg border border-orange-400 bg-neutral-950 p-4 text-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-neutral-400">Select a part</div>
            <h3 className="text-lg font-semibold font-header">Part Picker</h3>
          </div>
          <button
            onClick={close}
            className="rounded border border-neutral-700 px-2 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Close
          </button>
        </div>

        {/* AI */}
        <div className="mb-3 rounded border border-neutral-800">
          <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
            <div className="text-sm font-semibold">AI suggestions</div>
            {aiLoading && (
              <div className="text-xs text-neutral-400">Thinking…</div>
            )}
          </div>
          <div className="p-2">
            {aiErr ? (
              <div className="text-xs text-red-400">{aiErr}</div>
            ) : aiItems.length === 0 ? (
              <div className="text-xs text-neutral-500">No suggestions.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {aiItems.map((s, i) => (
                  <button
                    key={i}
                    className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900"
                    title={s.rationale || ""}
                    onClick={async () => {
                      const pid = await resolveSuggestionToPartId(s);
                      if (pid) {
                        setSelectedPartId(pid as UUID);
                        setQty(Math.max(1, Number(s.qty ?? 1)));
                      } else {
                        setSearch(s.sku || s.name || "");
                      }
                    }}
                  >
                    {(s.sku ? `${s.sku} • ` : "") + s.name}{" "}
                    {s.qty ? `×${s.qty}` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="mb-3">
          <input
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-white placeholder:text-neutral-400"
            placeholder="Search name, SKU, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {err && <div className="mb-2 text-sm text-red-400">{err}</div>}

        {loading ? (
          <div className="text-sm text-neutral-400">Searching…</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {/* left */}
            <div className="rounded-xl border border-neutral-800">
              <div className="border-b border-neutral-800 p-2 text-sm font-semibold">
                Results
              </div>
              <div className="max-h-72 overflow-auto">
                {parts.length === 0 ? (
                  <div className="p-3 text-sm text-neutral-400">
                    No parts found.
                  </div>
                ) : (
                  parts.map((p) => (
                    <button
                      key={p.id as UUID}
                      onClick={() => setSelectedPartId(p.id as UUID)}
                      className={`block w-full border-b border-neutral-800 px-3 py-2 text-left hover:bg-neutral-900 ${
                        selectedPartId === (p.id as UUID)
                          ? "bg-neutral-900"
                          : ""
                      }`}
                    >
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="truncate text-xs text-neutral-500">
                        {p.sku ?? "—"} • {p.category ?? "Uncategorized"}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* right */}
            <div className="rounded-xl border border-neutral-800 p-3">
              <div className="mb-2 text-sm font-semibold">
                Stock & pricing
              </div>
              {!selectedPartId ? (
                <div className="text-sm text-neutral-400">
                  Select a part to view stock.
                </div>
              ) : selectedStocks.length === 0 ? (
                <div className="text-sm text-neutral-400">
                  No stock entries yet (you can still use/consume).
                </div>
              ) : (
                <div className="grid gap-2">
                  {selectedStocks
                    .slice()
                    .sort(
                      (a, b) =>
                        Number(b.qty_available) - Number(a.qty_available),
                    )
                    .map((s) => {
                      const l = locMap.get(s.location_id as UUID);
                      const checked =
                        (selectedLocId ?? defaultLocId) === s.location_id;
                      return (
                        <label
                          key={s.location_id}
                          className="flex items-center justify-between rounded border border-neutral-800 p-2"
                        >
                          <div className="min-w-0">
                            <div className="font-medium">
                              {l?.code ?? "LOC"}
                            </div>
                            <div className="truncate text-xs text-neutral-500">
                              {l?.name ??
                                String(s.location_id).slice(0, 6) + "…"}
                            </div>
                          </div>
                          <div className="tabular-nums text-sm font-semibold">
                            {Number(s.qty_available)} avail
                          </div>
                          <input
                            type="radio"
                            name="loc"
                            className="ml-2"
                            checked={!!checked}
                            onChange={() =>
                              setSelectedLocId(s.location_id as UUID)
                            }
                          />
                        </label>
                      );
                    })}
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1 text-xs text-neutral-500">Quantity</div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={qty}
                    onChange={(e) =>
                      setQty(Math.max(0, Number(e.target.value || 0)))
                    }
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-neutral-500">Location</div>
                  <select
                    value={defaultLocId ?? ""}
                    onChange={(e) =>
                      setSelectedLocId(
                        (e.target.value || null) as UUID | null,
                      )
                    }
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
                  >
                    <option value="">Auto</option>
                    {locs.map((l) => (
                      <option key={l.id as UUID} value={l.id as UUID}>
                        {l.code} — {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1 text-xs text-neutral-500">
                    Unit cost
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={unitCostStr}
                    onChange={(e) =>
                      setUnitCostStr(
                        e.target.value.replace(/[^\d.]/g, ""),
                      )
                    }
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
                    placeholder="e.g. 45.00"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-neutral-500">
                    Availability
                  </div>
                  <div className="flex items-center rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
                    {availabilityLabel}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  disabled={!selectedPartId || qty <= 0}
                  onClick={confirmPick}
                  className="rounded border border-orange-500 px-3 py-2 font-header text-sm text-white hover:bg-orange-500/10 disabled:opacity-60"
                >
                  Use Part
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PartPicker;
```

---
## features/parts/components/PartsDrawer.tsx

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import PartPicker, { PickedPart } from "@/features/parts/components/PartPicker";
import PartsRequestModal from "@/features/work-orders/components/workorders/PartsRequestModal";
import { toast } from "sonner";

type DB = Database;

type SerializableVehicle = {
  year?: number | string | null;
  make?: string | null;
  model?: string | null;
} | null;

type Props = {
  open: boolean;
  workOrderId: string;
  workOrderLineId: string;
  vehicleSummary?: SerializableVehicle;
  jobDescription?: string | null;
  jobNotes?: string | null;
  closeEventName?: string;
};

export default function PartsDrawer({
  open,
  workOrderId,
  workOrderLineId,
  vehicleSummary: _vehicleSummary = null,
  jobDescription: _jobDescription = null,
  jobNotes: _jobNotes = null,
  closeEventName = "parts-drawer:closed",
}: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [tab, setTab] = useState<"use" | "request">("use");

  const emitClose = useCallback(() => {
    window.dispatchEvent(new CustomEvent(closeEventName));
  }, [closeEventName]);

  const handleUsePart = useCallback(
    async ({ part_id, location_id, qty }: PickedPart) => {
      try {
        let locId = location_id ?? null;

        if (!locId) {
          const { data: locs } = await supabase
            .from("stock_locations")
            .select("id, code")
            .order("code")
            .limit(50);

          const main = (locs ?? []).find(
            (l) => (l.code ?? "").toUpperCase() === "MAIN"
          );
          if (main?.id) locId = main.id as string;
        }

        const { error } = await supabase.from("work_order_part_allocations").insert({
          work_order_line_id: workOrderLineId,
          work_order_id: workOrderId,
          part_id,
          location_id: locId,
          qty,
        });

        if (error) throw error;
        toast.success("Part allocated to job.");
        window.dispatchEvent(new CustomEvent("wo:parts-used"));
        emitClose();
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to allocate part.");
      }
    },
    [emitClose, supabase, workOrderId, workOrderLineId]
  );

  useEffect(() => {
    if (!open) return;

    const onCloseReq = () => emitClose();
    const onSubmitted = () => {
      toast.success("Parts request submitted");
      emitClose();
    };

    window.addEventListener("parts-request:close", onCloseReq);
    window.addEventListener("parts-request:submitted", onSubmitted);
    return () => {
      window.removeEventListener("parts-request:close", onCloseReq);
      window.removeEventListener("parts-request:submitted", onSubmitted);
    };
  }, [open, emitClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[510]"
      onClick={(e) => {
        // keep clicks inside here, don't trigger parent rows
        e.stopPropagation();
      }}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={emitClose}
      />
      <div
        className="absolute inset-x-0 bottom-0 z-[520] w-full rounded-t-xl border border-orange-400 bg-neutral-950 p-0 text-white shadow-xl md:inset-auto md:top-1/2 md:left-1/2 md:h-[85vh] md:w-[960px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 p-3">
          <div className="flex items-center gap-2">
            <button
              className={`rounded px-3 py-1.5 text-sm ${
                tab === "use"
                  ? "border border-orange-500 text-orange-300"
                  : "border border-transparent text-neutral-300 hover:text-white"
              }`}
              onClick={() => setTab("use")}
            >
              Use from Inventory
            </button>
            <button
              className={`rounded px-3 py-1.5 text-sm ${
                tab === "request"
                  ? "border border-orange-500 text-orange-300"
                  : "border border-transparent text-neutral-300 hover:text-white"
              }`}
              onClick={() => setTab("request")}
            >
              Request to Purchase
            </button>
          </div>
          <button
            onClick={emitClose}
            className="rounded border border-neutral-700 px-2 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Close
          </button>
        </div>

        <div className="p-3">
          {tab === "use" ? (
            <PartPicker
              open={true}
              onClose={emitClose}
              onPick={handleUsePart}
              initialSearch=""
              workOrderId={workOrderId}
              workOrderLineId={workOrderLineId}
              jobDescription={_jobDescription}
              jobNotes={_jobNotes}
              vehicleSummary={_vehicleSummary}
            />
          ) : (
            <div className="relative">
              <PartsRequestModal
                isOpen={true}
                workOrderId={workOrderId}
                jobId={workOrderLineId}
                closeEventName="parts-request:close"
                submittedEventName="parts-request:submitted"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

---
## features/parts/components/PartsRequestChat.tsx

```tsx
// features/parts/components/PartsRequestChat.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

type Message = Database["public"]["Tables"]["parts_request_messages"]["Row"];

interface Props {
  // allow null/undefined from parents safely
  requestId: string | null | undefined;
  senderId: string;
}

export default function PartsRequestChat({ requestId, senderId }: Props) {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Fetch messages (guard if requestId isn't ready)
  useEffect(() => {
    if (!requestId) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("parts_request_messages")
        .select("*")
        .eq("request_id", requestId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Failed to load parts request messages:", error);
        return;
      }
      if (!cancelled && data) setMessages(data);
    })();

    return () => {
      cancelled = true;
    };
  }, [requestId, supabase]);

  // Realtime inserts (guard if requestId isn't ready)
  useEffect(() => {
    if (!requestId) return;

    const channel = supabase
      .channel(`req-messages-${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "parts_request_messages",
          filter: `request_id=eq.${requestId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setMessages((prev) => [...prev, newMessage]);
          if (newMessage.sender_id !== senderId) {
            toast.info("New message on request");
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId, senderId, supabase]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const content = newMsg.trim();
    if (!requestId || !content) return;

    const { error } = await supabase.from("parts_request_messages").insert({
      id: uuidv4(),
      request_id: requestId,
      sender_id: senderId,
      message: content,
    });

    if (error) {
      console.error("Failed to send parts request message:", error);
      toast.error("Failed to send message");
    } else {
      setNewMsg("");
    }
  };

  // If we don't have a valid request, render nothing (or a placeholder)
  if (!requestId) {
    return null;
  }

  return (
    <div className="border-t border-gray-700 mt-3 pt-2">
      <div className="max-h-40 overflow-y-auto space-y-2 text-sm">
        {messages.map((msg) => {
          const ts = msg.created_at ? new Date(msg.created_at) : null;
          return (
            <div
              key={msg.id}
              className={`p-2 rounded ${
                msg.sender_id === senderId
                  ? "bg-orange-600 text-white ml-auto text-right"
                  : "bg-gray-700 text-white mr-auto"
              }`}
            >
              <p>{msg.message}</p>
              <p className="text-xs text-gray-400">
                {ts ? ts.toLocaleTimeString() : ""}
              </p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          value={newMsg}
          onChange={(e) => setNewMsg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          className="flex-1 rounded bg-neutral-800 border border-neutral-600 px-3 py-2 text-white"
        />
        <button
          onClick={handleSend}
          className="bg-orange-500 hover:bg-orange-600 px-3 py-1 rounded text-white"
          disabled={!requestId || !newMsg.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

---
## features/parts/components/SupplierForm.tsx

```tsx
"use client";
import { useState, useTransition } from "react";
import { createSupplier } from "@/features/parts/lib/suppliers";

export function SupplierForm({ shopId }: { shopId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        start(async () => {
          try {
            await createSupplier({ shop_id: shopId, name: name.trim(), email: email || undefined, phone: phone || undefined });
            window.location.reload();
          } catch (e: any) {
            setErr(e?.message ?? "Failed");
          }
        });
      }}
    >
      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="grid md:grid-cols-3 gap-3">
        <label className="block md:col-span-1">
          <div className="text-sm font-medium mb-1">Name</div>
          <input className="border rounded w-full px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block">
          <div className="text-sm font-medium mb-1">Email</div>
          <input className="border rounded w-full px-3 py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <div className="text-sm font-medium mb-1">Phone</div>
          <input className="border rounded w-full px-3 py-2" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
      </div>
      <button disabled={pending} className="px-3 py-2 rounded-xl bg-neutral-900 text-white">
        {pending ? "Saving…" : "Create Supplier"}
      </button>
    </form>
  );
}

```

---
## features/parts/components/VehiclePhotoGallery.tsx

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Dialog } from "@headlessui/react";
import {
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { Database } from "@shared/types/types/supabase";

type VehiclePhoto = Database["public"]["Tables"]["vehicle_photos"]["Row"];

interface Props {
  vehicleId: string;
  currentUserId: string;
}

export default function VehiclePhotoGallery({
  vehicleId,
  currentUserId,
}: Props) {
  const supabase = createClientComponentClient<Database>();

  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [editedCaption, setEditedCaption] = useState("");
  const [fullscreenPhoto, setFullscreenPhoto] = useState<VehiclePhoto | null>(
    null,
  );

  useEffect(() => {
    const fetchPhotos = async () => {
      const { data, error } = await supabase
        .from("vehicle_photos")
        .select("*")
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Failed to load vehicle photos", error);
        return;
      }

      if (data) setPhotos(data);
    };

    void fetchPhotos();
  }, [vehicleId, supabase]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("vehicle_photos")
      .delete()
      .eq("id", id);
    if (error) {
      console.warn("Failed to delete vehicle photo", error);
      return;
    }
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleCaptionSave = async (id: string) => {
    const trimmed = editedCaption.trim();
    const { error } = await supabase
      .from("vehicle_photos")
      .update({ caption: trimmed || null })
      .eq("id", id);

    if (error) {
      console.warn("Failed to update caption", error);
      return;
    }

    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, caption: trimmed || null } : p)),
    );
    setEditingCaptionId(null);
    setEditedCaption("");
  };

  return (
    <>
      {/* wrapper card for gallery */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3 shadow-[0_0_40px_rgba(0,0,0,0.85)]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-100">
            Vehicle photo history
          </h3>
          <p className="text-[11px] text-neutral-500">
            Click a photo to view full screen.
          </p>
        </div>

        {photos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/40 px-4 py-6 text-center text-sm text-neutral-400">
            No photos for this vehicle yet.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="group relative overflow-hidden rounded-xl border border-white/12 bg-black/50 shadow-[0_0_22px_rgba(0,0,0,0.9)] transition hover:border-[var(--accent-copper-light)] hover:bg-black/70"
              >
                <button
                  type="button"
                  className="block w-full focus:outline-none"
                  onClick={() => setFullscreenPhoto(photo)}
                >
                  <div className="relative aspect-video w-full bg-black/40">
                    {/* plain <img> instead of next/image */}
                    <img
                      src={photo.url}
                      alt={photo.caption || "Vehicle photo"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </button>

                {/* hover controls */}
                {photo.uploaded_by === currentUserId && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end p-2 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
                    <div className="flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 shadow-[0_0_14px_rgba(0,0,0,0.9)]">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCaptionId(photo.id);
                          setEditedCaption(photo.caption || "");
                        }}
                        className="p-0.5 text-[11px] text-[var(--accent-copper-light)] hover:text-white"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(photo.id)}
                        className="p-0.5 text-[11px] text-red-400 hover:text-red-200"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* caption area */}
                <div className="border-t border-white/10 bg-black/60 px-2.5 py-2 text-[11px] text-neutral-300">
                  {editingCaptionId === photo.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={editedCaption}
                        onChange={(e) => setEditedCaption(e.target.value)}
                        className="h-7 w-full rounded-md border border-white/20 bg-black/60 px-2 text-[11px] text-neutral-100 placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
                        placeholder="Add a note about this photo…"
                      />
                      <button
                        type="button"
                        onClick={() => handleCaptionSave(photo.id)}
                        className="rounded-full bg-[var(--accent-copper)] px-2 py-1 text-[10px] font-semibold text-black shadow-[0_0_14px_rgba(248,113,22,0.55)] hover:opacity-90"
                      >
                        Save
                      </button>
                    </div>
                  ) : photo.caption ? (
                    <p className="line-clamp-2 text-[11px] text-neutral-200">
                      {photo.caption}
                    </p>
                  ) : (
                    <p className="text-[11px] italic text-neutral-500">
                      No caption
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* fullscreen viewer */}
      <Dialog
        open={!!fullscreenPhoto}
        onClose={() => setFullscreenPhoto(null)}
        className="fixed inset-0 z-[120] flex items-center justify-center"
      >
        {/* backdrop */}
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm"
          aria-hidden="true"
        />

        <div className="relative z-[130] mx-3 my-6 w-full max-w-5xl">
          <Dialog.Panel className="relative overflow-hidden rounded-2xl border border-white/15 bg-neutral-950/95 p-3 shadow-[0_0_60px_rgba(0,0,0,1)]">
            {/* close button */}
            <button
              type="button"
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/60 text-neutral-200 shadow-sm transition hover:bg-white/10 hover:text-white"
              onClick={() => setFullscreenPhoto(null)}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>

            <div className="flex flex-col gap-3 pt-2">
              <div className="relative mx-auto max-h-[70vh] w-full">
                {fullscreenPhoto && (
                  <img
                    src={fullscreenPhoto.url}
                    alt={fullscreenPhoto.caption || "Vehicle photo"}
                    className="mx-auto max-h-[70vh] w-auto rounded-xl object-contain"
                  />
                )}
              </div>

              {fullscreenPhoto?.caption && (
                <p className="mx-auto max-w-3xl px-2 pb-1 text-center text-sm text-neutral-200">
                  {fullscreenPhoto.caption}
                </p>
              )}

              <p className="text-center text-[11px] text-neutral-500">
                Click outside or press ESC to close.
              </p>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </>
  );
}
```

---
## features/parts/components/VehiclePhotoUploader.tsx

```tsx
"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";

type VehiclePhoto = Database["public"]["Tables"]["vehicle_photos"]["Row"];

interface Props {
  vehicleId: string;
  onUpload?: (photo: VehiclePhoto) => void;
}

export default function VehiclePhotoUploader({ vehicleId, onUpload }: Props) {
  const supabase = createClientComponentClient<Database>();

  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      toast.error("User not authenticated");
      setUploading(false);
      return;
    }

    const fileExt = file.name.split(".").pop();
    const fileName = `${uuidv4()}.${fileExt || "jpg"}`;
    const filePath = `${vehicleId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("vehicle-photos")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Vehicle photo upload failed", uploadError);
      toast.error("Upload failed");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("vehicle-photos")
      .getPublicUrl(filePath);

    const publicUrl = urlData?.publicUrl;

    if (!publicUrl) {
      toast.error("Could not get image URL");
      setUploading(false);
      return;
    }

    const trimmedCaption = caption.trim();

    const { data: inserted, error: insertError } = await supabase
      .from("vehicle_photos")
      .insert({
        vehicle_id: vehicleId,
        uploaded_by: user.id,
        url: publicUrl,
        caption: trimmedCaption || null,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      console.error("Failed to save vehicle photo row", insertError);
      toast.error("Failed to save photo info");
      setUploading(false);
      return;
    }

    toast.success("Photo uploaded");
    onUpload?.(inserted);
    setFile(null);
    setCaption("");
    setUploading(false);
  };

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 shadow-[0_0_40px_rgba(0,0,0,0.85)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100">
            Upload vehicle photo
          </h3>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Attach walkaround or damage documentation to this vehicle.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {/* file input */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
            Image file
          </label>
          <label className="inline-flex w-full cursor-pointer items-center justify-between gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[12px] text-neutral-200 shadow-[0_0_18px_rgba(0,0,0,0.9)] hover:border-[var(--accent-copper-light)] hover:bg-black/60">
            <span className="truncate">
              {file ? file.name : "Choose image…"}
            </span>
            <span className="rounded-full bg-[var(--accent-copper)]/90 px-2 py-0.5 text-[11px] font-semibold text-black">
              Browse
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <p className="text-[10px] text-neutral-500">
            JPG / PNG recommended. Large images may take a moment to upload.
          </p>
        </div>

        {/* caption input */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
            Caption
          </label>
          <input
            type="text"
            placeholder="e.g. Front right bumper damage, before repair"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="h-9 w-full rounded-full border border-white/15 bg-black/40 px-3 text-[13px] text-neutral-100 placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
          />
        </div>

        {/* action */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !file}
            className="inline-flex items-center justify-center rounded-full bg-[var(--accent-copper)] px-4 py-1.5 text-sm font-semibold text-black shadow-[0_0_24px_rgba(248,113,22,0.55)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---
## features/parts/hooks/useAiPartSuggestions.ts

```ts
"use client";

import { useCallback, useState } from "react";

/** A single AI-suggested part candidate. */
export type AiPartSuggestion = {
  name: string;
  sku?: string | null;
  qty?: number | null;
  confidence?: number | null; // 0..1
  rationale?: string | null;  // short reason the model suggested it
};

/** Hook to request AI part suggestions for a WO / WO line. */
export function useAiPartSuggestions() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AiPartSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const suggest = useCallback(
    async (input: {
      workOrderId: string;
      workOrderLineId?: string | null;
      vehicle?: { year?: number | string | null; make?: string | null; model?: string | null } | null;
      description?: string | null;  // complaint / job description
      notes?: string | null;        // any extra text you want to include
      topK?: number;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/ai/parts/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || "Suggestion failed");
        const arr = Array.isArray(j?.items) ? j.items : [];
        setItems(arr as AiPartSuggestion[]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Suggestion failed";
        setError(msg);
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, items, error, suggest, setItems };
}
```

---
## features/parts/lib/locations.ts

```ts
"use server";
import { cookies } from "next/headers";
import { createServerComponentClient, createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
type DB = Database;

export async function ensureMainLocation(shopId: string) {
  const supabase = createServerActionClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("stock_locations")
    .select("id, code, name")
    .eq("shop_id", shopId)
    .eq("code", "MAIN")
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: created, error: cerr } = await supabase
    .from("stock_locations")
    .insert({ shop_id: shopId, code: "MAIN", name: "Main Stock" })
    .select("id, code, name")
    .single();
  if (cerr) throw cerr;
  return created;
}

export async function listLocations(shopId: string) {
  const supabase = createServerComponentClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("stock_locations")
    .select("id, code, name")
    .eq("shop_id", shopId)
    .order("code");
  if (error) throw error;
  return data ?? [];
}

export async function createLocation(input: { shop_id: string; code: string; name: string }) {
  const supabase = createServerActionClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("stock_locations")
    .insert(input)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

```

---
## features/parts/lib/parts.queries.ts

```ts
"use server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
type DB = Database;

export async function listParts(shopId: string) {
  const supabase = createServerComponentClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("parts")
    .select("id, sku, name, category, default_price, low_stock_threshold")
    .eq("shop_id", shopId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getPart(id: string) {
  const supabase = createServerComponentClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("parts")
    .select("*, part_suppliers(*), v_part_stock(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

```

---
## features/parts/lib/parts/searchParts.ts

```ts
// lib/parts/searchParts.ts

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Search parts by keyword (fuzzy match on name, description, sku, or supplier).
 */
export async function searchPartsByKeyword(keyword: string): Promise<string[]> {
  if (!keyword || keyword.length < 2) return [];

  const { data, error } = await supabase
    .from("parts")
    .select("name")
    .or(
      `name.ilike.%${keyword}%,description.ilike.%${keyword}%,sku.ilike.%${keyword}%,supplier.ilike.%${keyword}%`,
    )
    .limit(10);

  if (error) {
    console.error("Part search error:", error.message);
    return [];
  }

  return data?.map((part) => part.name) ?? [];
}

```

---
## features/parts/lib/po.ts

```ts
/** Stubs for PO logic; wire to Supabase tables and email/pdf later. */
export type PoDraft = {
  supplier_id: string | null;
  notes?: string | null;
  lines: Array<{ part_id?: string|null; sku?: string|null; description?: string|null; qty: number; unit_cost?: number|null; location_id?: string|null }>;
};

export async function suggestReorder(): Promise<PoDraft[]> {
  // TODO: compute from low_stock + recent usage
  return [];
}

export async function createPoDraft(_draft: PoDraft): Promise<string> {
  // TODO: insert into purchase_orders + purchase_order_lines and return id
  return "TODO-PO-ID";
}

```

---
## features/parts/lib/suppliers.ts

```ts
"use server";
import { cookies } from "next/headers";
import { createServerComponentClient, createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
type DB = Database;

export async function listSuppliers(shopId: string) {
  const supabase = createServerComponentClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, email, phone, is_active")
    .eq("shop_id", shopId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createSupplier(input: { shop_id: string; name: string; email?: string; phone?: string }) {
  const supabase = createServerActionClient<DB>({ cookies });
  const { data, error } = await supabase
    .from("suppliers")
    .insert(input)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

```

---
## features/parts/server/poActions.ts

```ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
type DB = Database;

export async function createPurchaseOrder(input: {
  shop_id: string;
  supplier_id?: string | null;
  notes?: string | null;
}) {
  const supabase = createServerActionClient<DB>({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({
      shop_id: input.shop_id,
      supplier_id: input.supplier_id ?? null,
      notes: input.notes ?? null,
      created_by: user.id,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/parts/po");
  return data.id as string;
}

export async function addPoLine(input: {
  po_id: string;
  part_id?: string | null;
  sku?: string | null;
  description?: string | null;
  qty: number;
  unit_cost?: number | null;
  location_id?: string | null;
}) {
  const supabase = createServerActionClient<DB>({ cookies });
  if (input.qty <= 0) throw new Error("Quantity must be > 0");

  const { error } = await supabase.from("purchase_order_lines").insert({
    po_id: input.po_id,
    part_id: input.part_id ?? null,
    sku: input.sku ?? null,
    description: input.description ?? null,
    qty: input.qty,
    unit_cost: input.unit_cost ?? null,
    location_id: input.location_id ?? null,
  });
  if (error) throw error;
  revalidatePath("/parts/po");
}

export async function markPoSent(po_id: string) {
  const supabase = createServerActionClient<DB>({ cookies });
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "sent" })
    .eq("id", po_id);
  if (error) throw error;
  revalidatePath("/parts/po");
}

/** Receive all remaining qty for lines (simple MVP).
 *  For a granular UI, create a separate receivePoLine().
 */
export async function receivePo(po_id: string) {
  const supabase = createServerActionClient<DB>({ cookies });

  // Load PO + lines
  const { data: lines, error: le } = await supabase
    .from("purchase_order_lines")
    .select("id, part_id, qty, received_qty, location_id, purchase_orders!inner(shop_id)")
    .eq("po_id", po_id);
  if (le) throw le;

  // Apply stock moves (receive delta)
  for (const ln of lines ?? []) {
    const delta = Number(ln.qty) - Number(ln.received_qty || 0);
    if (delta > 0) {
      // location required: if missing, you can default to MAIN in your UI
      const loc = ln.location_id;
      if (!loc) continue;

      const { error: se } = await supabase.rpc("apply_stock_move", {
        p_part: ln.part_id,           // can be null if only SKU/desc; you may want to require part_id
        p_loc: loc,
        p_qty: delta,
        p_reason: "receive",
        p_ref_kind: "purchase_order",
        p_ref_id: po_id,
      });
      if (se) throw se;

      // Update received tally
      const { error: ue } = await supabase
        .from("purchase_order_lines")
        .update({ received_qty: Number(ln.received_qty || 0) + delta })
        .eq("id", ln.id);
      if (ue) throw ue;
    }
  }

  // Mark PO received
  const { error: pe } = await supabase
    .from("purchase_orders")
    .update({ status: "received" })
    .eq("id", po_id);
  if (pe) throw pe;

  revalidatePath("/parts/po");
}
```

---
## features/parts/server/scanActions.ts

```ts
"use server";

import { cookies } from "next/headers";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
type DB = Database;

/**
 * Resolve a scanned code (barcode or SKU) to a part_id.
 * Strategy (in order):
 *  1) parts_barcodes(code, supplier_id?) -> part_id
 *  2) parts.sku == code (case-insensitive)
 *  3) parts.upc == code  (if you have this column)
 */
export async function resolveScannedCode(input: {
  code: string;
  supplier_id?: string | null;
}): Promise<{ part_id: string | null }> {
  const supabase = createServerActionClient<DB>({ cookies });
  const code = (input.code || "").trim();
  if (!code) return { part_id: null };

  // 1) explicit barcode mappings (recommended table)
  const { data: map } = await supabase
    .from("parts_barcodes")
    .select("part_id")
    .eq("code", code)
    .maybeSingle();

  if (map?.part_id) return { part_id: map.part_id };

  // If supplier-specific mappings exist, try them too
  if (input.supplier_id) {
    const { data: map2 } = await supabase
      .from("parts_barcodes")
      .select("part_id")
      .eq("code", code)
      .eq("supplier_id", input.supplier_id)
      .maybeSingle();
    if (map2?.part_id) return { part_id: map2.part_id };
  }

  // 2) fallback: SKU match
  const { data: bySku } = await supabase
    .from("parts")
    .select("id")
    .ilike("sku", code)
    .maybeSingle();
  if (bySku?.id) return { part_id: bySku.id };

  // 3) optional UPC column fallback (if present in your schema)
  // Comment out if you don't have this column.
  try {
    const { data: byUpc } = await supabase
      .from("parts")
      .select("id")
      .eq("upc", code as any)
      .maybeSingle();
    if (byUpc?.id) return { part_id: byUpc.id };
  } catch {
    /* column may not exist */
  }

  return { part_id: null };
}
```

---
## features/parts/server/transcribe.md

```md
If you want voice receiving, add:
- /api/transcribe (POST audio blob) -> Whisper/OpenAI -> text
- Parse "receive 3 brake pads to main" -> {qty:3, part:"brake pads", loc:"MAIN"}

```

---
## features/work-orders/lib/parts/consumePart.ts

```ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { ensureMainLocation } from "@parts/lib/locations";

type DB = Database;

export type ConsumePartInput = {
  work_order_line_id: string;
  part_id: string;
  qty: number; // positive number means "consume qty"
  location_id?: string; // optional; defaults to MAIN for the WO's shop
  unit_cost?: number | null; // optional override from UI
  availability?: string | null; // accepted but not stored yet (option A)
};

export async function consumePart(input: ConsumePartInput) {
  const supabase = createServerActionClient<DB>({ cookies });

  if (!input.qty || input.qty <= 0) {
    throw new Error("Quantity must be greater than 0");
  }

  // 1) Look up WO + shop_id from the line
  const { data: woLine, error: wlErr } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id, work_orders!inner(id, shop_id)")
    .eq("id", input.work_order_line_id)
    .single();
  if (wlErr) throw wlErr;

  const workOrderId = woLine.work_order_id;
  const shopId = (woLine as any).work_orders.shop_id as string;

  // 2) Determine location_id
  let locationId = input.location_id;
  if (!locationId) {
    const loc = await ensureMainLocation(shopId);
    locationId = loc.id;
  }

  // 3) Determine effective unit_cost:
  //    - prefer the explicit value from the picker
  //    - otherwise fall back to parts.default_cost (old behaviour)
  let effectiveUnitCost: number | null = null;

  if (
    typeof input.unit_cost === "number" &&
    !Number.isNaN(input.unit_cost)
  ) {
    effectiveUnitCost = input.unit_cost;
  } else {
    const { data: part, error: partErr } = await supabase
      .from("parts")
      .select("default_cost")
      .eq("id", input.part_id)
      .single();
    if (partErr) throw partErr;

    if (
      part?.default_cost !== null &&
      part?.default_cost !== undefined &&
      !Number.isNaN(Number(part.default_cost))
    ) {
      effectiveUnitCost = Number(part.default_cost);
    } else {
      effectiveUnitCost = null;
    }
  }

  // 4) Create allocation row (without stock_move_id yet)
  const { data: alloc, error: aErr } = await supabase
    .from("work_order_part_allocations")
    .insert({
      work_order_line_id: input.work_order_line_id,
      part_id: input.part_id,
      location_id: locationId!,
      qty: Math.abs(input.qty),
      unit_cost: effectiveUnitCost,
      // if you later add an "availability" column, wire:
      // availability: input.availability ?? null,
    })
    .select("id")
    .single();
  if (aErr) throw aErr;

  // 5) Create stock move (consume = negative)
  const { data: moveId, error: mErr } = await supabase.rpc(
    "apply_stock_move",
    {
      p_part: input.part_id,
      p_loc: locationId!,
      p_qty: -Math.abs(input.qty),
      p_reason: "consume",
      p_ref_kind: "WO",
      p_ref_id: workOrderId,
    },
  );
  if (mErr) throw mErr;

  // 6) Link stock move back to allocation
  const { error: linkErr } = await supabase
    .from("work_order_part_allocations")
    .update({ stock_move_id: moveId as string })
    .eq("id", alloc.id);
  if (linkErr) throw linkErr;

  // 7) Revalidate WO page if your route matches /work-orders/[id]
  revalidatePath(`/work-orders/${workOrderId}`);

  return { allocationId: alloc.id as string, moveId: moveId as string };
}
```

