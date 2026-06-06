//app/work-orders/[id]/approve/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import SignaturePad, {
  openSignaturePad,
} from "@/features/shared/signaturePad/controller";
import LegalTerms from "@/features/shared/components/LegalTerms";
import { uploadSignatureImage } from "@/features/shared/lib/utils/uploadSignature";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type LegacyLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];
type Json = DB["public"]["Tables"]["work_order_quote_lines"]["Row"]["metadata"];

type ApprovalItem =
  | { kind: "quote"; key: string; row: QuoteLine; pricing: ApprovalPricing }
  | { kind: "legacy"; key: string; row: LegacyLine; pricing: ApprovalPricing };

type ApprovalPricing = {
  laborHours: number;
  laborRate: number;
  laborTotal: number;
  partsTotal: number;
  taxTotal: number;
  grandTotal: number;
  totalLabelSuffix: string | null;
  pendingParts: boolean;
  incomplete: boolean;
  rateMissing: boolean;
};

const CUSTOMER_READY_QUOTE_STATUSES = new Set([
  "sent",
  "ready_to_send",
  "quoted",
  "approved",
  "converted",
  "pending_parts",
]);
const CUSTOMER_READY_QUOTE_STAGES = new Set([
  "advisor_pending",
  "ready_to_send",
  "customer_sent",
  "customer_approved",
]);
const EXCLUDED_QUOTE_STATUSES = new Set([
  "declined",
  "deferred",
  "rejected",
  "cancelled",
]);

const getStr = (obj: unknown, key: string): string | null => {
  if (obj && typeof obj === "object") {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "string") return v.trim() || null;
  }
  return null;
};

const getNum = (obj: unknown, key: string): number | null => {
  if (obj && typeof obj === "object") {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
};

function getJobTypeLabel(raw: unknown): string {
  if (typeof raw !== "string") return "Job";
  const clean = raw.replaceAll("_", " ").trim();
  return clean ? clean[0].toUpperCase() + clean.slice(1) : "Job";
}

function metadataObject(
  metadata: Json | LegacyLine["intake_json"],
): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return {};
  return metadata as Record<string, unknown>;
}

function metadataArray(
  metadata: Record<string, unknown>,
  key: string,
): unknown[] {
  const value = metadata[key];
  return Array.isArray(value) ? value : [];
}

function firstNumber(
  ...values: Array<number | null | undefined>
): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function isCustomerReadyQuoteLine(line: QuoteLine): boolean {
  const status = (line.status ?? "").trim().toLowerCase();
  const stage = (line.stage ?? "").trim().toLowerCase();
  if (EXCLUDED_QUOTE_STATUSES.has(status)) return false;
  return (
    Boolean(line.sent_to_customer_at) ||
    CUSTOMER_READY_QUOTE_STATUSES.has(status) ||
    CUSTOMER_READY_QUOTE_STAGES.has(stage)
  );
}

function hasPendingParts(line: QuoteLine): boolean {
  const metadata = metadataObject(line.metadata);
  const parts = metadataArray(metadata, "parts");
  return (
    ((line.status ?? "").trim().toLowerCase() === "pending_parts" ||
      metadata.parts_verification_required === true) &&
    line.parts_total == null &&
    parts.length > 0
  );
}

function quoteLaborRate(
  line: QuoteLine,
  shopRate: number | null,
): number | null {
  const metadata = metadataObject(line.metadata);
  return firstNumber(
    getNum(metadata, "labor_rate"),
    getNum(metadata, "laborRate"),
    getNum(metadata, "hourly_rate"),
    getNum(metadata, "hourlyRate"),
    shopRate,
  );
}

