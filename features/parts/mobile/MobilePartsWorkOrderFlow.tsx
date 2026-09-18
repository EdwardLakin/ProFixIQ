"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  InventoryPickerModal,
  type InventorySearchResult,
} from "@/features/parts/components/request-workbench/InventoryPickerModal";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type WorkOrderRow = {
  id: string;
  custom_id: string | null;
  shop_id: string | null;
  customer_name: string | null;
};

type RequestRow = {
  id: string;
  shop_id: string | null;
  work_order_id: string | null;
  job_id: string | null;
  quote_line_id: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
};

type ItemRow = {
  id: string;
  request_id: string;
  work_order_id: string | null;
  work_order_line_id: string | null;
  quote_line_id: string | null;
  part_id: string | null;
  description: string | null;
  requested_part_number: string | null;
  requested_manufacturer: string | null;
  qty: number | null;
  qty_requested: number | null;
  qty_approved: number | null;
  qty_received: number | null;
  quoted_price: number | null;
  unit_price: number | null;
  status: string | null;
};

type LineRow = {
  id: string;
  description: string | null;
  complaint: string | null;
};

type PartRow = {
  id: string;
  name: string | null;
  sku: string | null;
  part_number: string | null;
  manufacturer?: string | null;
  supplier?: string | null;
  price: number | null;
  default_price: number | null;
};

type DraftItem = {
  id: string;
  description: string;
  partNumber: string;
  manufacturer: string;
  qty: string;
  sellPrice: string;
};

type RequestModel = {
  request: RequestRow;
  items: ItemRow[];
  label: string;
};

type ApiBody = {
  ok?: boolean;
  error?: string;
  item?: ItemRow;
  committedCount?: number;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isOperationallyReleased(status: unknown): boolean {
  return [
    "approved",
    "partially_ordered",
    "partially_received",
    "received",
    "partially_consumed",
    "partially_returned",
    "fulfilled",
  ].includes(text(status).toLowerCase());
}

function requestStage(status: unknown): "needs_quote" | "approval" | "released" {
  const value = text(status).toLowerCase();
  if (value === "requested") return "needs_quote";
  if (value === "quoted") return "approval";
  return "released";
}

function stageLabel(stage: ReturnType<typeof requestStage>): string {
  if (stage === "needs_quote") return "Needs quote";
  if (stage === "approval") return "Awaiting approval";
  return "Released";
}

function requestLabel(
  request: RequestRow,
  items: ItemRow[],
  lineById: Map<string, LineRow>,
): string {
  const linkedId =
    items.find((item) => text(item.work_order_line_id))?.work_order_line_id ??
    request.job_id;
  if (linkedId) {
    const line = lineById.get(linkedId);
    const lineText = text(line?.description) || text(line?.complaint);
    if (lineText) return lineText;
  }

  const notes = text(request.notes);
  const serviceMatch =
    notes.match(/Service to quote:\s*([^\n\r]+)/i) ??
    notes.match(/Maintenance parts quote required:\s*([^\n\r]+)/i);
  if (serviceMatch?.[1]?.trim()) return serviceMatch[1].trim();

  const itemDescription = items.map((item) => text(item.description)).find(Boolean);
  return itemDescription || "Parts request";
}

function itemPrice(item: ItemRow): number {
  return numberValue(item.quoted_price ?? item.unit_price, 0);
}

function itemQty(item: ItemRow): number {
  return numberValue(item.qty ?? item.qty_requested, 1);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

const fieldClass =
  "min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-base text-[color:var(--theme-text-primary)] outline-none focus:border-sky-400";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)]";
const primaryButton =
  "inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-500/45 bg-emerald-600 px-4 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45";

