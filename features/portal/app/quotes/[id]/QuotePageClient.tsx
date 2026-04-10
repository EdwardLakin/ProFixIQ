"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import QuoteApprovalActions from "@/features/portal/components/QuoteApprovalActions";
import DecisionTimeline, {
  type DecisionTimelineStage,
} from "@/features/shared/components/ui/DecisionTimeline";
import DecisionEventFeed from "@/features/shared/components/ui/DecisionEventFeed";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";
import { formatDecisionStatus, resolveDecisionStatus } from "@/features/shared/lib/decisionStatus";
import { deriveEventsFromQuote } from "@/features/shared/lib/decisionEvents";
import {
  calculateTax,
  getTaxAmount,
  isProvinceCode,
  type ProvinceCode,
} from "@/features/integrations/tax";

const COPPER = "#C57A4A";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];
type AllocationRow = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];

type ParamsShape = Record<string, string | string[] | undefined>;

type QuoteLineRow = Pick<
  WorkOrderLineRow,
  | "id"
  | "description"
  | "complaint"
  | "labor_time"
  | "price_estimate"
  | "line_no"
  | "approval_state"
  | "status"
  | "created_at"
  | "updated_at"
>;

type AllocationWithPart = Pick<
  AllocationRow,
  "id" | "work_order_line_id" | "qty" | "unit_cost"
> & {
  parts: Pick<PartRow, "name" | "part_number" | "sku">[] | Pick<PartRow, "name" | "part_number" | "sku"> | null;
};

type LineView = {
  id: string;
  lineNo: number | null;
  title: string;
  complaint: string | null;
  laborHours: number;
  laborAmount: number;
  partsAmount: number;
  totalAmount: number;
  approvalState: "pending" | "approved" | "declined" | null;
  status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  parts: Array<{
    name: string;
    qty: number;
    unitCost: number;
    total: number;
    meta: string | null;
  }>;
};