function calculateQuotePricing(
  line: QuoteLine,
  shopRate: number | null,
): ApprovalPricing {
  const metadata = metadataObject(line.metadata);
  const laborHours =
    firstNumber(
      line.labor_hours,
      line.est_labor_hours,
      getNum(metadata, "labor_hours"),
      getNum(metadata, "laborHours"),
    ) ?? 0;
  const laborRate = quoteLaborRate(line, shopRate) ?? 0;
  const laborTotal = line.labor_total ?? laborHours * laborRate;
  const partsTotal = line.parts_total ?? 0;
  const taxTotal = line.tax_total ?? 0;
  const subtotalPlusTax =
    line.subtotal != null ? line.subtotal + taxTotal : null;
  const componentTotal =
    line.labor_total != null || line.parts_total != null
      ? laborTotal + partsTotal + taxTotal
      : null;
  const fallbackTotal = laborHours * laborRate + partsTotal + taxTotal;
  const pendingParts = hasPendingParts(line);
  const grandTotal =
    firstNumber(
      line.grand_total,
      subtotalPlusTax,
      componentTotal,
      fallbackTotal,
    ) ?? 0;

  return {
    laborHours,
    laborRate,
    laborTotal,
    partsTotal,
    taxTotal,
    grandTotal,
    totalLabelSuffix: pendingParts ? "+ parts pending" : null,
    pendingParts,
    incomplete:
      pendingParts ||
      (grandTotal <= 0 &&
        (laborHours > 0 || metadataArray(metadata, "parts").length > 0)),
    rateMissing: laborHours > 0 && laborRate <= 0,
  };
}

function calculateLegacyPricing(
  line: LegacyLine,
  shopRate: number | null,
): ApprovalPricing {
  const intake = metadataObject(line.intake_json);
  const laborHours =
    firstNumber(
      line.labor_time,
      getNum(intake, "labor_hours"),
      getNum(intake, "est_labor_hours"),
    ) ?? 0;
  const laborRate =
    firstNumber(
      getNum(intake, "labor_rate"),
      getNum(intake, "laborRate"),
      shopRate,
    ) ?? 0;
  const laborTotal =
    firstNumber(getNum(intake, "labor_total"), laborHours * laborRate) ?? 0;
  const partsTotal =
    firstNumber(getNum(intake, "parts_total"), getNum(intake, "partsTotal")) ??
    0;
  const taxTotal =
    firstNumber(getNum(intake, "tax_total"), getNum(intake, "taxTotal")) ?? 0;
  const grandTotal =
    firstNumber(
      getNum(intake, "grand_total"),
      getNum(intake, "grandTotal"),
      line.price_estimate,
      laborTotal + partsTotal + taxTotal,
    ) ?? 0;

  return {
    laborHours,
    laborRate,
    laborTotal,
    partsTotal,
    taxTotal,
    grandTotal,
    totalLabelSuffix: null,
    pendingParts: false,
    incomplete: grandTotal <= 0 && laborHours > 0,
    rateMissing: laborHours > 0 && laborRate <= 0,
  };
}

function quoteTitle(line: QuoteLine): string {
  return line.description || line.ai_complaint || line.notes || "Quote item";
}

function legacyTitle(line: LegacyLine): string {
  return (
    line.description || line.complaint || line.notes || "Manual approval item"
  );
}

