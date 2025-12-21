// app/parts/requests/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type RequestRow = DB["public"]["Tables"]["part_requests"]["Row"];
type ItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type LocationRow = DB["public"]["Tables"]["stock_locations"]["Row"];
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type QuoteUpdate = DB["public"]["Tables"]["work_order_quote_lines"]["Update"];

type Status = RequestRow["status"];

type UpsertResponse = {
  ok: boolean;
  menuItemId?: string;
  updated?: boolean;
  error?: string;
  detail?: string;
};

type UiItem = ItemRow & {
  ui_added: boolean; // staged/locked for quote
  ui_part_id: string | null;
  ui_qty: number;
  ui_price?: number; // sell/unit (undefined = not set)
};

function toNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function resolveWorkOrderLineId(
  currentReq: RequestRow | null,
  list: UiItem[],
): string | null {
  // prefer an existing item line id (most correct)
  for (const it of list) {
    if (isNonEmptyString(it.work_order_line_id)) return it.work_order_line_id;
  }

  // ✅ in your schema, part_requests.job_id is being used as the WO line id
  if (isNonEmptyString(currentReq?.job_id)) return currentReq.job_id;

  return null;
}

function reqStatusChip(status: Status | null | undefined): string {
  const s = (status ?? "requested").toLowerCase();
  // needs quote (red) vs quoted (blue/green)
  if (s === "quoted") {
    return "inline-flex items-center rounded-full border border-teal-500/40 bg-teal-900/20 px-3 py-1 text-xs font-medium text-teal-200";
  }
  return "inline-flex items-center rounded-full border border-red-500/40 bg-red-900/20 px-3 py-1 text-xs font-medium text-red-200";
}

