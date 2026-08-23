"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Database } from "@shared/types/types/supabase";
import QuoteApprovalActions from "@/features/portal/components/QuoteApprovalActions";
import PortalInvoicePayButton from "@/features/stripe/components/PortalInvoicePayButton";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";
import { formatDecisionStatus } from "@/features/shared/lib/decisionStatus";
import {
  calculateTax,
  getTaxAmount,
  isProvinceCode,
  type ProvinceCode,
} from "@/features/integrations/tax";
import {
  calculateShopSupplies,
  resolveShopSuppliesOverride,
  resolveShopSuppliesSettings,
  shopSuppliesSummaryText,
  shopSuppliesTaxableSubtotal,
} from "@/features/work-orders/lib/shopSupplies";
import EvidenceImage from "@/features/work-orders/components/evidence/EvidenceImage";
import {
  isVideoEvidence,
  type WorkOrderEvidenceItem,
} from "@/features/work-orders/lib/evidence/workOrderEvidence";
import { selectCustomerVisibleQuoteParts } from "@/features/portal/lib/customerVisibleQuoteParts";
import { canonicalQuotePartQuantity } from "@/features/parts/lib/quote-parts-contract";
import {
  isCustomerVisibleDirectWorkOrderLine,
  isCustomerVisibleQuoteLine,
} from "@/features/portal/lib/quoteApprovalPresentation";
import { loadOptionalQuoteEvidence } from "@/features/portal/lib/loadOptionalQuoteEvidence";
import RouteLoadPanel from "@/features/shared/components/ui/RouteLoadPanel";
import {
  asRouteLoadFailure,
  routeLoadFailureFromStatus,
  runBoundedRouteLoad,
  type RouteLoadFailure,
} from "@/features/shared/lib/route-load";

const COPPER = "#C57A4A";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];
type QuoteLineDbRow = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type WorkOrderLineDbRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderPartDbRow = DB["public"]["Tables"]["work_order_parts"]["Row"];
type InspectionPhotoRow = DB["public"]["Tables"]["inspection_photos"]["Row"];

type PortalQuoteDetailPayload = {
  workOrder: WorkOrderRow;
  shop: ShopRow | null;
  quoteLines: QuoteLineRow[];
  workOrderLines: DirectLineRow[];
  workOrderParts: DirectPartRow[];
  inspectionPhotos: Array<Pick<InspectionPhotoRow, "image_url" | "item_name">>;
  inspectionPhotosUnavailable: boolean;
};

type ParamsShape = Record<string, string | string[] | undefined>;

type QuoteLineRow = Pick<
  QuoteLineDbRow,
  | "id"
  | "description"
  | "ai_complaint"
  | "ai_cause"
  | "ai_correction"
  | "notes"
  | "job_type"
  | "labor_hours"
  | "est_labor_hours"
  | "labor_total"
  | "parts_total"
  | "subtotal"
  | "tax_total"
  | "grand_total"
  | "status"
  | "stage"
  | "sent_to_customer_at"
  | "approved_at"
  | "declined_at"
  | "work_order_line_id"
  | "metadata"
  | "created_at"
  | "updated_at"
>;

type DirectLineRow = Pick<
  WorkOrderLineDbRow,
  | "id"
  | "line_no"
  | "description"
  | "complaint"
  | "cause"
  | "correction"
  | "notes"
  | "technician_notes"
  | "labor_time"
  | "price_estimate"
  | "status"
  | "line_status"
  | "approval_state"
  | "approval_at"
  | "quoted_at"
  | "created_at"
  | "updated_at"
  | "voided_at"
>;

type DirectPartRow = Pick<
  WorkOrderPartDbRow,
  | "id"
  | "work_order_line_id"
  | "description_snapshot"
  | "part_number_snapshot"
  | "manufacturer_snapshot"
  | "quantity"
  | "unit_price"
  | "total_price"
  | "is_active"
>;