function paramToString(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function safeTrim(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function getShopProvinceCode(shop: ShopRow | null): ProvinceCode | null {
  const s = shop as unknown as { province_code?: unknown; province?: unknown } | null;
  const raw = safeTrim(s?.province_code ?? s?.province ?? "").toUpperCase();
  if (!raw) return null;
  return isProvinceCode(raw) ? raw : null;
}

function getPartName(parts: AllocationWithPart["parts"]): string {
  if (Array.isArray(parts)) {
    return safeTrim(parts[0]?.name) || "Part";
  }
  if (parts && typeof parts === "object") {
    return safeTrim(parts.name) || "Part";
  }
  return "Part";
}

function getPartMeta(parts: AllocationWithPart["parts"]): string | null {
  const source = Array.isArray(parts) ? parts[0] : parts;
  if (!source || typeof source !== "object") return null;
  const pn = safeTrim((source as { part_number?: unknown }).part_number);
  const sku = safeTrim((source as { sku?: unknown }).sku);
  return [pn, sku].filter(Boolean).join(" • ") || null;
}

export default function QuotePageClient(): JSX.Element {
  const router = useRouter();
  const params = useParams();
  const workOrderId = useMemo(() => paramToString((params as ParamsShape).id), [params]);
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);
  const [workOrder, setWorkOrder] = useState<WorkOrderRow | null>(null);
  const [shop, setShop] = useState<ShopRow | null>(null);
  const [lines, setLines] = useState<LineView[]>([]);

  const load = useCallback(async () => {
    if (!workOrderId) {
      router.replace("/portal");
      return;
    }

    setLoading(true);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      router.replace("/portal/auth/sign-in");
      return;
    }

    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (custErr || !customer?.id) {
      router.replace("/portal");
      return;
    }

    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("*")
      .eq("id", workOrderId)
      .eq("customer_id", customer.id)
      .maybeSingle();

    if (woErr || !wo) {
      router.replace("/portal");
      return;
    }

    setWorkOrder(wo as WorkOrderRow);

    let shopRow: ShopRow | null = null;
    let laborRate = 0;

    if (wo.shop_id) {
      const { data } = await supabase.from("shops").select("*").eq("id", wo.shop_id).maybeSingle();
      shopRow = (data ?? null) as ShopRow | null;
      laborRate = asNumber((data as { labor_rate?: unknown } | null)?.labor_rate);
    }

    setShop(shopRow);

    const { data: lineRowsRaw, error: lineErr } = await supabase
      .from("work_order_lines")
      .select("id, description, complaint, labor_time, price_estimate, line_no, approval_state, status, created_at, updated_at")
      .eq("work_order_id", workOrderId)
      .order("line_no", { ascending: true });

    if (lineErr) {
      setLines([]);
      setLoading(false);
      return;
    }

    const lineRows = (lineRowsRaw ?? []) as QuoteLineRow[];
    const lineIds = lineRows.map((l) => l.id).filter(Boolean);

    let allocRows: AllocationWithPart[] = [];
    if (lineIds.length > 0) {
      const { data: allocs } = await supabase
        .from("work_order_part_allocations")
        .select("id, work_order_line_id, qty, unit_cost, parts(name, part_number, sku)")
        .in("work_order_line_id", lineIds);

      allocRows = (allocs ?? []) as AllocationWithPart[];
    }

    const byLine = new Map<string, AllocationWithPart[]>();
    for (const a of allocRows) {
      const lineId = safeTrim(a.work_order_line_id);
      if (!lineId) continue;
      const bucket = byLine.get(lineId) ?? [];
      bucket.push(a);
      byLine.set(lineId, bucket);
    }

    const mapped: LineView[] = lineRows.map((line) => {
      const allocs = byLine.get(line.id) ?? [];
      const parts = allocs.map((a) => {
        const qty = asNumber(a.qty);
        const unitCost = asNumber(a.unit_cost);
        return {
          name: getPartName(a.parts),
          qty,
          unitCost,
          total: qty * unitCost,
          meta: getPartMeta(a.parts),
        };
      });

      const partsAmount = parts.reduce((sum, p) => sum + p.total, 0);
      const laborHours = asNumber(line.labor_time);
      const computedLabor = laborHours * laborRate;
      const explicitLineTotal =
        typeof line.price_estimate === "number" && Number.isFinite(line.price_estimate)
          ? line.price_estimate
          : null;

      const totalAmount = explicitLineTotal != null ? explicitLineTotal : computedLabor + partsAmount;
      const laborAmount = Math.max(0, totalAmount - partsAmount);

      return {
        id: line.id,
        lineNo: typeof line.line_no === "number" ? line.line_no : asNumber(line.line_no) || null,
        title: safeTrim(line.description) || safeTrim(line.complaint) || "Line item",
        complaint: safeTrim(line.complaint) || null,
        laborHours,
        laborAmount,
        partsAmount,
        totalAmount,
        approvalState:
          line.approval_state === "approved" || line.approval_state === "declined" || line.approval_state === "pending"
            ? line.approval_state
            : null,
        status: line.status,
        createdAt: line.created_at ?? null,
        updatedAt: line.updated_at ?? null,
        parts,
      };
    });

    setLines(mapped);
    setLoading(false);
  }, [router, supabase, workOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!workOrderId) {
    return <div className="min-h-screen px-4 py-10 text-center text-red-300">Missing quote id.</div>;
  }

  if (loading || !workOrder) {
    return (
      <div className="min-h-screen px-4 py-10 flex items-center justify-center text-neutral-300">
        Loading quote...
      </div>
    );
  }

  const titleLabel = workOrder.custom_id || `Work Order ${workOrder.id.slice(0, 8)}…`;

  const subtotal = lines.reduce((sum, line) => sum + line.totalAmount, 0);
  const laborSubtotal = lines.reduce((sum, line) => sum + line.laborAmount, 0);
  const partsSubtotal = lines.reduce((sum, line) => sum + line.partsAmount, 0);

  const provinceCode = getShopProvinceCode(shop);
  const taxRes = provinceCode ? calculateTax(subtotal, provinceCode) : null;
  const taxAmount = taxRes ? getTaxAmount(taxRes) : 0;
  const grandTotal = subtotal + taxAmount;
  const timelineStages: DecisionTimelineStage[] = [
    { key: "inspection", label: "Inspection completed", state: "past" },
    {
      key: "recommendation",
      label: "Recommendation issued",
      state: lines.length > 0 ? "past" : "future",
    },
    {
      key: "approval",
      label: "Awaiting approval",
      state: lines.some((line) => resolveDecisionStatus({ approvalState: line.approvalState }) === "awaiting_approval")
        ? "current"
        : lines.some((line) => resolveDecisionStatus({ approvalState: line.approvalState }) === "approved")
          ? "past"
          : "future",
    },
    {
      key: "execution",
      label: "Work started",
      state: lines.some((line) => resolveDecisionStatus({ workStatus: line.status }) === "in_progress")
        ? "current"
        : lines.some((line) => resolveDecisionStatus({ workStatus: line.status }) === "completed")
          ? "past"
          : "future",
    },
  ];
  const decisionEvents = useMemo(
    () =>
      deriveEventsFromQuote({
        workOrder,
        lines: lines.map((line) => ({
          id: line.id,
          line_no: line.lineNo,
          description: line.title,
          approval_state: line.approvalState,
          status: line.status,
          created_at: line.createdAt,
          updated_at: line.updatedAt,
        })),
        actorLabel: "Shop team",
      }),
    [workOrder, lines],
  );

  return (
    <div
      className="
        min-h-screen px-4 text-foreground
        bg-background
        bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]
      "
    >
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center py-10">
        <div
          className="
            w-full rounded-3xl border
            border-[color:var(--metal-border-soft,#1f2937)]
            bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_82%)]
            shadow-[0_32px_80px_rgba(0,0,0,0.95)]
            px-6 py-7 sm:px-8 sm:py-9
          "
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <Link
              href="/portal"
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-neutral-200 hover:bg-black/70 hover:text-white"
            >
              <span aria-hidden className="text-base leading-none">←</span>
              Back
            </Link>

            <div
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-neutral-300"
              style={{ color: COPPER }}
            >
              Quote
            </div>
          </div>

          <div className="mb-6 space-y-1">
            <h1
              className="text-2xl sm:text-3xl font-semibold text-white"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              {titleLabel}
            </h1>
            <p className="text-xs text-neutral-400 sm:text-sm">
              Review each recommendation with pricing context, then decide what should proceed.
            </p>
          </div>
          <DecisionTimeline stages={timelineStages} className="mb-6" />
          <DecisionEventFeed events={decisionEvents} className="mb-6" compact maxVisible={5} />

          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">Labor</div>
              <div className="mt-1 text-lg font-semibold text-white">{formatCurrency(laborSubtotal)}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">Parts</div>
              <div className="mt-1 text-lg font-semibold text-white">{formatCurrency(partsSubtotal)}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">Tax</div>
              <div className="mt-1 text-lg font-semibold text-white">{formatCurrency(taxAmount)}</div>
              <div className="mt-0.5 text-[11px] text-neutral-500">
                {provinceCode ? `CA (${provinceCode})` : "Not set"}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">Grand Total</div>
              <div className="mt-1 text-lg font-semibold text-white">{formatCurrency(grandTotal)}</div>
              <div className="mt-0.5 text-[11px] text-neutral-500">Requested: {formatDate(workOrder.created_at)}</div>
            </div>
          </div>

          <div className="space-y-4">
            {lines.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-neutral-400">
                No quote lines are available yet.
              </div>
            ) : (
              lines.map((line) => (
                <div key={line.id} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                        Recommendation
                      </div>
                      <div className="text-sm font-semibold text-white">
                        {line.lineNo ? `#${line.lineNo} • ` : ""}{line.title}
                      </div>
                      {line.complaint ? (
                        <div className="mt-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-neutral-300">
                          <span className="text-neutral-500">Issue observed:</span> {line.complaint}
                        </div>
                      ) : null}
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-semibold text-white">{formatCurrency(line.totalAmount)}</div>
                      <div className="mt-1 flex justify-end">
                        <StatusBadge
                          variant={
                            formatDecisionStatus({
                              approvalState: line.approvalState,
                              workStatus: line.status,
                            }).variant
                          }
                        >
                          {
                            formatDecisionStatus({
                              approvalState: line.approvalState,
                              workStatus: line.status,
                            }).label
                          }
                        </StatusBadge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Labor evidence</div>
                      <div className="mt-1 text-sm font-medium text-white">{formatCurrency(line.laborAmount)}</div>
                      <div className="mt-1 text-xs text-neutral-400">{line.laborHours.toFixed(1)} hr</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Parts</div>
                      <div className="mt-1 text-sm font-medium text-white">{formatCurrency(line.partsAmount)}</div>
                      <div className="mt-1 text-xs text-neutral-400">{line.parts.length} item(s)</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Decision total</div>
                      <div className="mt-1 text-sm font-medium text-white">{formatCurrency(line.totalAmount)}</div>
                    </div>
                  </div>

                  {line.parts.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Parts breakdown</div>
                      {line.parts.map((part, idx) => (
                        <div key={`${line.id}-${idx}`} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-white">{part.name}</div>
                              {part.meta ? <div className="mt-1 text-xs text-neutral-400">{part.meta}</div> : null}
                              <div className="mt-1 text-xs text-neutral-500">
                                Qty {part.qty} × {formatCurrency(part.unitCost)}
                              </div>
                            </div>
                            <div className="text-sm font-medium text-white">{formatCurrency(part.total)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <QuoteApprovalActions
            workOrderId={workOrder.id}
            lines={lines.map((line) => ({
              id: line.id,
              description: line.title,
              approval_state: line.approvalState,
              status: line.status,
            }))}
            onChanged={() => {
              void load();
            }}
          />
        </div>
      </div>
    </div>
  );
}