export default function MobilePartsWorkOrderFlow(): JSX.Element {
  const params = useParams<{ id: string }>();
  const routeId = params?.id ?? "";
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [workOrder, setWorkOrder] = useState<WorkOrderRow | null>(null);
  const [requests, setRequests] = useState<RequestModel[]>([]);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftItem>>({});
  const [parts, setParts] = useState<PartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerItemId, setPickerItemId] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerPartId, setPickerPartId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!routeId) return;
    setLoading(true);

    try {
      const { data: woData, error: woError } = await supabase
        .from("work_orders")
        .select("id, custom_id, shop_id, customer_name")
        .eq("id", routeId)
        .maybeSingle();
      if (woError) throw woError;
      if (!woData) throw new Error("Work order not found.");

      const wo = woData as WorkOrderRow;
      setWorkOrder(wo);

      const [{ data: requestData, error: requestError }, { data: lineData, error: lineError }] =
        await Promise.all([
          supabase
            .from("part_requests")
            .select(
              "id, shop_id, work_order_id, job_id, quote_line_id, status, notes, created_at",
            )
            .eq("work_order_id", wo.id)
            .neq("status", "cancelled")
            .order("created_at", { ascending: false }),
          supabase
            .from("work_order_lines")
            .select("id, description, complaint")
            .eq("work_order_id", wo.id),
        ]);

      if (requestError) throw requestError;
      if (lineError) throw lineError;

      const requestRows = (requestData ?? []) as RequestRow[];
      const requestIds = requestRows.map((request) => request.id);
      let itemRows: ItemRow[] = [];

      if (requestIds.length > 0) {
        const { data, error } = await supabase
          .from("part_request_items")
          .select(
            "id, request_id, work_order_id, work_order_line_id, quote_line_id, part_id, description, requested_part_number, requested_manufacturer, qty, qty_requested, qty_approved, qty_received, quoted_price, unit_price, status",
          )
          .in("request_id", requestIds)
          .order("created_at", { ascending: true });
        if (error) throw error;
        itemRows = (data ?? []) as ItemRow[];
      }

      const lineById = new Map(
        ((lineData ?? []) as LineRow[]).map((line) => [line.id, line]),
      );
      const itemsByRequest = new Map<string, ItemRow[]>();
      for (const item of itemRows) {
        const current = itemsByRequest.get(item.request_id) ?? [];
        current.push(item);
        itemsByRequest.set(item.request_id, current);
      }

      const nextRequests = requestRows.map((request) => {
        const items = itemsByRequest.get(request.id) ?? [];
        return {
          request,
          items,
          label: requestLabel(request, items, lineById),
        };
      });
      nextRequests.sort((a, b) => {
        const order = { needs_quote: 0, approval: 1, released: 2 } as const;
        const delta =
          order[requestStage(a.request.status)] - order[requestStage(b.request.status)];
        return delta || a.label.localeCompare(b.label);
      });
      setRequests(nextRequests);

      setActiveRequestId((current) => {
        if (current && nextRequests.some((entry) => entry.request.id === current)) {
          return current;
        }
        return nextRequests[0]?.request.id ?? null;
      });

      const nextDrafts: Record<string, DraftItem> = {};
      for (const item of itemRows) {
        nextDrafts[item.id] = {
          id: item.id,
          description: text(item.description),
          partNumber: text(item.requested_part_number),
          manufacturer: text(item.requested_manufacturer),
          qty: String(itemQty(item)),
          sellPrice:
            item.quoted_price == null && item.unit_price == null
              ? ""
              : String(itemPrice(item)),
        };
      }
      setDrafts(nextDrafts);

      if (wo.shop_id) {
        const { data: partData, error: partError } = await supabase
          .from("parts")
          .select("*")
          .eq("shop_id", wo.shop_id)
          .order("name")
          .limit(1000);
        if (partError) throw partError;
        setParts((partData ?? []) as PartRow[]);
      } else {
        setParts([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load parts.");
    } finally {
      setLoading(false);
    }
  }, [routeId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const active =
    requests.find((entry) => entry.request.id === activeRequestId) ?? requests[0] ?? null;
  const activeStage = active ? requestStage(active.request.status) : "needs_quote";
  const activeTotal = active
    ? active.items.reduce((sum, item) => sum + itemQty(item) * itemPrice(item), 0)
    : 0;

  const pickerResults = useMemo<InventorySearchResult[]>(() => {
    const query = pickerQuery.trim().toLowerCase();
    return parts
      .filter((part) => {
        if (!query) return true;
        return [
          part.name,
          part.part_number,
          part.sku,
          part.manufacturer,
          part.supplier,
        ]
          .map((value) => text(value).toLowerCase())
          .some((value) => value.includes(query));
      })
      .map((part) => ({
        value: part.id,
        label: text(part.name) || text(part.part_number) || "Part",
        sku: part.sku,
        partNumber: part.part_number,
        manufacturer: part.manufacturer ?? part.supplier ?? null,
        onHandQty: null,
      }));
  }, [parts, pickerQuery]);

  function updateDraft(itemId: string, patch: Partial<DraftItem>): void {
    setDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? {
          id: itemId,
          description: "",
          partNumber: "",
          manufacturer: "",
          qty: "1",
          sellPrice: "",
        }),
        ...patch,
      },
    }));
  }

  async function saveActiveRequest(): Promise<void> {
    if (!active) return;
    setSaving(true);

    try {
      for (const item of active.items) {
        const draft = drafts[item.id];
        if (!draft) continue;

        const qty = Number(draft.qty);
        const sellPrice = draft.sellPrice.trim() === "" ? null : Number(draft.sellPrice);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error("Quantity must be greater than zero.");
        }
        if (sellPrice != null && (!Number.isFinite(sellPrice) || sellPrice < 0)) {
          throw new Error("Sell price must be zero or greater.");
        }

        const isQuoteOnly =
          Boolean(item.quote_line_id ?? active.request.quote_line_id) &&
          !text(item.work_order_line_id);
        const endpoint = isQuoteOnly
          ? `/api/parts/requests/items/${item.id}/quote-save`
          : `/api/parts/requests/items/${item.id}/edit`;
        const method = isQuoteOnly ? "POST" : "PATCH";
        const payload = isQuoteOnly
          ? {
              quoteLineId: item.quote_line_id ?? active.request.quote_line_id,
              partId: item.part_id,
              description: draft.description,
              requestedPartNumber: draft.partNumber || null,
              requestedManufacturer: draft.manufacturer || null,
              qty,
              quotedPrice: sellPrice,
            }
          : {
              description: draft.description,
              requested_part_number: draft.partNumber || null,
              requested_manufacturer: draft.manufacturer || null,
              qty,
              quoted_price: sellPrice,
            };

        const response = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = (await response.json().catch(() => null)) as ApiBody | null;
        if (!response.ok || body?.ok === false) {
          throw new Error(body?.error || "Could not save the parts request.");
        }
      }

      toast.success(
        activeStage === "needs_quote" ? "Parts quote saved." : "Part changes saved.",
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save parts.");
    } finally {
      setSaving(false);
    }
  }

  async function releaseActiveRequest(): Promise<void> {
    if (!active || !isOperationallyReleased(active.request.status)) return;
    setSaving(true);
    try {
      const fingerprint = active.items
        .map((item) =>
          [item.id, item.part_id ?? "", itemQty(item), itemPrice(item)].join(":"),
        )
        .join("|");
      const idempotencyKey = `mobile-parts-package:${active.request.id}:${fingerprint}`;
      const response = await fetch(
        `/api/parts/requests/${active.request.id}/commit-package`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotencyKey }),
        },
      );
      const body = (await response.json().catch(() => null)) as ApiBody | null;
      if (!response.ok || body?.ok === false) {
        throw new Error(body?.error || "Could not release parts to the work order.");
      }
      toast.success("Parts released to the work order.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not release parts.");
    } finally {
      setSaving(false);
    }
  }

  async function addPart(): Promise<void> {
    if (!active || !workOrder) return;
    const request = active.request;
    const quoteLineId = request.quote_line_id ?? null;
    const lineId =
      active.items.find((item) => text(item.work_order_line_id))?.work_order_line_id ??
      request.job_id ??
      null;

    if (!quoteLineId && !lineId) {
      toast.error("This request is not linked to a repair line yet.");
      return;
    }

    const { data, error } = await supabase
      .from("part_request_items")
      .insert({
        request_id: request.id,
        shop_id: request.shop_id ?? workOrder.shop_id ?? undefined,
        work_order_id: workOrder.id,
        quote_line_id: quoteLineId,
        work_order_line_id: quoteLineId ? null : lineId,
        description: "",
        qty: 1,
        quoted_price: null,
        part_id: null,
      })
      .select("id")
      .maybeSingle();

    if (error || !data?.id) {
      toast.error(error?.message || "Could not add another part.");
      return;
    }

    toast.success("Part row added.");
    await load();
  }

  async function attachInventoryPart(partId: string): Promise<void> {
    if (!pickerItemId) return;
    const response = await fetch(
      `/api/parts/requests/items/${pickerItemId}/inventory`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "attach", partId }),
      },
    );
    const body = (await response.json().catch(() => null)) as ApiBody | null;
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error || "Could not attach inventory part.");
    }
    toast.success("Inventory part selected.");
    setPickerItemId(null);
    setPickerPartId(null);
    setPickerQuery("");
    await load();
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-6 text-sm text-[color:var(--theme-text-secondary)]">
        Loading parts…
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      <div className="flex items-center justify-between gap-3">
        <Link className={secondaryButton} href="/mobile/parts">
          ← Parts
        </Link>
        <button className={secondaryButton} type="button" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
          {workOrder?.custom_id || "Work order"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
          Parts
        </h1>
        {workOrder?.customer_name ? (
          <div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            {workOrder.customer_name}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-red-400/35 bg-red-500/10 px-2.5 py-1 text-red-700 dark:text-red-100">
            {requests.filter((entry) => requestStage(entry.request.status) === "needs_quote").length} need quote
          </span>
          <span className="rounded-full border border-amber-400/35 bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-100">
            {requests.filter((entry) => requestStage(entry.request.status) === "approval").length} awaiting approval
          </span>
          <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-100">
            {requests.filter((entry) => requestStage(entry.request.status) === "released").length} released
          </span>
        </div>
      </section>

      <section className="space-y-2">
        <div className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
          Jobs
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {requests.map((entry) => {
            const selected = entry.request.id === active?.request.id;
            const stage = requestStage(entry.request.status);
            return (
              <button
                key={entry.request.id}
                type="button"
                onClick={() => setActiveRequestId(entry.request.id)}
                className={[
                  "min-w-[12rem] rounded-2xl border p-3 text-left",
                  selected
                    ? "border-sky-400 bg-sky-500/10 ring-2 ring-sky-400/25"
                    : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]",
                ].join(" ")}
              >
                <div className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  {entry.label}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[color:var(--theme-text-secondary)]">
                  <span>{stageLabel(stage)}</span>
                  <span>{entry.items.length} parts</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {active ? (
        <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
          <div className="flex items-start justify-between gap-3 border-b border-[color:var(--theme-border-soft)] pb-4">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.15em] text-[color:var(--theme-text-muted)]">
                {stageLabel(activeStage)}
              </div>
              <h2 className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">
                {active.label}
              </h2>
              <div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                {active.items.length} part{active.items.length === 1 ? "" : "s"} · {formatMoney(activeTotal)}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {active.items.map((item) => {
              const draft = drafts[item.id];
              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3"
                >
                  <div className="grid gap-3">
                    <label className="text-xs text-[color:var(--theme-text-secondary)]">
                      Description
                      <input
                        className={fieldClass}
                        value={draft?.description ?? ""}
                        placeholder="Part description"
                        disabled={activeStage === "released"}
                        onChange={(event) =>
                          updateDraft(item.id, { description: event.target.value })
                        }
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-[color:var(--theme-text-secondary)]">
                        Part #
                        <input
                          className={fieldClass}
                          value={draft?.partNumber ?? ""}
                          placeholder="Part #"
                          disabled={activeStage === "released"}
                          onChange={(event) =>
                            updateDraft(item.id, { partNumber: event.target.value })
                          }
                        />
                      </label>
                      <label className="text-xs text-[color:var(--theme-text-secondary)]">
                        Manufacturer
                        <input
                          className={fieldClass}
                          value={draft?.manufacturer ?? ""}
                          placeholder="Manufacturer"
                          disabled={activeStage === "released"}
                          onChange={(event) =>
                            updateDraft(item.id, { manufacturer: event.target.value })
                          }
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-[color:var(--theme-text-secondary)]">
                        Qty
                        <input
                          className={fieldClass}
                          inputMode="decimal"
                          value={draft?.qty ?? "1"}
                          disabled={activeStage === "released"}
                          onChange={(event) =>
                            updateDraft(item.id, { qty: event.target.value })
                          }
                        />
                      </label>
                      <label className="text-xs text-[color:var(--theme-text-secondary)]">
                        Sell price
                        <input
                          className={fieldClass}
                          inputMode="decimal"
                          value={draft?.sellPrice ?? ""}
                          placeholder="0.00"
                          disabled={activeStage === "released"}
                          onChange={(event) =>
                            updateDraft(item.id, { sellPrice: event.target.value })
                          }
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={activeStage === "released"}
                      onClick={() => {
                        setPickerItemId(item.id);
                        setPickerPartId(item.part_id);
                        setPickerQuery(
                          draft?.description || draft?.partNumber || "",
                        );
                      }}
                    >
                      {item.part_id ? "Change inventory part" : "Select inventory part"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {activeStage !== "released" ? (
            <button
              type="button"
              className={secondaryButton + " mt-3 w-full"}
              onClick={() => void addPart()}
            >
              + Add part
            </button>
          ) : null}
        </section>
      ) : (
        <div className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 text-sm text-[color:var(--theme-text-secondary)]">
          No active parts requests for this work order.
        </div>
      )}

      {active ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-xl gap-2">
            {activeStage === "needs_quote" || activeStage === "approval" ? (
              <button
                type="button"
                className={primaryButton + " flex-1"}
                disabled={saving || activeStage === "released"}
                onClick={() => void saveActiveRequest()}
              >
                {saving
                  ? "Saving…"
                  : activeStage === "needs_quote"
                    ? "Save Parts Quote"
                    : "Save Part Changes"}
              </button>
            ) : null}
            {isOperationallyReleased(active.request.status) ? (
              <button
                type="button"
                className={primaryButton + " flex-1"}
                disabled={saving}
                onClick={() => void releaseActiveRequest()}
              >
                {saving ? "Releasing…" : "Release to Work Order"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <InventoryPickerModal
        open={Boolean(pickerItemId)}
        title="Select inventory part"
        results={pickerResults}
        query={pickerQuery}
        onQueryChange={setPickerQuery}
        selectedPartId={pickerPartId}
        onSelectedPartChange={setPickerPartId}
        onAttach={async ({ partId }) => {
          await attachInventoryPart(partId);
        }}
        onClose={() => {
          setPickerItemId(null);
          setPickerPartId(null);
          setPickerQuery("");
        }}
      />
    </div>
  );
}