type QuotePartView = {
  name: string;
  qty: number;
  unitPrice: number | null;
  total: number | null;
  pricingUnavailable: boolean;
  meta: string | null;
};

type LineView = {
  id: string;
  source: "quote" | "work_order";
  lineNo: number | null;
  title: string;
  complaint: string | null;
  cause: string | null;
  correction: string | null;
  notes: string | null;
  laborHours: number;
  laborAmount: number;
  partsAmount: number;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  approvalState: "pending" | "approved" | "declined" | "deferred" | null;
  status: string | null;
  stage: string | null;
  sentAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  convertedWorkOrderLineId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  parts: QuotePartView[];
  evidence: WorkOrderEvidenceItem[];
  requestKind: "repair" | "parts_only" | null;
  fulfillment: "appointment" | "pickup" | null;
};

function paramToString(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readPortalQuotePayload(
  response: Response,
): Promise<PortalQuoteDetailPayload> {
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message =
      isRecord(body) && typeof body.error === "string"
        ? body.error
        : "This quote could not be loaded.";
    throw routeLoadFailureFromStatus(response.status, message);
  }
  if (
    !isRecord(body) ||
    !isRecord(body.workOrder) ||
    !Array.isArray(body.quoteLines) ||
    !Array.isArray(body.workOrderLines) ||
    !Array.isArray(body.workOrderParts) ||
    !Array.isArray(body.inspectionPhotos)
  ) {
    throw new Error("The quote response was incomplete.");
  }
  return body as unknown as PortalQuoteDetailPayload;
}

function safeTrim(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nullableNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
  const s = shop as unknown as {
    province_code?: unknown;
    province?: unknown;
  } | null;
  const raw = safeTrim(s?.province_code ?? s?.province ?? "").toUpperCase();
  if (!raw) return null;
  return isProvinceCode(raw) ? raw : null;
}

function quoteMetadata(
  line: Pick<QuoteLineRow, "metadata">,
): Record<string, unknown> {
  if (
    !line.metadata ||
    typeof line.metadata !== "object" ||
    Array.isArray(line.metadata)
  )
    return {};
  return line.metadata as Record<string, unknown>;
}

function metadataArray(
  metadata: Record<string, unknown>,
  key: string,
): unknown[] {
  const value = metadata[key];
  return Array.isArray(value) ? value : [];
}

function getPartName(part: Record<string, unknown>): string {
  return (
    safeTrim(part.name) ||
    safeTrim(part.selected_name) ||
    safeTrim(part.description) ||
    safeTrim(part.part_number) ||
    safeTrim(part.requested_part_number) ||
    safeTrim(part.sku) ||
    "Part"
  );
}

function getPartMeta(part: Record<string, unknown>): string | null {
  const pn = safeTrim(
    part.part_number ?? part.partNumber ?? part.requested_part_number,
  );
  const sku = safeTrim(part.sku);
  return [pn, sku].filter(Boolean).join(" • ") || null;
}

function getQuoteParts(
  line: QuoteLineRow,
  allowCanonicalPartsQuote: boolean,
): QuotePartView[] {
  const metadata = quoteMetadata(line);
  return selectCustomerVisibleQuoteParts(metadata, allowCanonicalPartsQuote)
    .filter(
      (part): part is Record<string, unknown> =>
        Boolean(part) && typeof part === "object" && !Array.isArray(part),
    )
    .map((part) => {
      const qty = canonicalQuotePartQuantity(part) || 1;
      const unitPrice = nullableNumber(
        part.unitPrice ?? part.unit_price ?? part.quoted_price ?? part.price,
      );
      const total =
        nullableNumber(
          part.totalPrice ?? part.total_price ?? part.line_total ?? part.total,
        ) ?? (unitPrice == null ? null : qty * unitPrice);
      return {
        name: getPartName(part),
        qty,
        unitPrice,
        total,
        pricingUnavailable:
          part.pricing_unavailable === true || unitPrice == null,
        meta: getPartMeta(part),
      };
    });
}