export default function PartsRequestDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [req, setReq] = useState<RequestRow | null>(null);
  const [wo, setWo] = useState<Pick<WorkOrderRow, "id" | "custom_id"> | null>(
    null,
  );

  const [rows, setRows] = useState<UiItem[]>([]);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationId, setLocationId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [addingItem, setAddingItem] = useState(false);
  const [quoting, setQuoting] = useState(false);

  // theme (match WO cards feel, but with burnt-copper accents)
  const COPPER = "#c88a4d";
  const pageWrap =
    "w-full bg-background px-3 py-6 text-foreground sm:px-6 lg:px-10 xl:px-16";
  const card = "rounded-xl border border-white/18 bg-card/90 p-4 shadow-sm";
  const subCard = "rounded-lg border border-white/12 bg-muted/70 p-3";
  const btn =
    "inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60";
  const btnGhost = `${btn} border-white/18 bg-card/70 hover:bg-card/90`;
  const btnCopper = `${btn} border-[${COPPER}]/40 bg-card/70 text-[${COPPER}] hover:bg-[${COPPER}]/10`;
  const input =
    "w-full rounded-md border border-white/12 bg-card/70 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-white/20";
  const select =
    "rounded-md border border-white/12 bg-card/70 px-2 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-white/20";

  const workOrderLineId = useMemo(
    () => resolveWorkOrderLineId(req, rows),
    [req, rows],
  );

  const staged = useMemo(() => rows.filter((r) => r.ui_added), [rows]);

  const stagedTotalSell = useMemo(() => {
    let sum = 0;
    for (const it of staged) {
      const qty = toNum(it.ui_qty, 0);
      const price = it.ui_price ?? 0;
      sum += price * qty;
    }
    return sum;
  }, [staged]);

  const stagedValid = useMemo(() => {
    if (staged.length === 0) return false;
    return staged.every((it) => {
      const qty = toNum(it.ui_qty, 0);
      return !!it.ui_part_id && qty > 0 && it.ui_price != null;
    });
  }, [staged]);

  const allItemsQuoted = useMemo(() => {
    if (rows.length === 0) return false;
    return rows.every((it) => {
      const qty = toNum(it.ui_qty, 0);
      // “Quoted” means it has a part + qty + price persisted/staged-ready
      return !!it.ui_part_id && qty > 0 && it.ui_price != null;
    });
  }, [rows]);

  async function load(): Promise<void> {
    setLoading(true);

    const { data: r, error: rErr } = await supabase
      .from("part_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (rErr) toast.error(rErr.message);
    setReq(r ?? null);

    if (r?.work_order_id) {
      const { data: woRow } = await supabase
        .from("work_orders")
        .select("id, custom_id")
        .eq("id", r.work_order_id)
        .maybeSingle();
      setWo(
        woRow
          ? ({ id: woRow.id, custom_id: woRow.custom_id ?? null } as Pick<
              WorkOrderRow,
              "id" | "custom_id"
            >)
          : null,
      );
    } else {
      setWo(null);
    }

    const { data: its, error: itErr } = await supabase
      .from("part_request_items")
      .select("*")
      .eq("request_id", id)
      .order("id", { ascending: true });

    if (itErr) toast.error(itErr.message);

    const itemRows = (its ?? []) as ItemRow[];
    const ui: UiItem[] = itemRows.map((row) => {
      const sell = row.quoted_price == null ? undefined : toNum(row.quoted_price, 0);
      return {
        ...row,
        ui_added: false,
        ui_part_id: row.part_id ?? null,
        ui_qty: toNum(row.qty, 1),
        ui_price: sell,
      };
    });
    setRows(ui);

    if (r?.shop_id) {
      const [{ data: ps }, { data: locs }] = await Promise.all([
        supabase
          .from("parts")
          .select("*")
          .eq("shop_id", r.shop_id)
          .order("name")
          .limit(1000),
        supabase
          .from("stock_locations")
          .select("*")
          .eq("shop_id", r.shop_id)
          .order("code"),
      ]);

      setParts((ps ?? []) as PartRow[]);
      const locList = (locs ?? []) as LocationRow[];
      setLocations(locList);

      if (!locationId && locList.length === 1 && locList[0]?.id) {
        setLocationId(String(locList[0].id));
      }
    } else {
      setParts([]);
      setLocations([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function updateRow(itemId: string, patch: Partial<UiItem>): void {
    setRows((prev) =>
      prev.map((x) => (x.id === itemId ? ({ ...x, ...patch } as UiItem) : x)),
    );
  }

  async function addItem(): Promise<void> {
    if (!req) {
      toast.error("Request not loaded yet.");
      return;
    }

    setAddingItem(true);
    try {
      const lineId = resolveWorkOrderLineId(req, rows);

      const insertPayload: DB["public"]["Tables"]["part_request_items"]["Insert"] =
        {
          request_id: req.id,
          // ✅ stamp line id if we can resolve it (prevents “missing line id” later)
          work_order_line_id: lineId,
          description: "",
          qty: 1,
          quoted_price: null,
          vendor: null,
          part_id: null,
        };

      const { data, error } = await supabase
        .from("part_request_items")
        .insert(insertPayload)
        .select("*")
        .maybeSingle<ItemRow>();

      if (error) {
        toast.error(error.message);
        return;
      }
      if (!data) {
        toast.error("Could not create a new item.");
        return;
      }

      const ui: UiItem = {
        ...data,
        ui_added: false,
        ui_part_id: data.part_id ?? null,
        ui_qty: toNum(data.qty, 1),
        ui_price: data.quoted_price == null ? undefined : toNum(data.quoted_price, 0),
      };

      setRows((prev) => [...prev, ui]);
    } finally {
      setAddingItem(false);
    }
  }

  async function deleteLine(itemId: string): Promise<void> {
    const ok = window.confirm("Remove this item from the request?");
    if (!ok) return;

    const { data: deleted, error } = await supabase
      .from("part_request_items")
      .delete()
      .eq("id", itemId)
      .select("id")
      .maybeSingle();

    if (error) {
      toast.error(error.message);
      return;
    }
    if (!deleted?.id) {
      toast.error("Not permitted to delete this item (RLS).");
      return;
    }

    setRows((prev) => prev.filter((x) => x.id !== itemId));
    toast.success("Item removed.");
  }

  function stageAddToLine(itemId: string): void {
    const it = rows.find((x) => x.id === itemId);
    if (!it) return;

    const partId = it.ui_part_id;
    const qty = toNum(it.ui_qty, 0);
    const price = it.ui_price;

    if (!partId) {
  toast.error("Pick a stock part first.");
  return;
}
if (!qty || qty <= 0) {
  toast.error("Enter a quantity greater than 0.");
  return;
}
if (price == null || !Number.isFinite(price)) {
  toast.error("Price is missing.");
  return;
}

    updateRow(itemId, { ui_added: true });
  }

  function unstage(itemId: string): void {
    updateRow(itemId, { ui_added: false });
  }

  async function markQuoted(): Promise<void> {
    if (!req) return;

    const lineId = resolveWorkOrderLineId(req, rows);

    if (!lineId) {
      toast.error("Missing work order line id for this request.");
      return;
    }

    if (!locationId) {
      toast.error("Select a stock location first.");
      return;
    }

    // ✅ allow partial quoting: only quote the staged rows
    if (!stagedValid) {
      toast.error("Add at least one part (and lock it) before quoting.");
      return;
    }

    setQuoting(true);
    try {
      // 1) Persist staged items only (ONE SAVE on Quote)
      for (const it of staged) {
        const partId = it.ui_part_id;
        const qty = toNum(it.ui_qty, 1);
        const price = it.ui_price;

        if (!partId || price == null) {
          toast.error("Some staged rows are missing a part or price.");
          return;
        }

        const part = parts.find((p) => String(p.id) === String(partId));
        const desc = (part?.name ?? it.description ?? "").trim();

        const { error } = await supabase
          .from("part_request_items")
          .update({
            part_id: partId,
            description: desc || it.description || "Part",
            qty,
            quoted_price: price,
            vendor: null,
            markup_pct: null,
            work_order_line_id: it.work_order_line_id ?? lineId,
          })
          .eq("id", it.id);

        if (error) {
          toast.error(error.message);
          return;
        }
      }

      // 2) Allocate inventory + stock move for staged items only
      for (const it of staged) {
        const { error } = await supabase.rpc(
          "upsert_part_allocation_from_request_item",
          {
            p_request_item_id: it.id,
            p_location_id: locationId,
            p_create_stock_move: true,
          },
        );

        if (error) {
          toast.error(error.message);
          return;
        }
      }

      // If some items remain unquoted, keep request status requested (for vendor wait etc.)
      const nowFullyQuoted = allItemsQuoted;

      if (nowFullyQuoted) {
        // 3) Set request status => quoted
        const { error: statusErr } = await supabase.rpc(
          "set_part_request_status",
          {
            p_request: id,
            p_status: "quoted" satisfies Status,
          },
        );

        if (statusErr) {
          toast.error(statusErr.message);
          return;
        }

        // 4) Update WO line status so WO UI reflects it
        const { error: wolErr } = await supabase
          .from("work_order_lines")
          .update({
            status: "quoted",
            approval_state: "pending",
            hold_reason: "Parts quote ready – awaiting customer approval",
          } as DB["public"]["Tables"]["work_order_lines"]["Update"])
          .eq("id", lineId);

        if (wolErr) {
          toast.error(`Quoted, but WO line update failed: ${wolErr.message}`);
          return;
        }

        // 5) Sync quote totals for the line (use staged total for this submit)
        if (req.work_order_id) {
          const { error: quoteErr } = await supabase
            .from("work_order_quote_lines")
            .update({
              stage: "advisor_pending",
              parts_total: stagedTotalSell,
              grand_total: stagedTotalSell,
            } as QuoteUpdate)
            .match({
              work_order_id: req.work_order_id,
              work_order_line_id: lineId,
            });

          if (quoteErr)
            toast.warning(`WO quote totals not synced: ${quoteErr.message}`);
        }

        // 6) Menu save (best-effort)
        try {
          const res = await fetch("/api/menu-items/upsert-from-line", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workOrderLineId: lineId }),
          });

          const j = (await res.json().catch(() => null)) as UpsertResponse | null;

          if (!res.ok || !j?.ok) {
            toast.warning(
              j?.detail ||
                j?.error ||
                "Quoted, but couldn’t save to menu items (see server logs / RLS).",
            );
          }
        } catch (e) {
          toast.warning(
            e instanceof Error
              ? `Quoted, but couldn’t save to menu items: ${e.message}`
              : "Quoted, but couldn’t save to menu items (network error).",
          );
        }

        window.dispatchEvent(new Event("parts-request:submitted"));
        toast.success("Request marked as quoted.");
        router.back();
        return;
      }

      toast.success("Saved partial quote. Remaining items still need pricing.");
      // keep user on page; clear staged flags
      setRows((prev) => prev.map((r) => ({ ...r, ui_added: false })));
      void load();
    } finally {
      setQuoting(false);
    }
  }

  const woDisplay = wo?.custom_id || (wo?.id ? `#${wo.id.slice(0, 8)}` : "—");

  return (
    <div className={pageWrap}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <button className={btnGhost} onClick={() => router.back()}>
          ← Back
        </button>
      </div>

      {loading || !req ? (
        <div className={card}>Loading…</div>
      ) : (
        <div className="space-y-6">
          <div className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Work order / request
                </div>
                <div className="text-xl font-semibold text-foreground">
                  {woDisplay}{" "}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    · Request #{req.id.slice(0, 8)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Created{" "}
                  {req.created_at ? new Date(req.created_at).toLocaleString() : "—"}
                  {workOrderLineId ? (
                    <span className="ml-2">· Line {workOrderLineId.slice(0, 8)}</span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={reqStatusChip(req.status)}>Status: {req.status ?? "requested"}</span>

                <button
                  className={btnGhost}
                  onClick={() => void addItem()}
                  disabled={addingItem || quoting}
                >
                  {addingItem ? "Adding…" : "＋ Add part row"}
                </button>

                {req.status !== "quoted" && (
                  <button
                    className={btnCopper}
                    onClick={() => void markQuoted()}
                    disabled={quoting || !stagedValid}
                    title={!stagedValid ? "Lock at least one row (Add to line) first" : ""}
                  >
                    {quoting ? "Saving…" : "Mark Quoted"}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className={subCard}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Instructions
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Select stock part → set qty/price →{" "}
                  <span style={{ color: COPPER, fontWeight: 600 }}>
                    Add to line
                  </span>
                  . You can quote what you have now and leave the rest unquoted.
                </div>
              </div>

              <div className={subCard}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Stock location
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <select
                    className={`${select} w-full`}
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    disabled={quoting || locations.length === 0}
                  >
                    <option value="">— select —</option>
                    {locations.map((l) => (
                      <option key={String(l.id)} value={String(l.id)}>
                        {l.code ? `${l.code} — ${l.name}` : l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className={card}>
            <div className="overflow-hidden rounded-lg border border-white/12">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">Stock part</th>
                    <th className="p-3 text-left">Description</th>
                    <th className="p-3 text-right">Qty</th>
                    <th className="p-3 text-right">Price</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="w-48 p-3" />
                  </tr>
                </thead>

                <tbody>
                  {rows.length === 0 ? (
                    <tr className="border-t border-white/10">
                      <td className="p-4 text-sm text-muted-foreground" colSpan={6}>
                        No items yet. Click “Add part row”.
                      </td>
                    </tr>
                  ) : (
                    rows.map((it) => {
                      const locked = it.ui_added || quoting;
                      const qty = toNum(it.ui_qty, 0);
                      const price = it.ui_price ?? 0;
                      const lineTotal = qty > 0 ? price * qty : 0;

                      return (
                        <tr key={String(it.id)} className="border-t border-white/10">
                          <td className="p-3 align-top">
                            <select
                              className={`${select} w-full`}
                              value={it.ui_part_id ?? ""}
                              onChange={(e) => {
                                const partId = e.target.value || null;
                                const p = parts.find((x) => String(x.id) === String(partId));
                                updateRow(String(it.id), {
                                  ui_part_id: partId,
                                  part_id: partId,
                                  description: (p?.name ?? it.description ?? "").trim(),
                                  ui_price: p?.price == null ? undefined : toNum(p.price, 0),
                                  ui_added: false,
                                });
                              }}
                              disabled={locked}
                            >
                              <option value="">— select —</option>
                              {parts.map((p) => (
                                <option key={String(p.id)} value={String(p.id)}>
                                  {p.sku ? `${p.sku} — ${p.name}` : p.name}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="p-3 align-top">
                            <input
                              className={input}
                              value={it.description ?? ""}
                              placeholder="Description"
                              onChange={(e) =>
                                updateRow(String(it.id), {
                                  description: e.target.value,
                                  ui_added: false,
                                })
                              }
                              disabled={locked}
                            />
                          </td>

                          <td className="p-3 text-right align-top">
                            <input
                              type="number"
                              min={1}
                              step={1}
                              className={`${input} w-24 text-right`}
                              value={Number.isFinite(it.ui_qty) ? String(it.ui_qty) : "1"}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const nextQty = raw === "" ? 1 : Math.max(1, Math.floor(toNum(raw, 1)));
                                updateRow(String(it.id), { ui_qty: nextQty, ui_added: false });
                              }}
                              disabled={locked}
                            />
                          </td>

                          <td className="p-3 text-right align-top">
                            <input
                              type="number"
                              step={0.01}
                              className={`${input} w-28 text-right`}
                              value={it.ui_price == null ? "" : String(it.ui_price)}
                              onChange={(e) => {
                                const raw = e.target.value;
                                updateRow(String(it.id), {
                                  ui_price: raw === "" ? undefined : toNum(raw, 0),
                                  ui_added: false,
                                });
                              }}
                              disabled={locked}
                            />
                          </td>

                          <td className="p-3 text-right tabular-nums align-top">
                            {lineTotal.toFixed(2)}
                          </td>

                          <td className="p-3 align-top">
                            <div className="flex flex-col items-stretch gap-2">
                              {!it.ui_added ? (
                                <button
                                  className={btnGhost}
                                  onClick={() => stageAddToLine(String(it.id))}
                                  disabled={quoting}
                                >
                                  Add to line
                                </button>
                              ) : (
                                <button
                                  className={btnCopper}
                                  onClick={() => unstage(String(it.id))}
                                  disabled={quoting}
                                >
                                  Added ✓ (undo)
                                </button>
                              )}

                              <button
                                className={`${btn} border-red-500/40 bg-red-900/10 text-red-200 hover:bg-red-900/20`}
                                onClick={() => void deleteLine(String(it.id))}
                                disabled={quoting}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                <tfoot>
                  <tr className="bg-muted/60">
                    <td className="p-3 text-right" colSpan={4}>
                      <span className="text-sm text-muted-foreground">
                        Total (staged)
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums font-semibold">
                      {stagedTotalSell.toFixed(2)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {!stagedValid && rows.length > 0 && req.status !== "quoted" && (
              <div className="mt-3 text-xs text-muted-foreground">
                Tip: stage at least one row with <span style={{ color: COPPER }}>Add to line</span>, then press{" "}
                <span style={{ color: COPPER }}>Mark Quoted</span>.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}