export default function ApproveWorkOrderPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [quoteLines, setQuoteLines] = useState<QuoteLine[]>([]);
  const [legacyLines, setLegacyLines] = useState<LegacyLine[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [savedSigUrl, setSavedSigUrl] = useState<string | null>(null);
  const [agreed, setAgreed] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      if (!id) return;
      setLoading(true);
      setErr(null);
      try {
        const { data: woRow, error: woErr } = await supabase
          .from("work_orders")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (woErr) throw woErr;

        const workOrder = (woRow as WorkOrder | null) ?? null;
        setWo(workOrder);

        if (!workOrder?.shop_id) {
          setShop(null);
          setQuoteLines([]);
          setLegacyLines([]);
          setApproved(new Set());
          return;
        }

        const [
          { data: shopRow, error: shopErr },
          { data: quoteRows, error: quoteErr },
          { data: lineRows, error: lineErr },
        ] = await Promise.all([
          supabase
            .from("shops")
            .select("*")
            .eq("id", workOrder.shop_id)
            .maybeSingle(),
          supabase
            .from("work_order_quote_lines")
            .select("*")
            .eq("shop_id", workOrder.shop_id)
            .eq("work_order_id", id)
            .order("created_at", { ascending: true }),
          supabase
            .from("work_order_lines")
            .select("*")
            .eq("shop_id", workOrder.shop_id)
            .eq("work_order_id", id)
            .neq("status", "completed")
            .order("created_at", { ascending: true }),
        ]);

        if (shopErr) throw shopErr;
        if (quoteErr) throw quoteErr;
        if (lineErr) throw lineErr;

        const safeQuoteLines = ((quoteRows as QuoteLine[] | null) ?? []).filter(
          isCustomerReadyQuoteLine,
        );
        const quoteLineIds = new Set(safeQuoteLines.map((line) => line.id));
        const materializedLineIds = new Set(
          safeQuoteLines.map((line) => line.work_order_line_id).filter(Boolean),
        );
        const safeLegacyLines = (
          (lineRows as LegacyLine[] | null) ?? []
        ).filter((line) => {
          if (materializedLineIds.has(line.id)) return false;
          if (line.source_row_id && quoteLineIds.has(line.source_row_id))
            return false;
          if (
            line.external_id?.startsWith("quote_line:") &&
            quoteLineIds.has(line.external_id.slice("quote_line:".length))
          )
            return false;
          return true;
        });

        setShop((shopRow as Shop | null) ?? null);
        setQuoteLines(safeQuoteLines);
        setLegacyLines(safeLegacyLines);
        setApproved(
          new Set([
            ...safeQuoteLines
              .filter((line) => !hasPendingParts(line))
              .map((line) => `quote:${line.id}`),
            ...safeLegacyLines.map((line) => `legacy:${line.id}`),
          ]),
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load work order.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, supabase]);

  const shopLaborRate = getNum(shop, "labor_rate");
  const currencyCode = (getStr(shop, "currency") ?? "USD").toUpperCase();
  const fmt = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
      }),
    [currencyCode],
  );

  const items = useMemo<ApprovalItem[]>(() => {
    const quoteItems = quoteLines.map((row) => ({
      kind: "quote" as const,
      key: `quote:${row.id}`,
      row,
      pricing: calculateQuotePricing(row, shopLaborRate),
    }));
    const legacyItems = legacyLines.map((row) => ({
      kind: "legacy" as const,
      key: `legacy:${row.id}`,
      row,
      pricing: calculateLegacyPricing(row, shopLaborRate),
    }));
    return [...quoteItems, ...legacyItems];
  }, [quoteLines, legacyLines, shopLaborRate]);

  const toggle = (item: ApprovalItem) => {
    if (
      item.pricing.pendingParts ||
      item.pricing.incomplete ||
      item.pricing.rateMissing
    )
      return;
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(item.key)) next.delete(item.key);
      else next.add(item.key);
      return next;
    });
  };

  const approvedItems = items.filter((item) => approved.has(item.key));
  const hours = approvedItems.reduce<number>(
    (sum, item) => sum + item.pricing.laborHours,
    0,
  );
  const laborTotal = approvedItems.reduce<number>(
    (sum, item) => sum + item.pricing.laborTotal,
    0,
  );
  const partsTotal = approvedItems.reduce<number>(
    (sum, item) => sum + item.pricing.partsTotal,
    0,
  );
  const taxTotal = approvedItems.reduce<number>(
    (sum, item) => sum + item.pricing.taxTotal,
    0,
  );
  const grandTotal = approvedItems.reduce<number>(
    (sum, item) => sum + item.pricing.grandTotal,
    0,
  );
  const selectedIncomplete = approvedItems.some(
    (item) =>
      item.pricing.incomplete ||
      item.pricing.rateMissing ||
      item.pricing.pendingParts,
  );
  const anyPendingParts = items.some((item) => item.pricing.pendingParts);
  const canSubmit =
    agreed && !submitting && !selectedIncomplete && approvedItems.length > 0;
  const submitDisabledReason = !agreed
    ? "Please agree to the Terms & Conditions"
    : approvedItems.length === 0
      ? "Select at least one priced approval item"
      : selectedIncomplete
        ? "Selected items have incomplete pricing"
        : "Sign & Submit";

  async function handleSubmit(signatureDataUrl?: string) {
    if (!id || selectedIncomplete || approvedItems.length === 0) return;
    setSubmitting(true);
    setErr(null);

    try {
      let signatureUrl: string | null = savedSigUrl;
      if (signatureDataUrl) {
        const uploaded = await uploadSignatureImage(signatureDataUrl, id);
        signatureUrl = uploaded;
        setSavedSigUrl(uploaded);
      }

      const approvedQuoteLineIds = approvedItems
        .filter((item) => item.kind === "quote")
        .map((item) => item.row.id);
      const approvedLineIds = approvedItems
        .filter((item) => item.kind === "legacy")
        .map((item) => item.row.id);
      const declinedQuoteLineIds = quoteLines
        .filter(
          (line) => !approved.has(`quote:${line.id}`) && !hasPendingParts(line),
        )
        .map((line) => line.id);
      const declinedLineIds = legacyLines
        .map((line) => line.id)
        .filter((lineId) => !approved.has(`legacy:${lineId}`));

      const res = await fetch("/api/quotes/approval-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId: id,
          shopId: wo?.shop_id ?? null,
          customerId: wo?.customer_id ?? null,
          approvedLineIds,
          declinedLineIds,
          approvedQuoteLineIds,
          declinedQuoteLineIds,
          declineUnchecked: true,
          approverId: null,
          signatureUrl,
        }),
      });

      const j = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) throw new Error(j?.error ?? "Failed to submit approval");

      router.replace(`/work-orders/confirm?woId=${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-800/80" />
          <div className="h-24 animate-pulse rounded-2xl bg-slate-900/80" />
        </div>
      </div>
    );
  }

  if (!wo) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-8 text-red-100">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
          Work order not found.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/85 p-5 shadow-[0_18px_50px_rgba(2,6,23,0.45)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                Approval review
              </p>
              <h1 className="text-xl font-semibold text-slate-100">
                {shop?.name ?? "ProFixIQ Work Order"}
              </h1>
              <p className="text-sm text-slate-300">
                Review selected items, confirm totals, and submit your decision.
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-2 text-right">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                Estimate total
              </p>
              <p className="text-lg font-semibold text-[var(--accent-copper-light)]">
                {fmt.format(grandTotal)}
              </p>
              {approvedItems.some((item) => item.pricing.totalLabelSuffix) ? (
                <p className="text-xs text-amber-200">+ parts pending</p>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">
                Work order
              </span>
              <div className="font-medium text-slate-100">
                {wo.custom_id ?? `#${wo.id.slice(0, 8)}`}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">
                Selected labor
              </span>
              <div className="font-medium text-slate-100">
                {hours.toFixed(1)}h
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">
                Currency
              </span>
              <div className="font-medium text-slate-100">{currencyCode}</div>
            </div>
          </div>

          {err ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              <p className="font-semibold">Approval action failed</p>
              <p className="mt-1 text-red-100/90">{err}</p>
            </div>
          ) : null}

          {anyPendingParts ? (
            <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Some quote items still need parts pricing. They are shown for
              context but cannot be selected for final approval until parts are
              quoted.
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/85 p-5 shadow-[0_14px_42px_rgba(2,6,23,0.35)]">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Approval items
              </h2>
              <p className="text-sm text-slate-400">
                Select the priced work you want approved. Unselected priced
                lines will be declined.
              </p>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-400">
              No items available for approval.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const isSelected = approved.has(item.key);
                const pricing = item.pricing;
                const disabled =
                  pricing.pendingParts ||
                  pricing.incomplete ||
                  pricing.rateMissing;
                const title =
                  item.kind === "quote"
                    ? quoteTitle(item.row)
                    : legacyTitle(item.row);
                const detail =
                  item.kind === "quote"
                    ? item.row.ai_correction || item.row.notes
                    : item.row.correction || item.row.notes;

                return (
                  <label
                    key={item.key}
                    className={`block rounded-xl border px-4 py-3 transition ${
                      isSelected
                        ? "border-sky-400/40 bg-sky-500/10"
                        : disabled
                          ? "cursor-not-allowed border-amber-400/30 bg-amber-500/10"
                          : "cursor-pointer border-slate-700 bg-slate-950/70 hover:border-slate-500"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-slate-500 bg-slate-950 text-[var(--accent-copper)] focus:ring-[var(--accent-copper)] disabled:cursor-not-allowed"
                          checked={isSelected}
                          onChange={() => toggle(item)}
                          disabled={disabled}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-100">
                            {title}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                            <span>{getJobTypeLabel(item.row.job_type)}</span>
                            <span>
                              Labor{" "}
                              {pricing.laborHours > 0
                                ? `${pricing.laborHours.toFixed(1)}h @ ${fmt.format(pricing.laborRate)}/hr`
                                : "—"}
                            </span>
                            <span>
                              {item.kind === "quote"
                                ? "Canonical quote line"
                                : "Legacy/manual line"}
                            </span>
                            <span>
                              {isSelected
                                ? "Selected"
                                : disabled
                                  ? "Needs pricing"
                                  : "Not selected"}
                            </span>
                          </div>
                          {detail ? (
                            <p className="mt-2 line-clamp-2 text-xs text-slate-300/90">
                              <span className="font-medium text-slate-200">
                                Details:
                              </span>{" "}
                              {detail}
                            </p>
                          ) : null}
                          {pricing.pendingParts ? (
                            <p className="mt-2 text-xs font-medium text-amber-200">
                              Parts quote pending — approval is disabled until
                              parts pricing is complete.
                            </p>
                          ) : null}
                          {pricing.rateMissing ? (
                            <p className="mt-2 text-xs font-medium text-red-200">
                              Labor rate missing — this item cannot be approved
                              at {fmt.format(0)}/hr.
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="shrink-0 text-right text-xs">
                        <p className="text-slate-400">Line total</p>
                        <p className="text-sm font-semibold text-slate-100">
                          {fmt.format(pricing.grandTotal)}
                        </p>
                        {pricing.totalLabelSuffix ? (
                          <p className="font-medium text-amber-200">
                            {pricing.totalLabelSuffix}
                          </p>
                        ) : null}
                        <p className="mt-1 text-slate-400">
                          Labor {fmt.format(pricing.laborTotal)}
                        </p>
                        <p className="text-slate-400">
                          Parts{" "}
                          {pricing.pendingParts
                            ? "pending"
                            : fmt.format(pricing.partsTotal)}
                        </p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/85 p-5 shadow-[0_14px_42px_rgba(2,6,23,0.35)]">
          <h2 className="text-base font-semibold text-slate-100">Totals</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <span>Labor ({hours.toFixed(1)}h)</span>
              <span className="font-medium text-slate-100">
                {fmt.format(laborTotal)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Parts</span>
              <span className="font-medium text-slate-100">
                {fmt.format(partsTotal)}
              </span>
            </div>
            {taxTotal > 0 ? (
              <div className="flex items-center justify-between">
                <span>Tax</span>
                <span className="font-medium text-slate-100">
                  {fmt.format(taxTotal)}
                </span>
              </div>
            ) : null}
            <div className="mt-2 flex items-center justify-between border-t border-slate-700 pt-2">
              <span className="font-semibold text-slate-100">Total</span>
              <span className="text-base font-semibold text-[var(--accent-copper-light)]">
                {fmt.format(grandTotal)}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/85 p-5 shadow-[0_14px_42px_rgba(2,6,23,0.35)]">
          <LegalTerms onAgreeChange={setAgreed} defaultOpen />
        </section>

        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/85 p-5 shadow-[0_14px_42px_rgba(2,6,23,0.35)]">
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded-lg bg-[var(--accent-copper)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-copper-light)] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={async () => {
                const base64: string | null = await openSignaturePad({
                  shopName: shop?.name || "",
                });
                if (base64) await handleSubmit(base64);
              }}
              disabled={!canSubmit}
              title={submitDisabledReason}
            >
              {submitting ? "Submitting…" : "Sign & approve"}
            </button>

            <button
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              title={submitDisabledReason}
            >
              Approve without signature
            </button>

            <p className="text-xs text-slate-400">
              {canSubmit
                ? "Your approval will be linked to this work order record."
                : submitDisabledReason}
            </p>
          </div>
        </section>

        <SignaturePad />
      </div>
    </div>
  );
}