function getEvidencePhotos(
  line: QuoteLineRow,
  photos: Array<Pick<InspectionPhotoRow, "image_url" | "item_name">>,
): string[] {
  const metadata = quoteMetadata(line);
  const metadataPhotos = metadataArray(metadata, "photo_urls")
    .map((photo) => safeTrim(photo))
    .filter(Boolean);

  if (metadataPhotos.length > 0) return metadataPhotos.slice(0, 6);
  if (photos.length === 0) return [];

  const text = [
    safeTrim(line.description),
    safeTrim(line.ai_complaint),
    safeTrim(line.notes),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text) return [];

  return photos
    .filter((photo) => {
      const itemName = safeTrim(photo.item_name).toLowerCase();
      return (
        itemName &&
        (text.includes(itemName) || itemName.includes(text.slice(0, 20)))
      );
    })
    .map((photo) => safeTrim(photo.image_url))
    .filter(Boolean)
    .slice(0, 3);
}

function quoteApprovalState(line: QuoteLineRow): LineView["approvalState"] {
  const status = safeTrim(line.status).toLowerCase();
  const stage = safeTrim(line.stage).toLowerCase();
  if (
    status === "approved" ||
    status === "converted" ||
    stage === "customer_approved" ||
    line.approved_at ||
    line.work_order_line_id
  )
    return "approved";
  if (
    status === "declined" ||
    stage === "customer_declined" ||
    line.declined_at
  )
    return "declined";
  if (status === "deferred" || stage === "customer_deferred") return "deferred";
  return "pending";
}

export default function QuotePageClient(): JSX.Element {
  const router = useRouter();
  const params = useParams();
  const workOrderId = useMemo(
    () => paramToString((params as ParamsShape).id),
    [params],
  );
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<RouteLoadFailure | null>(null);
  const [evidenceWarning, setEvidenceWarning] =
    useState<RouteLoadFailure | null>(null);
  const [workOrder, setWorkOrder] = useState<WorkOrderRow | null>(null);
  const [shop, setShop] = useState<ShopRow | null>(null);
  const [lines, setLines] = useState<LineView[]>([]);

  const load = useCallback(async () => {
    if (!workOrderId) {
      setLoadFailure(
        routeLoadFailureFromStatus(404, "The quote link is incomplete."),
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadFailure(null);
    setEvidenceWarning(null);

    try {
      await runBoundedRouteLoad(
        {
          route: `/portal/quotes/${workOrderId}`,
          operation: "load customer quote",
        },
        async ({ recordStatus, signal }) => {
          const response = await fetch(
            `/api/portal/quotes/${encodeURIComponent(workOrderId)}`,
            { cache: "no-store", signal },
          );
          recordStatus(response.status);
          const payload = await readPortalQuotePayload(response);
          const wo = payload.workOrder;
          const shopRow = payload.shop;
          const laborRate = asNumber(shopRow?.labor_rate);
          const quoteRowsRaw = payload.quoteLines;
          const directRowsRaw = payload.workOrderLines;
          const directPartsRaw = payload.workOrderParts;
          const inspectionPhotos = payload.inspectionPhotos;
          let evidenceWarningCandidate: RouteLoadFailure | null =
            payload.inspectionPhotosUnavailable
              ? routeLoadFailureFromStatus(
                  503,
                  "Some quote evidence could not be loaded.",
                )
              : null;

          setWorkOrder(wo);
          setShop(shopRow);

          const evidenceResult = await loadOptionalQuoteEvidence({
            workOrderId,
            signal,
            recordStatus,
          });
          const canonicalEvidence = evidenceResult.items;
          evidenceWarningCandidate ??= evidenceResult.warning;

          const mappedQuoteLines: LineView[] = (quoteRowsRaw as QuoteLineRow[])
            .filter((line) =>
              isCustomerVisibleQuoteLine(
                line as unknown as Record<string, unknown>,
              ),
            )
            .map((line, index) => {
              const parts = getQuoteParts(line, Boolean(wo.estimate_number));
              const metadata = quoteMetadata(line);
              const customerLineNotes = wo.estimate_number
                ? ""
                : safeTrim(line.notes);
              const requestKind = safeTrim(metadata.request_kind);
              const fulfillment = safeTrim(metadata.fulfillment);
              const laborHours =
                nullableNumber(line.labor_hours) ??
                nullableNumber(line.est_labor_hours) ??
                0;
              const computedLabor =
                laborHours * (nullableNumber(metadata.labor_rate) ?? laborRate);
              const partsAmount =
                nullableNumber(line.parts_total) ??
                parts.reduce((sum, part) => sum + (part.total ?? 0), 0);
              const laborAmount =
                nullableNumber(line.labor_total) ?? computedLabor;
              const subtotalAmount =
                nullableNumber(line.subtotal) ?? laborAmount + partsAmount;
              const taxAmount = nullableNumber(line.tax_total) ?? 0;
              const totalAmount =
                nullableNumber(line.grand_total) ?? subtotalAmount + taxAmount;

              const linkedEvidence = canonicalEvidence.filter(
                (item) =>
                  item.quoteLineId === line.id ||
                  (line.work_order_line_id != null &&
                    item.workOrderLineId === line.work_order_line_id),
              );
              const fallbackEvidence: WorkOrderEvidenceItem[] =
                linkedEvidence.length > 0
                  ? []
                  : getEvidencePhotos(line, inspectionPhotos).map(
                      (url, photoIndex) => ({
                        id: `${line.id}-legacy-${photoIndex}`,
                        workOrderId,
                        workOrderLineId: line.work_order_line_id,
                        quoteLineId: line.id,
                        kind: "photo",
                        source: "inspection_finding",
                        visibility: "customer",
                        fileName: null,
                        contentType: "image/jpeg",
                        fileSize: null,
                        createdAt: null,
                        displayUrl: url,
                        annotation: null,
                      }),
                    );

              return {
                id: line.id,
                source: "quote" as const,
                lineNo: index + 1,
                title:
                  safeTrim(line.description) ||
                  safeTrim(line.ai_complaint) ||
                  "Quote line",
                complaint:
                  safeTrim(line.ai_complaint) || customerLineNotes || null,
                cause: safeTrim(line.ai_cause) || null,
                correction: safeTrim(line.ai_correction) || null,
                notes: customerLineNotes || null,
                laborHours,
                laborAmount,
                partsAmount,
                subtotalAmount,
                taxAmount,
                totalAmount,
                approvalState: quoteApprovalState(line),
                status: line.status,
                stage: line.stage,
                sentAt: line.sent_to_customer_at ?? null,
                approvedAt: line.approved_at ?? null,
                declinedAt: line.declined_at ?? null,
                convertedWorkOrderLineId: line.work_order_line_id ?? null,
                createdAt: line.created_at ?? null,
                updatedAt: line.updated_at ?? null,
                parts,
                evidence:
                  linkedEvidence.length > 0 ? linkedEvidence : fallbackEvidence,
                requestKind:
                  requestKind === "parts_only"
                    ? "parts_only"
                    : requestKind === "repair"
                      ? "repair"
                      : null,
                fulfillment:
                  fulfillment === "pickup"
                    ? "pickup"
                    : fulfillment === "appointment"
                      ? "appointment"
                      : null,
              };
            });

          const linkedWorkOrderLineIds = new Set(
            mappedQuoteLines
              .map((line) => line.convertedWorkOrderLineId)
              .filter((id): id is string => Boolean(id)),
          );
          const mappedDirectLines: LineView[] = (
            (directRowsRaw ?? []) as DirectLineRow[]
          )
            .filter((line) => {
              if (line.voided_at || linkedWorkOrderLineIds.has(line.id))
                return false;
              return isCustomerVisibleDirectWorkOrderLine(
                line as unknown as Record<string, unknown>,
              );
            })
            .map((line, index) => {
              const laborHours = asNumber(line.labor_time);
              const computedLabor = laborHours * laborRate;
              const laborAmount =
                nullableNumber(line.price_estimate) ?? computedLabor;
              const directParts: QuotePartView[] = (
                (directPartsRaw ?? []) as DirectPartRow[]
              )
                .filter((part) => part.work_order_line_id === line.id)
                .map((part) => {
                  const qty = asNumber(part.quantity);
                  const unitPrice = asNumber(part.unit_price);
                  return {
                    name: safeTrim(part.description_snapshot) || "Part",
                    qty,
                    unitPrice,
                    total: nullableNumber(part.total_price) ?? qty * unitPrice,
                    pricingUnavailable: false,
                    meta:
                      [
                        safeTrim(part.manufacturer_snapshot),
                        safeTrim(part.part_number_snapshot),
                      ]
                        .filter(Boolean)
                        .join(" • ") || null,
                  };
                });
              const partsAmount = directParts.reduce(
                (sum, part) => sum + (part.total ?? 0),
                0,
              );
              const totalAmount = laborAmount + partsAmount;
              const linkedEvidence = canonicalEvidence.filter(
                (item) => item.workOrderLineId === line.id,
              );
              const normalizedApprovalState = safeTrim(
                line.approval_state,
              ).toLowerCase();
              const approvalState: LineView["approvalState"] = [
                "pending",
                "approved",
                "declined",
                "deferred",
              ].includes(normalizedApprovalState)
                ? (normalizedApprovalState as Exclude<
                    LineView["approvalState"],
                    null
                  >)
                : ["completed", "ready_to_invoice", "invoiced"].includes(
                      safeTrim(line.status).toLowerCase(),
                    ) ||
                    safeTrim(line.line_status).toLowerCase() === "authorized"
                  ? "approved"
                  : null;
              return {
                id: line.id,
                source: "work_order" as const,
                lineNo: line.line_no ?? index + 1,
                title:
                  safeTrim(line.description) ||
                  safeTrim(line.complaint) ||
                  "Authorized work",
                complaint: safeTrim(line.complaint) || null,
                cause: safeTrim(line.cause) || null,
                correction: safeTrim(line.correction) || null,
                notes:
                  safeTrim(line.technician_notes) ||
                  safeTrim(line.notes) ||
                  null,
                laborHours,
                laborAmount,
                partsAmount,
                subtotalAmount: totalAmount,
                taxAmount: 0,
                totalAmount,
                approvalState,
                status: line.status,
                stage: null,
                sentAt: line.quoted_at ?? null,
                approvedAt: line.approval_at ?? null,
                declinedAt: null,
                convertedWorkOrderLineId: line.id,
                createdAt: line.created_at ?? null,
                updatedAt: line.updated_at ?? null,
                parts: directParts,
                evidence: linkedEvidence,
                requestKind: null,
                fulfillment: null,
              };
            });

          setEvidenceWarning(evidenceWarningCandidate);
          setLines([...mappedQuoteLines, ...mappedDirectLines]);
        },
      );
    } catch (error) {
      const failure = asRouteLoadFailure(
        error,
        "This quote could not be loaded.",
      );
      setLoadFailure(failure);
      setWorkOrder(null);
      setShop(null);
      setLines([]);
      if (failure.kind === "unauthenticated") {
        router.replace("/customer/sign-in");
      }
    } finally {
      setLoading(false);
    }
  }, [router, workOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!workOrderId) {
    return (
      <div className="min-h-screen px-4 py-10 text-center text-red-300">
        Missing quote id.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-10 flex items-center justify-center text-[color:var(--theme-text-secondary)]">
        Loading quote...
      </div>
    );
  }

  if (loadFailure || !workOrder) {
    const failure =
      loadFailure ??
      routeLoadFailureFromStatus(404, "This quote is unavailable.");
    return (
      <div className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10">
        <RouteLoadPanel failure={failure} onRetry={() => void load()} />
        <Link
          href="/portal"
          className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-[var(--accent-copper-light)]"
        >
          Back to portal
        </Link>
      </div>
    );
  }

  const titleLabel =
    workOrder.estimate_number ||
    workOrder.custom_id ||
    `Work Order ${workOrder.id.slice(0, 8)}…`;

  const pendingLines = lines.filter((line) => line.approvalState === "pending");
  const approvedLines = lines.filter(
    (line) => line.approvalState === "approved",
  );
  const declinedDeferredLines = lines.filter(
    (line) =>
      line.approvalState === "declined" || line.approvalState === "deferred",
  );
  const pendingSubtotal = pendingLines.reduce(
    (sum, line) => sum + line.totalAmount,
    0,
  );
  const approvedSubtotal = approvedLines.reduce(
    (sum, line) => sum + line.totalAmount,
    0,
  );
  const declinedDeferredSubtotal = declinedDeferredLines.reduce(
    (sum, line) => sum + line.totalAmount,
    0,
  );
  const lineSubtotal = lines.reduce((sum, line) => sum + line.totalAmount, 0);
  const laborSubtotal = lines.reduce((sum, line) => sum + line.laborAmount, 0);
  const partsSubtotal = lines.reduce((sum, line) => sum + line.partsAmount, 0);
  const shopSupplies = calculateShopSupplies({
    baseAmount: laborSubtotal + partsSubtotal,
    settings: resolveShopSuppliesSettings(
      shop as Parameters<typeof resolveShopSuppliesSettings>[0],
    ),
    override: resolveShopSuppliesOverride(
      workOrder as Parameters<typeof resolveShopSuppliesOverride>[0],
    ),
  });
  const subtotal = lineSubtotal + shopSupplies.amount;

  const provinceCode = getShopProvinceCode(shop);
  const taxRes = provinceCode
    ? calculateTax(
        lineSubtotal + shopSuppliesTaxableSubtotal(shopSupplies),
        provinceCode,
      )
    : null;
  const taxAmount = lines.some((line) => line.taxAmount > 0)
    ? lines.reduce((sum, line) => sum + line.taxAmount, 0)
    : taxRes
      ? getTaxAmount(taxRes)
      : 0;
  const grandTotal =
    subtotal + (lines.some((line) => line.taxAmount > 0) ? 0 : taxAmount);
  return (
    <div
      className="
        min-h-screen px-4 text-foreground
        bg-background
        bg-[var(--theme-gradient-panel)]
      "
    >
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center py-10">
        <div
          className="
            w-full rounded-3xl border
            border-[color:var(--metal-border-soft,var(--theme-border-soft))]
            bg-[var(--theme-gradient-panel)]
            shadow-[var(--theme-shadow-medium)]
            px-6 py-7 sm:px-8 sm:py-9
          "
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <Link
              href="/portal"
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-overlay)] hover:text-[color:var(--theme-text-primary)]"
            >
              <span aria-hidden className="text-base leading-none">
                ←
              </span>
              Back
            </Link>

            <div
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]"
              style={{ color: COPPER }}
            >
              Quote
            </div>
          </div>

          {evidenceWarning ? (
            <section
              aria-live="polite"
              className="mb-5 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-amber-100"
              role="status"
            >
              <h2 className="text-sm font-semibold">
                Some evidence is temporarily unavailable
              </h2>
              <p className="mt-1 text-xs text-amber-100/90">
                The quote details and approval actions are still available.
              </p>
              {evidenceWarning.requestId ? (
                <p className="mt-2 text-[0.7rem] text-amber-100/70">
                  Reference:{" "}
                  <span className="font-mono">{evidenceWarning.requestId}</span>
                </p>
              ) : null}
              {evidenceWarning.retryable ? (
                <button
                  type="button"
                  onClick={() => void load()}
                  className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full border border-amber-300/50 bg-[color:var(--theme-surface-inset)] px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-[color:var(--theme-surface-overlay)]"
                >
                  Retry evidence
                </button>
              ) : null}
            </section>
          ) : null}

          <div className="mb-6 space-y-1">
            <h1
              className="text-2xl sm:text-3xl font-semibold text-[color:var(--theme-text-primary)]"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              {titleLabel}
            </h1>
            <p className="text-xs text-[color:var(--theme-text-secondary)] sm:text-sm">
              Review sent recommendations and choose what you want the shop to
              perform. Only approved items become authorized work.
            </p>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Pending authorization
              </div>
              <div className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">
                {formatCurrency(pendingSubtotal)}
              </div>
              <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">
                {pendingLines.length} item(s)
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Approved
              </div>
              <div className="mt-1 text-lg font-semibold text-emerald-100">
                {formatCurrency(approvedSubtotal)}
              </div>
              <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">
                {approvedLines.length} item(s)
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Declined / Deferred
              </div>
              <div className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">
                {formatCurrency(declinedDeferredSubtotal)}
              </div>
              <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">
                {declinedDeferredLines.length} item(s)
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Visible quote total
              </div>
              <div className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">
                {formatCurrency(grandTotal)}
              </div>
              <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">
                Tax: {formatCurrency(taxAmount)}{" "}
                {provinceCode ? `(${provinceCode})` : ""}
              </div>
            </div>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Labor total
              </div>
              <div className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">
                {formatCurrency(laborSubtotal)}
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Parts total
              </div>
              <div className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">
                {formatCurrency(partsSubtotal)}
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Shop supplies
              </div>
              <div className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">
                {formatCurrency(shopSupplies.amount)}
              </div>
              <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">
                {shopSuppliesSummaryText(shopSupplies)}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {lines.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-6 text-sm text-[color:var(--theme-text-secondary)]">
                No customer-visible quote lines are available yet.
              </div>
            ) : (
              lines.map((line) => (
                <div
                  key={line.id}
                  className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
                        Recommendation
                      </div>
                      <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                        {line.lineNo ? `#${line.lineNo} • ` : ""}
                        {line.title}
                      </div>
                      {line.complaint ? (
                        <div className="mt-1 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1.5 text-xs text-[color:var(--theme-text-secondary)]">
                          <span className="text-[color:var(--theme-text-muted)]">
                            Issue observed:
                          </span>{" "}
                          {line.complaint}
                        </div>
                      ) : null}
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                        {formatCurrency(line.totalAmount)}
                      </div>
                      <div className="mt-1 flex justify-end">
                        <StatusBadge
                          variant={
                            formatDecisionStatus({
                              approvalState:
                                line.approvalState === "deferred"
                                  ? "pending"
                                  : line.approvalState,
                              workStatus: line.status,
                            }).variant
                          }
                        >
                          {line.approvalState === "deferred"
                            ? "Deferred"
                            : formatDecisionStatus({
                                approvalState: line.approvalState,
                                workStatus: line.status,
                              }).label}
                        </StatusBadge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {line.cause ? (
                      <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                          Cause
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                          {line.cause}
                        </div>
                      </div>
                    ) : null}
                    {line.correction ? (
                      <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                          Correction
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                          {line.correction}
                        </div>
                      </div>
                    ) : null}
                    {line.notes ? (
                      <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 sm:col-span-2">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                          Advisor / technician notes
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                          {line.notes}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                      Repair evidence
                    </div>
                    {line.evidence.length > 0 ? (
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {line.evidence.map((item, idx) =>
                          isVideoEvidence(item) && item.displayUrl ? (
                            <div
                              key={item.id}
                              className="overflow-hidden rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"
                            >
                              <video
                                src={item.displayUrl}
                                controls
                                preload="metadata"
                                className="h-24 w-full object-cover"
                              />
                            </div>
                          ) : (
                            <a
                              key={item.id}
                              href={item.displayUrl ?? "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="overflow-hidden rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"
                            >
                              <EvidenceImage
                                item={item}
                                alt={`Evidence ${idx + 1}`}
                                className="h-24 [&_img]:h-full [&_img]:object-cover"
                              />
                            </a>
                          ),
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">
                        No customer-visible evidence attached.
                      </div>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                        Labor
                      </div>
                      <div className="mt-1 text-sm font-medium text-[color:var(--theme-text-primary)]">
                        {formatCurrency(line.laborAmount)}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                        {line.laborHours.toFixed(1)} hr
                      </div>
                    </div>

                    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                        Parts
                      </div>
                      <div className="mt-1 text-sm font-medium text-[color:var(--theme-text-primary)]">
                        {formatCurrency(line.partsAmount)}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                        {line.parts.length} item(s)
                      </div>
                    </div>

                    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                        Tax
                      </div>
                      <div className="mt-1 text-sm font-medium text-[color:var(--theme-text-primary)]">
                        {formatCurrency(line.taxAmount)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                        Decision total
                      </div>
                      <div className="mt-1 text-sm font-medium text-[color:var(--theme-text-primary)]">
                        {formatCurrency(line.totalAmount)}
                      </div>
                    </div>
                  </div>

                  {line.parts.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                        Parts breakdown
                      </div>
                      {line.parts.map((part, idx) => (
                        <div
                          key={`${line.id}-${idx}`}
                          className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-[color:var(--theme-text-primary)]">
                                {part.name}
                              </div>
                              {part.meta ? (
                                <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                                  {part.meta}
                                </div>
                              ) : null}
                              <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                                Qty {part.qty} ×{" "}
                                {part.pricingUnavailable
                                  ? "Pricing unavailable"
                                  : formatCurrency(part.unitPrice)}
                              </div>
                            </div>
                            <div className="text-sm font-medium text-[color:var(--theme-text-primary)]">
                              {part.pricingUnavailable
                                ? "—"
                                : formatCurrency(part.total)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-2 text-[11px] text-[color:var(--theme-text-muted)] sm:grid-cols-3">
                    <div>Status: {line.status || "—"}</div>
                    <div>Stage: {line.stage || "—"}</div>
                    <div>Sent: {formatDate(line.sentAt)}</div>
                    {line.approvedAt ? (
                      <div>Approved: {formatDate(line.approvedAt)}</div>
                    ) : null}
                    {line.declinedAt ? (
                      <div>Declined: {formatDate(line.declinedAt)}</div>
                    ) : null}
                    {line.convertedWorkOrderLineId ? (
                      <div>Authorized work created</div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>

          <QuoteApprovalActions
            workOrderId={workOrder.id}
            lines={lines.map((line) => ({
              id: line.id,
              source: line.source,
              description: line.title,
              approval_state: line.approvalState,
              status: line.status,
            }))}
            onChanged={() => {
              void load();
            }}
          />

          {approvedLines.some((line) => line.requestKind === "repair") ? (
            <div className="mt-6 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
              <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                Ready to schedule the approved repair?
              </div>
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                Choose a time without creating another quote or work order.
              </p>
              <Link
                href={`/portal/request/when?quote=${encodeURIComponent(approvedLines.find((line) => line.requestKind === "repair")?.id ?? "")}`}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)]"
              >
                Book appointment for this quote
              </Link>
            </div>
          ) : null}

          {approvedLines.some((line) => line.requestKind === "parts_only") ? (
            <div className="mt-6 space-y-3">
              <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
                <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  Parts pickup approved
                </div>
                <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                  Parts can now order or reserve the approved items. The shop
                  will send the invoice when the pickup order is ready for
                  payment.
                </p>
              </div>
              {workOrder.invoice_sent_at && shop?.id ? (
                <PortalInvoicePayButton
                  shopId={shop.id}
                  workOrderId={workOrder.id}
                  amountCents={Math.max(0, Math.round(grandTotal * 100))}
                  currency="cad"
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
