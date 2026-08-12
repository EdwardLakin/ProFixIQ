// features/work-orders/quote-review/QuoteReviewView.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { toast } from "sonner";
import type { Database, Json } from "@shared/types/types/supabase";

import AddJobModal from "@/features/work-orders/components/workorders/AddJobModal";
import { formatCurrency } from "@/features/shared/lib/formatCurrency";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";
import {
  calculateShopSupplies,
  resolveShopSuppliesOverride,
  resolveShopSuppliesSettings,
  shopSuppliesSummaryText,
} from "@/features/work-orders/lib/shopSupplies";
import {
  quoteLinePartsDisplayTotal,
  quoteLinePartsPricingSanitization,
  quoteLineTotalResolved,
  resolveQuoteLineParts,
  type CatalogPart,
  type PartRequest,
  type PartRequestItem,
  type ResolvedQuotePart,
} from "./partsModel";
import { useTabs } from "@/features/shared/components/tabs/TabsProvider";
import { PricingQuarantineRemediation } from "./PricingQuarantineRemediation";

const COPPER = "#C57A4A";
const SEND_READY_STAGES = new Set(["advisor_pending", "ready_to_send"]);
const SEND_READY_STATUSES = new Set(["advisor_pending", "ready_to_send", "quoted"]);
const NON_SENDABLE_STATUSES = new Set([
  "pending_parts",
  "sent",
  "approved",
  "declined",
  "deferred",
  "converted",
  "rejected",
  "cancelled",
]);

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Shop = DB["public"]["Tables"]["shops"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type QuoteLineUpdate = DB["public"]["Tables"]["work_order_quote_lines"]["Update"];
type PartsByQuoteLine = Record<string, ResolvedQuotePart[]>;
type RequestByQuoteLine = Record<string, PartRequest[]>;
type QuoteDecision = "approve" | "decline" | "defer";
type ContactMethod = "phone" | "in_person" | "email" | "other";
type HistoryInsight = { quoteLineId: string; historyLineId: string; workOrderId: string; workOrderNumber: string | null; description: string; completedAt: string; mileageDeltaKm: number | null; ageDays: number; reason: string };

type EditableQuoteLine = QuoteLine & {
  _dirty?: boolean;
  _laborRateDraft?: number | null;
};

type QuoteMetadata = {
  source?: Json;
  source_inspection_id?: Json;
  source_section_title?: Json;
  source_section_key?: Json;
  source_item_key?: Json;
  source_finding_title?: Json;
  photo_urls?: Json;
  evidence_urls?: Json;
  parts?: Json;
  parts_quote?: Json;
  labor_rate?: Json;
  customer_pricing?: Json;
  customer_pricing_v2?: Json;
  technician_notes?: Json;
  tech_notes?: Json;
};

const card = ui.panel;
const divider = "border-[color:var(--desktop-border)]";
const inputBase =
  "mt-1 w-full desktop-input px-2.5 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none";
const inputFocus =
  "focus:border-[color:var(--brand-accent,#E39A6E)]/60 focus:ring-2 focus:ring-[color:var(--brand-accent,#E39A6E)]/15";
const inputCls = `${inputBase} ${inputFocus}`;

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fmt(value: number | null | undefined): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  try {
    return formatCurrency(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function statusLabel(value: string | null | undefined): string {
  return safeTrim(value).replaceAll("_", " ") || "â€”";
}

function isFinalDecision(line: EditableQuoteLine): boolean {
  const status = safeTrim(line.status).toLowerCase();
  return Boolean(line.work_order_line_id) || ["approved", "converted", "declined", "deferred"].includes(status);
}

function historyDistanceLabel(insight: HistoryInsight): string {
  if (insight.mileageDeltaKm != null) return `${Math.round(insight.mileageDeltaKm).toLocaleString()} km ago`;
  if (insight.ageDays < 45) return `${insight.ageDays} days ago`;
  if (insight.ageDays < 730) return `${Math.max(1, Math.round(insight.ageDays / 30))} months ago`;
  return `${Math.max(1, Math.round(insight.ageDays / 365))} years ago`;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function customerDisplayName(customer: Customer | null): string {
  if (!customer) return "â€”";
  const full = safeTrim((customer as unknown as { full_name?: unknown }).full_name);
  const first = safeTrim(customer.first_name);
  const last = safeTrim(customer.last_name);
  return full || safeTrim(customer.business_name) || [first, last].filter(Boolean).join(" ") || "â€”";
}

function normalizePhoneForTel(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, "");
  return /\d/.test(cleaned) ? cleaned : null;
}

function quoteMetadata(line: Pick<QuoteLine, "metadata">): QuoteMetadata {
  if (!line.metadata || typeof line.metadata !== "object" || Array.isArray(line.metadata)) {
    return {};
  }
  return line.metadata as QuoteMetadata;
}

function jsonString(value: Json | undefined): string {
  return typeof value === "string" ? value : "";
}

function jsonNumber(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function jsonMoney(value: Json | undefined): number | null {
  const number = jsonNumber(value);
  return number != null && number >= 0 ? number : null;
}

function jsonStringArray(value: Json | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => safeTrim(item)).filter(Boolean).slice(0, 6);
}

function quoteLineLaborRate(line: EditableQuoteLine, shopLaborRate: number): number {
  return line._laborRateDraft ?? jsonNumber(quoteMetadata(line).labor_rate) ?? shopLaborRate;
}

function quoteLineLaborHours(line: Pick<QuoteLine, "labor_hours" | "est_labor_hours">): number {
  return asNumber(line.labor_hours) ?? asNumber(line.est_labor_hours) ?? 0;
}

function quoteLineLaborTotal(line: EditableQuoteLine, shopLaborRate: number): number {
  const explicit = asNumber(line.labor_total);
  if (explicit != null) return explicit;
  return quoteLineLaborHours(line) * quoteLineLaborRate(line, shopLaborRate);
}

function quoteLinePartsTotal(
  line: Pick<QuoteLine, "parts_total" | "metadata">,
): number | null {
  const parts = quoteMetadata(line).parts;
  const fallbackPartsTotal = Array.isArray(parts)
    ? parts.reduce<number>((sum, part) => {
        if (!part || typeof part !== "object" || Array.isArray(part)) return sum;
        const p = part as Record<string, Json>;
        const qty = jsonNumber(p.qty) ?? 1;
        const unit =
          jsonMoney(p.unitSellPrice) ??
          jsonMoney(p.unit_sell_price) ??
          jsonMoney(p.unitPrice) ??
          jsonMoney(p.unit_price) ??
          jsonMoney(p.price) ??
          0;
        return sum + qty * unit;
      }, 0)
    : 0;

  return quoteLinePartsDisplayTotal({ line, fallbackPartsTotal });
}

function quoteLineTotal(line: EditableQuoteLine, shopLaborRate: number): number {
  return quoteLineTotalResolved({
    persistedGrandTotal: line.grand_total,
    persistedSubtotal: line.subtotal,
    calculatedLabor: quoteLineLaborTotal(line, shopLaborRate),
    calculatedParts: quoteLinePartsTotal(line) ?? 0,
  });
}

function hasPartsPrice(line: Pick<QuoteLine, "parts_total" | "metadata">): boolean {
  if (quoteLinePartsPricingSanitization(line).customerPricingQuarantined) {
    return false;
  }
  const summary = partsQuoteSummary(line);
  if (summary) {
    if (summary.requiredCount === 0) return true;
    return summary.pendingCount === 0 && summary.quotedCount >= summary.requiredCount;
  }

  const parts = quoteMetadata(line).parts;
  if (!Array.isArray(parts) || parts.length === 0) return true;
  return parts.every((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return false;
    const p = part as Record<string, Json>;
    return (
      jsonMoney(p.unitSellPrice) != null ||
      jsonMoney(p.unit_sell_price) != null ||
      jsonMoney(p.unitPrice) != null ||
      jsonMoney(p.unit_price) != null ||
      jsonMoney(p.price) != null
    );
  });
}


function partsQuoteSummary(line: Pick<QuoteLine, "metadata">): {
  requiredCount: number;
  quotedCount: number;
  pendingCount: number;
  partsTotal: number | null;
  customerPricingQuarantined: boolean;
  manualReviewRequired: boolean;
} | null {
  const partsQuote = quoteMetadata(line).parts_quote;
  if (!partsQuote || typeof partsQuote !== "object" || Array.isArray(partsQuote)) return null;
  const record = partsQuote as Record<string, Json>;
  const sanitization = quoteLinePartsPricingSanitization(line);
  return {
    requiredCount: jsonNumber(record.required_count) ?? 0,
    quotedCount: jsonNumber(record.quoted_count) ?? 0,
    pendingCount: jsonNumber(record.pending_count) ?? 0,
    partsTotal: jsonNumber(record.parts_total),
    ...sanitization,
  };
}

function customerPricingSummary(line: Pick<QuoteLine, "metadata">): {
  sourceType: string;
  agreementName: string | null;
  baseLaborRate: number | null;
  resolvedLaborRate: number | null;
  laborDiscountPercent: number;
  partsDiscountPercent: number;
  matrixTierCount: number;
  minimumPartsMarginPercent: number;
  marginFloorAdjustmentTotal: number;
} | null {
  const value = quoteMetadata(line).customer_pricing;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, Json>;
  const sourceType = jsonString(record.source_type);
  if (!sourceType || sourceType === "shop_default") return null;
  const v2Value = quoteMetadata(line).customer_pricing_v2;
  const v2 =
    v2Value && typeof v2Value === "object" && !Array.isArray(v2Value)
      ? (v2Value as Record<string, Json>)
      : null;
  const matrix = v2?.parts_matrix;
  return {
    sourceType,
    agreementName: jsonString(record.agreement_name) || null,
    baseLaborRate: jsonNumber(record.base_labor_rate),
    resolvedLaborRate: jsonNumber(record.resolved_labor_rate),
    laborDiscountPercent: jsonNumber(record.labor_discount_percent) ?? 0,
    partsDiscountPercent: jsonNumber(record.parts_discount_percent) ?? 0,
    matrixTierCount: Array.isArray(matrix) ? matrix.length : 0,
    minimumPartsMarginPercent:
      jsonNumber(v2?.minimum_parts_margin_percent) ?? 0,
    marginFloorAdjustmentTotal:
      jsonNumber(v2?.margin_floor_adjustment_total) ?? 0,
  };
}

function customerPricingLabel(summary: NonNullable<ReturnType<typeof customerPricingSummary>>): string {
  const source = summary.sourceType.replaceAll("_", " ");
  const terms = [
    summary.resolvedLaborRate != null &&
    summary.baseLaborRate != null &&
    summary.resolvedLaborRate !== summary.baseLaborRate
      ? `labor ${fmt(summary.resolvedLaborRate)}/hr`
      : summary.laborDiscountPercent > 0
        ? `${summary.laborDiscountPercent}% labor`
        : null,
    summary.partsDiscountPercent > 0
      ? `${summary.partsDiscountPercent}% parts`
      : null,
    summary.matrixTierCount > 0
      ? `${summary.matrixTierCount}-tier matrix`
      : null,
    summary.minimumPartsMarginPercent > 0
      ? `${summary.minimumPartsMarginPercent}% margin floor${summary.marginFloorAdjustmentTotal > 0 ? ` (+${fmt(summary.marginFloorAdjustmentTotal)} protected)` : ""}`
      : null,
  ].filter(Boolean);
  return `${summary.agreementName || source}${terms.length > 0 ? ` Â· ${terms.join(" Â· ")}` : ""}`;
}

function partsWorkflowLabel(line: EditableQuoteLine): { label: string; tone: "warn" | "ok" | "info" } | null {
  const summary = partsQuoteSummary(line);
  const status = safeTrim(line.status).toLowerCase();
  const stage = safeTrim(line.stage).toLowerCase();

  if (summary) {
    if (summary.customerPricingQuarantined) {
      return { label: "Manual parts review", tone: "warn" };
    }
    if (summary.pendingCount > 0 || status === "pending_parts") {
      return { label: `Parts pending (${summary.quotedCount}/${summary.requiredCount})`, tone: "warn" };
    }
    if (summary.requiredCount > 0 && (status === "quoted" || status === "ready_to_send" || stage === "ready_to_send")) {
      return { label: `Parts quoted (${summary.quotedCount}/${summary.requiredCount})`, tone: "ok" };
    }
    return { label: `Parts tracked (${summary.quotedCount}/${summary.requiredCount})`, tone: "info" };
  }

  if (status === "pending_parts") return { label: "Parts pending", tone: "warn" };
  if (status === "quoted" || status === "ready_to_send" || stage === "ready_to_send") return { label: "Ready to send", tone: "ok" };
  return null;
}

function recommendedWorkflow(line: EditableQuoteLine, shopLaborRate: number): Pick<QuoteLineUpdate, "status" | "stage"> {
  if (!hasPartsPrice(line)) return { status: "pending_parts", stage: "advisor_pending" };
  const total = quoteLineTotal(line, shopLaborRate);
  const hours = quoteLineLaborHours(line);
  const hasLaborOrAmount = total > 0 || hours > 0 || asNumber(line.labor_total) != null;
  return hasLaborOrAmount
    ? { status: "quoted", stage: "ready_to_send" }
    : { status: "quoted", stage: "advisor_pending" };
}

function workflowDisplay(line: EditableQuoteLine): {
  label: string;
  detail: string;
  tone: "bad" | "warn" | "ok" | "info" | "neutral";
} {
  const status = safeTrim(line.status).toLowerCase();
  const stage = safeTrim(line.stage).toLowerCase();

  if (status === "converted" || line.work_order_line_id) {
    return { label: "Converted / punchable", detail: "Approved quote line is linked to active work.", tone: "ok" };
  }
  if (status === "approved" || line.approved_at) {
    return { label: "Approved", detail: "Customer approval is recorded; materialization is Phase 5C.", tone: "ok" };
  }
  if (status === "declined" || line.declined_at) {
    return { label: "Declined", detail: "Customer/advisor declined this quote line.", tone: "bad" };
  }
  if (status === "deferred") {
    return { label: "Deferred", detail: "Deferred for later follow-up.", tone: "neutral" };
  }
  if (status === "sent" || line.sent_to_customer_at) {
    return { label: "Sent to customer", detail: "Waiting for customer portal decision.", tone: "info" };
  }
  if (quoteLinePartsPricingSanitization(line).customerPricingQuarantined) {
    return {
      label: "Manual pricing review",
      detail:
        "Protected finalized pricing is quarantined; current Parts Request pricing is not the customer decision.",
      tone: "warn",
    };
  }
  if (status === "pending_parts") {
    return { label: "Pending parts quote", detail: "Parts pricing is not ready; blocked from sending.", tone: "warn" };
  }
  if (stage === "ready_to_send" || status === "ready_to_send" || status === "quoted") {
    return { label: "Ready to send", detail: "Advisor-reviewed pricing can be sent to the customer.", tone: "ok" };
  }
  return { label: "Advisor review", detail: "Advisor can review pricing, notes, and customer-facing text.", tone: "info" };
}

function badgeClass(tone: ReturnType<typeof workflowDisplay>["tone"]): string {
  switch (tone) {
    case "ok":
      return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
    case "bad":
      return "border-red-400/40 bg-red-500/10 text-red-100";
    case "warn":
      return "border-amber-300/45 bg-amber-400/10 text-amber-100";
    case "info":
      return "border-sky-300/40 bg-sky-400/10 text-sky-100";
    default:
      return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-primary)]";
  }
}

function isSentForDecision(line: EditableQuoteLine): boolean {
  const status = safeTrim(line.status).toLowerCase();
  const stage = safeTrim(line.stage).toLowerCase();
  return (
    Boolean(line.sent_to_customer_at) ||
    status === "sent" ||
    status === "customer_pending" ||
    stage === "sent" ||
    stage === "customer_pending"
  );
}

function canSendLine(line: EditableQuoteLine): boolean {
  const status = safeTrim(line.status).toLowerCase();
  const stage = safeTrim(line.stage).toLowerCase();
  if (quoteLinePartsPricingSanitization(line).customerPricingQuarantined) return false;
  if (NON_SENDABLE_STATUSES.has(status)) return false;
  if (isSentForDecision(line)) return false;
  return SEND_READY_STATUSES.has(status) || SEND_READY_STAGES.has(stage);
}

function activeWorkLine(line: WorkOrderLine): boolean {
  const approval = safeTrim(line.approval_state).toLowerCase();
  const status = safeTrim(line.status).toLowerCase();
  return Boolean(line.punchable) || approval === "approved" || status === "approved";
}

function sourceSummary(line: Pick<QuoteLine, "metadata" | "suggested_by">): string[] {
  const meta = quoteMetadata(line);
  const values = [
    jsonString(meta.source) || "inspection",
    jsonString(meta.source_section_title) || jsonString(meta.source_section_key),
    jsonString(meta.source_item_key),
    jsonString(meta.source_finding_title),
  ].filter(Boolean);
  if (line.suggested_by) values.push(`suggested by ${line.suggested_by.slice(0, 8)}`);
  return values;
}

function partsRequestLabel(line: Pick<QuoteLine, "description">, index: number): string {
  const description = safeTrim(line.description);
  return description ? `Request for ${description}` : `Parts request for quote line ${index + 1}`;
}

function partCostLabel(part: ResolvedQuotePart): string {
  return part.unitCost == null ? "Cost unresolved" : `Cost: ${fmt(part.unitCost)}`;
}

function partSellLabel(part: ResolvedQuotePart): string {
  if (part.unitSellPrice == null) return "Sell unresolved";
  return part.sellPriceIsSuggestion
    ? `Sell suggestion: ${fmt(part.unitSellPrice)}`
    : `Sell: ${fmt(part.unitSellPrice)}`;
}

function selectedPartLabel(part: ResolvedQuotePart): string | null {
  const identity = [part.selectedPartName, part.selectedPartNumber].filter(Boolean).join(" â€¢ ");
  return identity || null;
}

export default function QuoteReviewView(props: {
  workOrderId: string;
  embedded?: boolean;
}): JSX.Element {
  const router = useRouter();
  const woId = String(props.workOrderId ?? "").trim();
  const embedded = Boolean(props.embedded);
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const { updateActiveTab } = useTabs();

  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const loadedOnceRef = useRef(false);
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [quoteLines, setQuoteLines] = useState<EditableQuoteLine[]>([]);
  const [partsByQuoteLine, setPartsByQuoteLine] = useState<PartsByQuoteLine>({});
  const [requestsByQuoteLine, setRequestsByQuoteLine] = useState<RequestByQuoteLine>({});
  const [workLines, setWorkLines] = useState<WorkOrderLine[]>([]);
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
  const [openParts, setOpenParts] = useState<Record<string, boolean>>({});
  const [historyInsights, setHistoryInsights] = useState<Record<string, HistoryInsight>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [decisionDialog, setDecisionDialog] = useState<{ line: EditableQuoteLine; decision: QuoteDecision } | null>(null);
  const [decisionContact, setDecisionContact] = useState<ContactMethod>("phone");
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingCustomerEmail, setSavingCustomerEmail] = useState(false);
  const [pendingCustomerEmail, setPendingCustomerEmail] = useState("");
  const [sendBlocker, setSendBlocker] = useState<string | null>(null);
  const [addJobOpen, setAddJobOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("system");
  const [suppliesEnabledDraft, setSuppliesEnabledDraft] = useState<boolean | null>(null);
  const [suppliesAmountDraft, setSuppliesAmountDraft] = useState("");
  const [savingSuppliesOverride, setSavingSuppliesOverride] = useState(false);

  useEffect(() => {
    if (embedded || !wo) return;
    const customerName = customerDisplayName(customer);
    const workOrderLabel =
      safeTrim(wo.custom_id) || `WO-${wo.id.slice(0, 8)}`;
    updateActiveTab({
      title:
        customerName && customerName !== "â€”"
          ? `${workOrderLabel} Â· ${customerName}`
          : workOrderLabel,
      subtitle: "Quote review",
      status: "Quote review",
      dirty: quoteLines.some((line) => line._dirty),
    });
  }, [customer, embedded, quoteLines, updateActiveTab, wo]);

  const laborRate = useMemo(() => asNumber((shop as unknown as { labor_rate?: unknown } | null)?.labor_rate) ?? 120, [shop]);

  const loadHistoryInsights = useCallback(async () => {
    if (!woId) return;
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/work-orders/${woId}/quote-history-insights`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { insights?: HistoryInsight[] } | null;
      if (!response.ok) return;
      setHistoryInsights(Object.fromEntries((payload?.insights ?? []).map((insight) => [insight.quoteLineId, insight])));
    } finally {
      setHistoryLoading(false);
    }
  }, [woId]);

  const reload = useCallback(async () => {
    if (!woId) return;
    setLoading(true);

    const { data: woRow, error: woErr } = await supabase
      .from("work_orders")
      .select("*")
      .eq("id", woId)
      .maybeSingle();

    if (woErr) {
      toast.error(woErr.message);
      if (!loadedOnceRef.current) {
        setWo(null);
        setShop(null);
        setCustomer(null);
        setQuoteLines([]);
        setPartsByQuoteLine({});
        setRequestsByQuoteLine({});
        setWorkLines([]);
      }
      setLoading(false);
      return;
    }

    setWo(woRow ?? null);
    const loadedSuppliesEnabled = (woRow as { shop_supplies_enabled_override?: unknown } | null)?.shop_supplies_enabled_override;
    setSuppliesEnabledDraft(typeof loadedSuppliesEnabled === "boolean" ? loadedSuppliesEnabled : null);
    const loadedSuppliesAmount = (woRow as { shop_supplies_amount_override?: unknown } | null)?.shop_supplies_amount_override;
    setSuppliesAmountDraft(typeof loadedSuppliesAmount === "number" ? String(loadedSuppliesAmount) : "");
    const shopId = woRow?.shop_id ?? null;

    if (shopId) {
      const pricingResponse = await fetch(
        `/api/work-orders/${woId}/customer-pricing`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteLineIds: [] }),
        },
      );
      if (!pricingResponse.ok && pricingResponse.status !== 403) {
        const pricingPayload = (await pricingResponse
          .json()
          .catch(() => null)) as { error?: string } | null;
        toast.error(
          pricingPayload?.error ?? "Customer pricing could not be resolved.",
        );
      }

      const [{ data: shopRow, error: shopErr }, { data: qRows, error: qErr }, { data: wlRows, error: wlErr }] = await Promise.all([
        supabase.from("shops").select("*").eq("id", shopId).maybeSingle(),
        supabase
          .from("work_order_quote_lines")
          .select("*")
          .eq("shop_id", shopId)
          .eq("work_order_id", woId)
          .order("created_at", { ascending: true }),
        supabase
          .from("work_order_lines")
          .select("*")
          .eq("shop_id", shopId)
          .eq("work_order_id", woId)
          .order("line_no", { ascending: true }),
      ]);

      if (shopErr) toast.error(shopErr.message);
      if (qErr) toast.error(qErr.message);
      if (wlErr) toast.error(wlErr.message);
      setShop(shopRow ?? null);
      const loadedQuoteLines = ((qRows ?? []) as QuoteLine[]).map((line) => ({ ...line, _dirty: false, _laborRateDraft: jsonNumber(quoteMetadata(line).labor_rate) }));
      const quoteLineIds = loadedQuoteLines.map((line) => line.id).filter(Boolean);
      let liveRequests: PartRequest[] = [];
      let liveItems: PartRequestItem[] = [];
      let selectedParts = new Map<string, CatalogPart>();

      if (quoteLineIds.length > 0) {
        const [{ data: requestRows, error: requestErr }, { data: itemRows, error: itemErr }] = await Promise.all([
          supabase
            .from("part_requests")
            .select("*")
            .eq("shop_id", shopId)
            .eq("work_order_id", woId)
            .in("quote_line_id", quoteLineIds),
          supabase
            .from("part_request_items")
            .select("*")
            .eq("shop_id", shopId)
            .eq("work_order_id", woId)
            .in("quote_line_id", quoteLineIds)
            .order("created_at", { ascending: true }),
        ]);
        if (requestErr) toast.error(requestErr.message);
        if (itemErr) toast.error(itemErr.message);
        liveRequests = (requestRows ?? []) as PartRequest[];
        liveItems = (itemRows ?? []) as PartRequestItem[];

        const selectedPartIds = [...new Set(liveItems.map((item) => safeTrim(item.part_id ?? "")).filter(Boolean))];
        if (selectedPartIds.length > 0) {
          const { data: partRows, error: partErr } = await supabase
            .from("parts")
            .select("id,name,sku,part_number,supplier,cost,default_cost,price,default_price")
            .eq("shop_id", shopId)
            .in("id", selectedPartIds);
          if (partErr) toast.error(partErr.message);
          selectedParts = new Map(((partRows ?? []) as CatalogPart[]).map((part) => [part.id, part]));
        }
      }

      const nextPartsByLine: PartsByQuoteLine = {};
      const nextRequestsByLine: RequestByQuoteLine = {};
      for (const line of loadedQuoteLines) {
        nextPartsByLine[line.id] = resolveQuoteLineParts({ line, liveItems, requests: liveRequests, selectedParts });
        nextRequestsByLine[line.id] = liveRequests.filter((request) => request.quote_line_id === line.id);
      }

      setQuoteLines(loadedQuoteLines);
      setPartsByQuoteLine(nextPartsByLine);
      setRequestsByQuoteLine(nextRequestsByLine);
      setWorkLines(((wlRows ?? []) as WorkOrderLine[]).filter(activeWorkLine));
    } else {
      setShop(null);
      setQuoteLines([]);
      setPartsByQuoteLine({});
      setRequestsByQuoteLine({});
      setWorkLines([]);
    }

    if (woRow?.customer_id) {
      const { data: custRow, error: custErr } = await supabase
        .from("customers")
        .select("*")
        .eq("id", woRow.customer_id)
        .maybeSingle();
      if (custErr) {
        toast.error(custErr.message);
        setCustomer(null);
        setPendingCustomerEmail("");
      } else {
        setCustomer((custRow as Customer | null) ?? null);
        setPendingCustomerEmail(safeTrim(custRow?.email ?? ""));
      }
    } else {
      setCustomer(null);
      setPendingCustomerEmail("");
    }

    setLoading(false);
    loadedOnceRef.current = true;
    setLoadedOnce(true);
    void loadHistoryInsights();
  }, [loadHistoryInsights, supabase, woId]);

  useEffect(() => {
    loadedOnceRef.current = false;
    setLoadedOnce(false);
    void reload();
  }, [reload]);

  useEffect(() => {
    let alive = true;
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      if (alive) setCurrentUserId(data.user?.id ?? "system");
    }
    void loadUser();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const quoteTotals = useMemo(() => {
    const labor = quoteLines.reduce((sum, line) => sum + quoteLineLaborTotal(line, laborRate), 0);
    const partTotals = quoteLines.map((line) => quoteLinePartsTotal(line));
    const parts = partTotals.reduce<number>((sum, total) => sum + (total ?? 0), 0);
    const partsTotalUnavailable = partTotals.some((total) => total == null);
    const grandTotalUnavailable = quoteLines.some(
      (line, index) =>
        partTotals[index] == null &&
        asNumber(line.grand_total) == null &&
        asNumber(line.subtotal) == null,
    );
    const partsPricingQuarantined = quoteLines.some(
      (line) =>
        quoteLinePartsPricingSanitization(line).customerPricingQuarantined,
    );
    const linesTotal = quoteLines.reduce((sum, line) => sum + quoteLineTotal(line, laborRate), 0);
    const baseSubtotal = labor + parts;
    const persistedOverride = resolveShopSuppliesOverride(wo as Parameters<typeof resolveShopSuppliesOverride>[0]);
    const draftOverride = {
      enabled: suppliesEnabledDraft,
      amount: suppliesAmountDraft.trim() ? asNumber(suppliesAmountDraft) : persistedOverride.amount,
    };
    const shopSupplies = calculateShopSupplies({
      baseAmount: baseSubtotal,
      settings: resolveShopSuppliesSettings(shop as Parameters<typeof resolveShopSuppliesSettings>[0]),
      override: draftOverride,
    });
    const total = linesTotal + shopSupplies.amount;
    const sendable = quoteLines.filter(canSendLine).length;
    const pendingParts = quoteLines.filter((line) => safeTrim(line.status).toLowerCase() === "pending_parts").length;
    const sent = quoteLines.filter((line) => safeTrim(line.status).toLowerCase() === "sent" || Boolean(line.sent_to_customer_at)).length;
    return {
      labor,
      parts,
      partsTotalUnavailable,
      grandTotalUnavailable,
      partsPricingQuarantined,
      linesTotal,
      shopSupplies,
      total,
      sendable,
      pendingParts,
      sent,
    };
  }, [laborRate, quoteLines, shop, suppliesAmountDraft, suppliesEnabledDraft, wo]);

  const customerEmail = safeTrim(customer?.email ?? "");
  const customerPhone = safeTrim(customer?.phone ?? "");
  const tel = normalizePhoneForTel(customerPhone);
  const missingCustomerEmail = !customerEmail;

  function patchQuoteLine(lineId: string, patch: Partial<EditableQuoteLine>) {
    setQuoteLines((prev) =>
      prev.map((line) => (line.id === lineId ? { ...line, ...patch, _dirty: true } : line)),
    );
  }

  function patchQuoteLineMetadata(line: EditableQuoteLine, patch: Record<string, Json | undefined>) {
    const current = quoteMetadata(line) as Record<string, Json | undefined>;
    patchQuoteLine(line.id, { metadata: { ...current, ...patch } as Json });
  }

  function markRecommendedReady(line: EditableQuoteLine) {
    const next = recommendedWorkflow(line, laborRate);
    patchQuoteLine(line.id, next);
  }

  async function saveAllDirty(): Promise<boolean> {
    if (!wo?.shop_id || saving) return false;
    const dirty = quoteLines.filter((line) => line._dirty);
    if (dirty.length === 0) {
      toast.message("No changes to save.");
      return true;
    }

    setSaving(true);
    try {
      for (const line of dirty) {
        const laborHoó­»¶‰Ëkºwµç[ÜÜ[ˆˆ[BˆÜ\œİ\Y\ˆÏÈ\™[™ÜˆÈÜ[”İ\Y\ˆÜ[ˆÛ\ÜÓ˜[YOH^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHÜ\œİ\Y\ˆÏÈ\™[™ÜŸOÜÜ[ÜÜ[ˆˆ[BˆÜšXÚ[™Ô]X\˜[[™YÈ
ˆÜ[ˆÛ\ÜÓ˜[YOH™›Û\Ù[ZX›Û^X[X™\‹LLİ\œ™[Ü\˜][Û˜[šXÚ[™ÈY[ˆ8 %]\È›İHš[˜[^™Yİ\İÛY\ˆXÚ\Ú[Û‹ÜÜ[‚ˆ
Hˆ
ˆ‚ˆÜ[Ü\ÛÜİX™[
\
_OÜÜ[‚ˆÜ[Ü\Ù[X™[
\
_OÜÜ[‚ˆÜ\˜ÛÜİ[™Uİ[OH[ÈÜ[ÛÜİ[™NˆÜ[ˆÛ\ÜÓ˜[YOH^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHÙ›]
\˜ÛÜİ[™Uİ[
_OÜÜ[ÜÜ[ˆˆ[BˆÜ\œÙ[[™Uİ[OH[ÈÜ[”Ù[[™NˆÜ[ˆÛ\ÜÓ˜[YOH^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHÙ›]
\œÙ[[™Uİ[
_OÜÜ[ÜÜ[ˆˆ[BˆÏ‚ˆ
_BˆÜ\œİ]\ÈÈÜ[”İ]\ÎˆÜ[ˆÛ\ÜÓ˜[YOH^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHÜİ]\ÓX™[
\œİ]\Ê_OÜÜ[ÜÜ[ˆˆ[BˆÙ]‚ˆÜ™\]Y\İÈ
ˆH™Y^ØÜ\ËÜ™\]Y\İËÉÜ™\]Y\İšYXHÛ\ÜÓ˜[YOH›]Lˆ[›[™KY›^›İ[™Y[È›Ü™\ˆ›Ü™\‹\ÚŞKLÌÌÍH™Ë\ÚŞKMÌLL‹HKLKH^^È›Û\Ù[ZX›Û^\ÚŞKLLİ™\˜™Ë\ÚŞKMÌMH‚ˆšY]È\È™\]Y\İ8 %Ü\Ô™\]Y\İX™[
[™K[™^
_BˆØO‚ˆ
Hˆ[BˆÙ]‚ˆ
NÂˆJ_BˆÙ]‚ˆ
Hˆ
ˆ]ˆÛ\ÜÓ˜[YOH›]Lˆ›İ[™Y[È›Ü™\ˆ›Ü™\‹VØÛÛÜ˜\ŠKY\ÚİÜX›Ü™\ŠWH™ËVØÛÛÜ˜\ŠK][YK\İ\™˜XÙKZ[œÙ]
WHLˆ^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH‚ˆ]”\ÎˆÜ[ˆÛ\ÜÓ˜[YOH^VØÛÛÜ˜\ŠK][YK]^\š[X\JWH“›Û™OÜÜ[Ù]‚ˆ]”\È™\]Y\İˆÜ[ˆÛ\ÜÓ˜[YOH^VØÛÛÜ˜\ŠK][YK]^\š[X\JWH“›İ™\]Z\™YÜÜ[Ù]‚ˆÙ]‚ˆ
_BˆÙ]‚‚ˆÜÛİ\˜Ù\Ë›[™İˆÈ
ˆ]ˆÛ\ÜÓ˜[YOH›]LÈ›İ[™Y^›Ü™\ˆ›Ü™\‹VØÛÛÜ˜\ŠKY\ÚİÜX›Ü™\ŠWH™ËVØÛÛÜ˜\ŠK][YK\İ\™˜XÙKZ[œÙ]
WHLÈ^^È^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH‚ˆÛİ\˜ÙH[œÜXİ[ÛˆY]Y]NˆÜ[ˆÛ\ÜÓ˜[YOH^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHÜÛİ\˜Ù\Ëš›Ú[Šˆ8 (ˆŠ_OÜÜ[‚ˆÙ]‚ˆ
Hˆ[B‚ˆÜİÜË›[™İˆÈ
ˆ]ˆÛ\ÜÓ˜[YOH›]LÈ›^›^]Ü˜\Ø\Lˆ‚ˆÜİÜË›X\

\›
HOˆ
ˆHÙ^O^İ\›H™Y^İ\›H\™Ù]H—Ø›[šÈˆ™[H››Ü™Y™\œ™\ˆˆÛ\ÜÓ˜[YOHœ›İ[™Y[È›Ü™\ˆ›Ü™\‹\ÚŞKLÌÌÍH™Ë\ÚŞKMÌLL‹HKLKH^^È›Û\Ù[ZX›Û^\ÚŞKLLİ™\˜™Ë\ÚŞKMÌMH‚ˆ]šY[˜ÙHİÂˆØO‚ˆ
J_BˆÙ]‚ˆ
Hˆ[B‚ˆ]ˆÛ\ÜÓ˜[YOH›]LÈ›^›^]Ü˜\Ø\Lˆ‚ˆ]Ûˆ\OH˜]Ûˆˆ\ØX›Y^ØÛÛ[Y\˜ÚX[Y][™Ñ\ØX›YHÛÛXÚÏ^Ê
HOˆÙ]Ü[‘]Z[Ê
™]ŠHOˆ
È‹‹œ™]‹Û[™KšYNˆ\™]–Û[™KšYHJJ_HÛ\ÜÓ˜[YOH™\ÚİÜX‹\ÙXÛÛ™\H›İ[™Y^LÈKLˆ^^È›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWH\ØX›Y›ÜXÚ]KMH‚ˆÛÜ[‘]Z[ÖÛ[™KšYHÈ’YHY]Üˆˆˆ‘Y]][İH[™HŸBˆØ]Û‚ˆ]Ûˆ\OH˜]Ûˆˆ\ØX›Y^ØÛÛ[Y\˜ÚX[Y][™Ñ\ØX›YHÛÛXÚÏ^Ê
HOˆX\šÔ™XÛÛ[Y[™Y™XYJ[™J_HÛ\ÜÓ˜[YOH™\ÚİÜX‹\ÙXÛÛ™\H›İ[™Y^LÈKLˆ^^È›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWH\ØX›Y›ÜXÚ]KMH‚ˆ™XÛÛ\]H™XYHİ]BˆØ]Û‚ˆÈ[[™KœÙ[İ×Øİ\İÛY\—Ø]	‰ˆØ[”Ù[™[™J[™JHÈÜ[ˆÛ\ÜÓ˜[YOHœ›İ[™Y^›Ü™\ˆ›Ü™\‹Y[Y\˜[LÌÌÍH™ËY[Y\˜[MÌLLÈKLˆ^^È›Û\Ù[ZX›Û^Y[Y\˜[LL•Ú[Ù[™ÜÜ[ˆˆ[BˆÈXÛÛ[Y\˜ÚX[Y][™Ñ\ØX›YÈ‚ˆ]Ûˆ\OH˜]Ûˆˆ\ØX›Y^ÈXØ[”Ù[™[™J[™JH	‰ˆZ\ÔÙ[›Ü‘XÚ\Ú[ÛŠ[™J_HÛÛXÚÏ^Ê
HOˆÜ[‘XÚ\Ú[Û‘X[ÙÊ[™K˜\›İ™HŠ_HÛ\ÜÓ˜[YOHœ›İ[™Y^›Ü™\ˆ›Ü™\‹Y[Y\˜[LÌÍ™ËY[Y\˜[MLÌMHLÈKLˆ^^È›Û\Ù[ZX›Û^Y[Y\˜[LL\ØX›Y›ÜXÚ]KMH\›İ™OØ]Û‚ˆ]Ûˆ\OH˜]ÛˆˆÛÛXÚÏ^Ê
HOˆÜ[‘XÚ\Ú[Û‘X[ÙÊ[™K™Y™\ˆŠ_HÛ\ÜÓ˜[YOHœ›İ[™Y^›Ü™\ˆ›Ü™\‹VØÛÛÜ˜\ŠK][YKX›Ü™\‹\ÛÙ
WH™ËVØÛÛÜ˜\ŠK][YK\İ\™˜XÙK\İXJWHLÈKLˆ^^È›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWH‘Y™\Ø]Û‚ˆ]Ûˆ\OH˜]ÛˆˆÛÛXÚÏ^Ê
HOˆÜ[‘XÚ\Ú[Û‘X[ÙÊ[™K™XÛ[™HŠ_HÛ\ÜÓ˜[YOHœ›İ[™Y^›Ü™\ˆ›Ü™\‹\™YMÍH™Ë\™YMLÌLLÈKLˆ^^È›Û\Ù[ZX›Û^\™YLL‘XÛ[™OØ]Û‚ˆÏˆˆ[BˆÙ]‚‚ˆÛÜ[‘]Z[ÖÛ[™KšYH	‰ˆXÛÛ[Y\˜ÚX[Y][™Ñ\ØX›YÈ
ˆ]ˆÛ\ÜÓ˜[YOH™\ÚİÜ\[™[\ÛÙ]LÈM‚ˆ]ˆÛ\ÜÓ˜[YO^Ù[X™YYÈ™ÜšYØ\LÈˆˆ™ÜšYØ\LÈY™ÜšYXÛÛËLˆŸO‚ˆX™[Û\ÜÓ˜[YOH^^È^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH‚ˆ]HÈ\ØÜš\[Û‚ˆ[œ]˜[YO^Û[™K™\ØÜš\[ÛˆÏÈˆŸHÛÚ[™ÙO^ÊJHOˆ]Ú][İS[™J[™KšYÈ\ØÜš\[ÛˆK\™Ù]˜[YHJ_HÛ\ÜÓ˜[YO^Ú[œ]ÛßHÏ‚ˆÛX™[‚ˆX™[Û\ÜÓ˜[YOH^^È^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH‚ˆÛÛ\Z[ˆ[œ]˜[YO^Û[™K˜ZWØÛÛ\Z[ÏÈˆŸHÛÚ[™ÙO^ÊJHOˆ]Ú][İS[™J[™KšYÈZWØÛÛ\Z[ˆK\™Ù]˜[YHJ_HÛ\ÜÓ˜[YO^Ú[œ]ÛßHÏ‚ˆÛX™[‚ˆX™[Û\ÜÓ˜[YOH^^È^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH‚ˆXÚšXÚX[ˆ›İ\Âˆ[œ]˜[YO^İXÚ›İ\ßHÛÚ[™ÙO^ÊJHOˆ]Ú][İS[™SY]Y]J[™KÈXÚšXÚX[—Û›İ\ÎˆK\™Ù]˜[YHJ_HÛ\ÜÓ˜[YO^Ú[œ]ÛßHÏ‚ˆÛX™[‚ˆX™[Û\ÜÓ˜[YOH^^È^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH‚ˆYš\ÛÜˆ›İ\Âˆ[œ]˜[YO^Û[™K››İ\ÈÏÈˆŸHÛÚ[™ÙO^ÊJHOˆ]Ú][İS[™J[™KšYÈ›İ\ÎˆK\™Ù]˜[YHJ_HÛ\ÜÓ˜[YO^Ú[œ]ÛßHÏ‚ˆÛX™[‚ˆX™[Û\ÜÓ˜[YOH^^È^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH‚ˆX›Üˆİ\œÂˆ[œ][œ][ÙOH™XÚ[X[ˆ˜[YO^Ôİš[™ÊX›Ü’İ\œÊ_HÛÚ[™ÙO^ÊJHOˆ]Ú][İS[™J[™KšYÈX›Ü—Úİ\œÎˆ\Ó[X™\ŠK\™Ù]˜[YJHÏÈ\İÛX›Ü—Úİ\œÎˆ\Ó[X™\ŠK\™Ù]˜[YJHÏÈJ_HÛ\ÜÓ˜[YO^Ú[œ]ÛßHÏ‚ˆÛX™[‚ˆX™[Û\ÜÓ˜[YOH^^È^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH‚ˆX›Üˆ˜]Bˆ[œ][œ][ÙOH™XÚ[X[ˆ˜[YO^Ôİš[™Ê[™SX›Ü”˜]J_HÛÚ[™ÙO^ÊJHOˆ]Ú][İS[™J[™KšYÈÛX›Ü”˜]Q˜Yˆ\Ó[X™\ŠK\™Ù]˜[YJHÏÈJ_HÛ\ÜÓ˜[YO^Ú[œ]ÛßHÏ‚ˆÛX™[‚ˆX™[Û\ÜÓ˜[YOH^^È^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH‚ˆX›Üˆ[[İ[ˆ[œ][œ][ÙOH™XÚ[X[ˆ˜[YO^Ôİš[™ÊX›Ü•İ[
_HÛÚ[™ÙO^ÊJHOˆ]Ú][İS[™J[™KšYÈX›Ü—İİ[ˆ\Ó[X™\ŠK\™Ù]˜[YJHÏÈJ_HÛ\ÜÓ˜[YO^Ú[œ]ÛßHÏ‚ˆÛX™[‚ˆX™[Û\ÜÓ˜[YOH^^È^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH‚ˆ\ÈÙ[İ[
Ø[İ[]Y
Bˆ[œ]ˆ˜[YO^Ü\Õİ[OH[Èˆˆˆİš[™Ê\Õİ[
_BˆXÙZÛ\H“X[X[™]šY]È™\]Z\™Y‚ˆ™XYÛ›Bˆ\šXKY\ØÜšX™YO^Ø\Ë\Ù[Z[IÛ[™KšYXBˆÛ\ÜÓ˜[YO^Ø	Ú[œ]ÛßHİ\œÛÜ‹[›İX[İÙYÜXÚ]KNBˆÏ‚ˆÜ[ˆY^Ø\Ë\Ù[Z[IÛ[™KšYXHÛ\ÜÓ˜[YOH›]LH›ØÚÈ^VÌL\H^VØÛÛÜ˜\ŠK][YK]^[]]Y
WH‚ˆY]XXÚ][I˜\ÜÎÜÈÙ[šXÙH[ˆH[šÙY\È™\]Y\İÈ][İH™]šY]È™XØ[İ[]\È\Èİ[‚ˆÜÜ[‚ˆÛX™[‚ˆX™[Û\ÜÓ˜[YOH^^È^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH‚ˆİ]\ÂˆÙ[Xİ˜[YO^Û[™Kœİ]\ÈÏÈˆŸHÛÚ[™ÙO^ÊJHOˆ]Ú][İS[™J[™KšYÈİ]\ÎˆK\™Ù]˜[YHJ_HÛ\ÜÓ˜[YO^Ú[œ]ÛßO‚ˆÜ[Ûˆ˜[YOHœ[™[™×Ü\Èœ[™[™È\ÏÛÜ[Û‚ˆÜ[Ûˆ˜[YOHœ][İYœ™XYHÈ][İYÛÜ[Û‚ˆÜ[Ûˆ˜[YOHœÙ[œÙ[ÛÜ[Û‚ˆÜÙ[Xİ‚ˆÛX™[‚ˆX™[Û\ÜÓ˜[YOH^^È^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH‚ˆİYÙBˆÙ[Xİ˜[YO^Û[™KœİYÙHÏÈˆŸHÛÚ[™ÙO^ÊJHOˆ]Ú][İS[™J[™KšYÈİYÙNˆK\™Ù]˜[YHJ_HÛ\ÜÓ˜[YO^Ú[œ]ÛßO‚ˆÜ[Ûˆ˜[YOH˜Yš\ÛÜ—Ü[™[™È˜Yš\ÛÜˆ[™[™ÏÛÜ[Û‚ˆÜ[Ûˆ˜[YOHœ™XYWİ×ÜÙ[™œ™XYHÈÙ[™ÛÜ[Û‚ˆÜ[Ûˆ˜[YOHœÙ[œÙ[ÛÜ[Û‚ˆÜÙ[Xİ‚ˆÛX™[‚ˆÙ]‚ˆÙ]‚ˆ
Hˆ[BˆÙ]‚ˆÙ]‚ˆ
NÂˆJ_BˆÙ]‚ˆ
_BˆÙ]‚‚ˆİÛÜšÓ[™\Ë›[™İˆÈ
ˆ]ˆÛ\ÜÓ˜[YO^Ø	ØØ\™H]MO‚ˆ]ˆÛ\ÜÓ˜[YO^Ø›Ü™\‹Xˆ	Ù]šY\ŸH	ÜYHKLÈ^\ÛH›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWXO‚ˆXİ]™H\›İ™YÈ[˜ÚX›HÛÜšÂˆÙ]‚ˆ]ˆÛ\ÜÓ˜[YOH™]šYK^H]šYKVØÛÛÜ˜\ŠKY\ÚİÜX›Ü™\ŠWH‚ˆİÛÜšÓ[™\Ë›X\

[™JHOˆ
ˆ]ˆÙ^O^Û[™KšYHÛ\ÜÓ˜[YO^Ø	ÜYHKLÈ^\ÛXO‚ˆ]ˆÛ\ÜÓ˜[YOH™›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHÜØY™Uš[J[™K™\ØÜš\[ÛŠH[™H	Û[™K›[™WÛ›ÈÏÈˆŸXOÙ]‚ˆ]ˆÛ\ÜÓ˜[YOH›]LH^^È^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH”İ]\ÎˆÜİ]\ÓX™[
[™Kœİ]\Ê_H8 (ˆ\›İ˜[ˆÜİ]\ÓX™[
[™K˜\›İ˜[Üİ]J_H8 (ˆ[˜ÚX›NˆÛ[™Kœ[˜ÚX›HÈY\Èˆˆ››ÈŸOÙ]‚ˆÙ]‚ˆ
J_BˆÙ]‚ˆÙ]‚ˆ
Hˆ[BˆÙ]‚‚ˆ]ˆÛ\ÜÓ˜[YO^Ù[X™YYÈˆˆˆœÜXÙK^KMŸO‚ˆ]ˆÛ\ÜÓ˜[YO^ØØ\™O‚ˆ]ˆÛ\ÜÓ˜[YO^Ø›Ü™\‹Xˆ	Ù]šY\ŸH	ÜYHKLÈ^\ÛH›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWXO”][İH™XY[™\ÜÏÙ]‚ˆ]ˆÛ\ÜÓ˜[YO^Ø	ÜYHKM^\ÛH^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWXO‚ˆ]ˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆ\İYKX™]ÙY[ˆÜ[”™XYHÈÙ[™ÜÜ[Ü[ˆÛ\ÜÓ˜[YOH™›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHÜ][İUİ[ËœÙ[™X›_OÜÜ[Ù]‚ˆ]ˆÛ\ÜÓ˜[YOH›]Lˆ›^][\ËXÙ[\ˆ\İYKX™]ÙY[ˆÜ[”[™[™È\ÏÜÜ[Ü[ˆÛ\ÜÓ˜[YOH™›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHÜ][İUİ[Ëœ[™[™Ô\ßOÜÜ[Ù]‚ˆ]ˆÛ\ÜÓ˜[YOH›]Lˆ›^][\ËXÙ[\ˆ\İYKX™]ÙY[ˆÜ[”Ù[ÜÜ[Ü[ˆÛ\ÜÓ˜[YOH™›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHÜ][İUİ[ËœÙ[OÜÜ[Ù]‚ˆ]ˆÛ\ÜÓ˜[YO^Ø]LÈ›^][\ËXÙ[\ˆ\İYKX™]ÙY[ˆ›Ü™\‹]	Ù]šY\ŸHLØOÜ[“X›ÜÜÜ[Ü[ˆÛ\ÜÓ˜[YOH™›Û[YY][H^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHÙ›]
][İUİ[Ë›X›ÜŠ_OÜÜ[Ù]‚ˆ]ˆÛ\ÜÓ˜[YOH›]Lˆ›^][\ËXÙ[\ˆ\İYKX™]ÙY[ˆÜ[Ü][İUİ[Ëœ\ÔšXÚ[™Ô]X\˜[[™YÈ”\È
›İXİY
Hˆˆ”\ÈŸOÜÜ[Ü[ˆÛ\ÜÓ˜[YOH™›Û[YY][H^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHÜ][İUİ[Ëœ\Õİ[[˜]˜Z[X›HÈ“X[X[™]šY]Èˆˆ›]
][İUİ[Ëœ\Ê_OÜÜ[Ù]‚ˆÜ][İUİ[Ëœ\ÔšXÚ[™Ô]X\˜[[™YÈ]ˆÛ\ÜÓ˜[YOH›]LH^^È^X[X™\‹LL”›İXİYš[˜[^™Yİ[È\™H™]Z[™YÈ]X\˜[[™Y][HšXÚ[™È\È^ÛYYÙ]ˆˆ[Bˆ]ˆÛ\ÜÓ˜[YOH›]Lˆ›^][\ËXÙ[\ˆ\İYKX™]ÙY[ˆÜ[”ÚÜİ\Y\ÏÜÜ[Ü[ˆÛ\ÜÓ˜[YOH™›Û[YY][H^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHÙ›]
][İUİ[ËœÚÜİ\Y\Ë˜[[İ[
_OÜÜ[Ù]‚ˆ]ˆÛ\ÜÓ˜[YOH›]LH^^È^VØÛÛÜ˜\ŠK][YK]^[]]Y
WHÜÚÜİ\Y\Ôİ[[X\U^
][İUİ[ËœÚÜİ\Y\Ê_OÙ]‚ˆ]ˆÛ\ÜÓ˜[YO^Ø]LÈ›^][\ËXÙ[\ˆ\İYKX™]ÙY[ˆ›Ü™\‹]	Ù]šY\ŸHLØOÜ[ˆÛ\ÜÓ˜[YOH™›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWH‘Ü˜[™İ[ÜÜ[Ü[ˆÛ\ÜÓ˜[YOH^[È›ÛX›Ûˆİ[O^ŞÈÛÛÜˆÓÔTˆ_OÜ][İUİ[Ë™Ü˜[™İ[[˜]˜Z[X›HÈ“X[X[™]šY]Èˆˆ›]
][İUİ[Ëİ[
_OÜÜ[Ù]‚ˆ]ˆÛ\ÜÓ˜[YO^Ø]M›Ü™\‹]	Ù]šY\ŸHLØO‚ˆ]ˆÛ\ÜÓ˜[YOH^^È›Û\Ù[ZX›Û\\˜Ø\ÙH˜XÚÚ[™ËVÌŒM[WH^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH”ÚÜİ\Y\Èİ™\œšYOÙ]‚ˆÙ[Xİˆ˜[YO^Üİ\Y\Ñ[˜X›Y˜YOH[È™Y˜][ˆˆİ\Y\Ñ[˜X›Y˜YÈ›Ûˆˆˆ›Ù™ˆŸBˆÛÚ[™ÙO^ÊJHOˆÙ]İ\Y\Ñ[˜X›Y˜Y
K\™Ù]˜[YHOOH™Y˜][ˆÈ[ˆK\™Ù]˜[YHOOH›ÛˆŠ_BˆÛ\ÜÓ˜[YOH›]LˆËY[›İ[™Y[È›Ü™\ˆ›Ü™\‹VØÛÛÜ˜\ŠKY\ÚİÜX›Ü™\ŠWH™ËVØÛÛÜ˜\ŠKY\ÚİÜZ][KX™ÊWHLÈKLˆ^\ÛH^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHİ][™K[›Û™H‚ˆ‚ˆÜ[Ûˆ˜[YOH™Y˜][•\ÙHÚÜY˜][ÛÜ[Û‚ˆÜ[Ûˆ˜[YOH›Ûˆ’[˜ÛYHÚÜİ\Y\ÏÛÜ[Û‚ˆÜ[Ûˆ˜[YOH›Ù™ˆ”™[[İ™HÚÜİ\Y\ÏÛÜ[Û‚ˆÜÙ[Xİ‚ˆ[œ]ˆ˜[YO^Üİ\Y\Ğ[[İ[˜YBˆÛÚ[™ÙO^ÊJHOˆÙ]İ\Y\Ğ[[İ[˜Y
K\™Ù]˜[YJ_BˆXÙZÛ\H“Ü[Û˜[š^Yİ™\œšYH[[İ[‚ˆÛ\ÜÓ˜[YOH›]LˆËY[›İ[™Y[È›Ü™\ˆ›Ü™\‹VØÛÛÜ˜\ŠKY\ÚİÜX›Ü™\ŠWH™ËVØÛÛÜ˜\ŠKY\ÚİÜZ][KX™ÊWHLÈKLˆ^\ÛH^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHİ][™K[›Û™HXÙZÛ\^VØÛÛÜ˜\ŠK][YK]^[]]Y
WH‚ˆÏ‚ˆ]ˆÛ\ÜÓ˜[YOH›]LˆÜšYÜšYXÛÛËLˆØ\Lˆ‚ˆ]Ûˆ\OH˜]ÛˆˆÛÛXÚÏ^Ê
HOˆ›ÚYØ]™Tİ\Y\Óİ™\œšYJ
_H\ØX›Y^ÜØ]š[™Ôİ\Y\Óİ™\œšY_HÛ\ÜÓ˜[YOH™\ÚİÜX‹\ÙXÛÛ™\H›İ[™Y[ÈLÈKLˆ^^È›Û\Ù[ZX›Û\ØX›Y›ÜXÚ]KMŒ‚ˆÜØ]š[™Ôİ\Y\Óİ™\œšYHÈ”Ø]š[™ø )ˆˆˆ”Ø]™Hİ™\œšYHŸBˆØ]Û‚ˆ]Ûˆ\OH˜]ÛˆˆÛÛXÚÏ^Ü™\Ù]İ\Y\Óİ™\œšY_HÛ\ÜÓ˜[YOHœ›İ[™Y[È›Ü™\ˆ›Ü™\‹VØÛÛÜ˜\ŠK][YKX›Ü™\‹\ÛÙ
WH™ËVØÛÛÜ˜\ŠK][YK\İ\™˜XÙK\İXJWHLÈKLˆ^^È›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHİ™\˜™ËVØÛÛÜ˜\ŠK][YK\İ\™˜XÙK\İXJWH”™\Ù]˜YØ]Û‚ˆÙ]‚ˆÙ]‚ˆ]ÛˆÛÛXÚÏ^Ê
HOˆ›ÚYØ]™P[\J
_H\ØX›Y^ÜØ]š[™ßHÛ\ÜÓ˜[YOH™\ÚİÜX‹\š[X\H]MËY[›İ[™Y^MKLˆ^\ÛH›Û\Ù[ZX›Û\ØX›Y›ÜXÚ]KMŒ‚ˆÜØ]š[™ÈÈ”Ø]š[™ø )ˆˆˆ”Ø]™HÚ[™Ù\ÈŸBˆØ]Û‚ˆÙ]‚ˆÙ]‚‚ˆ]ˆÛ\ÜÓ˜[YO^ØØ\™O‚ˆ]ˆÛ\ÜÓ˜[YO^Ø›Ü™\‹Xˆ	Ù]šY\ŸH	ÜYHKLÈ^\ÛH›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWXO”Ù[™Èİ\İÛY\Ù]‚ˆ]ˆÛ\ÜÓ˜[YO^Ø	ÜYHKM^\ÛH^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWXO‚ˆÙ[™ÈÛ›HØ[›ÛšXØ[ÛÜš×ÛÜ™\—Ü][İWÛ[™\È]\™H™XYHÈÙ[™ˆ[™[™È\ËXÛ[™YY™\œ™Y\›İ™Y[™ÛÛ™\Y[™\È\™H›İÙ[‚ˆÜ][İUİ[ËœÙ[™X›HOOHÈ
ˆ]ˆÛ\ÜÓ˜[YOH›]LÈ›İ[™Y^›Ü™\ˆ›Ü™\‹X[X™\‹LÌÌÍH™ËX[X™\‹MÌLLÈ^X[X™\‹LL“›È™XYHØ[›ÛšXØ[][İH[™\È\™H]˜Z[X›HÈÙ[™Ù]‚ˆ
Hˆ[BˆÛZ\ÜÚ[™Ğİ\İÛY\‘[XZ[Ù[™›ØÚÙ\ˆÈ
ˆ]ˆÛ\ÜÓ˜[YOH›]LÈ›İ[™Y^›Ü™\ˆ›Ü™\‹\ÚŞKMÌÍH™Ë\ÚŞKMLÌLLÈ‚ˆ]ˆÛ\ÜÓ˜[YOH^^È›Û\Ù[ZX›Û\\˜Ø\ÙH˜XÚÚ[™ËVÌŒM[WH^\ÚŞKLL›ØÚÙYÙ]‚ˆ]ˆÛ\ÜÓ˜[YOH›]LH^\ÛH›Û\Ù[ZX›Û^\ÚŞKLLÜÙ[™›ØÚÙ\ˆÏÈİ\İÛY\ˆ[XZ[™\]Z\™YÈÙ[™][İHŸOÙ]‚ˆ]ˆÛ\ÜÓ˜[YOH›]Lˆ›^›^XÛÛØ\LˆÛN™›^\›İÈ‚ˆ[œ]\OH™[XZ[ˆ˜[YO^Ü[™[™Ğİ\İÛY\‘[XZ[HÛÚ[™ÙO^ÊJHOˆÙ][™[™Ğİ\İÛY\‘[XZ[
K\™Ù]˜[YJ_HXÙZÛ\H˜İ\İÛY\[XZ[˜ÛÛHˆÛ\ÜÓ˜[YOHËY[›İ[™Y[È›Ü™\ˆ›Ü™\‹VØÛÛÜ˜\ŠKY\ÚİÜX›Ü™\ŠWH™ËVØÛÛÜ˜\ŠKY\ÚİÜZ][KX™ÊWHLÈKLˆ^\ÛH^VØÛÛÜ˜\ŠK][YK]^\š[X\JWHİ][™K[›Û™HXÙZÛ\^VØÛÛÜ˜\ŠK][YK]^[]]Y
WH›Øİ\Î˜›Ü™\‹\ÚŞKLÌÍÌˆÏ‚ˆ]Ûˆ\OH˜]ÛˆˆÛÛXÚÏ^Ê
HOˆ›ÚYØ]™Pİ\İÛY\‘[XZ[[›[™J
_H\ØX›Y^ÜØ]š[™Ğİ\İÛY\‘[XZ[HÛ\ÜÓ˜[YOHœ›İ[™Y[È›Ü™\ˆ›Ü™\‹X[X™\‹LÌÍH™ËX[X™\‹MÌMHLÈKLˆ^\ÛH›Û\Ù[ZX›Û^\ÚŞKLLİ™\˜™ËX[X™\‹MÌŒ\ØX›Y›ÜXÚ]KMŒ‚ˆÜØ]š[™Ğİ\İÛY\‘[XZ[È”Ø]š[™ø )ˆˆˆ”Ø]™H[XZ[ŸBˆØ]Û‚ˆÙ]‚ˆÙ]‚ˆ
Hˆ[Bˆ]ÛˆÛÛXÚÏ^Ê
HOˆ›ÚYÙ[™][İUĞİ\İÛY\Š˜[ÙJ_H\ØX›Y^ÜÙ[™[™ÈØ]š[™Ğİ\İÛY\‘[XZ[][İUİ[ËœÙ[™X›HOOHHÛ\ÜÓ˜[YOH™\ÚİÜX‹\ÙXÛÛ™\H]LÈËY[›İ[™Y^MKLˆ^\ÛH›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWH\ØX›Y›ÜXÚ]KMŒ‚ˆÜÙ[™[™ÈÈ”Ù[™[™ø )ˆˆˆ”Ù[™™XYH][İH[™\ÈŸBˆØ]Û‚ˆÜ][İUİ[ËœÙ[ˆÈ
ˆ]ÛˆÛÛXÚÏ^Ê
HOˆ›ÚYÙ[™][İUĞİ\İÛY\ŠYJ_H\ØX›Y^ÜÙ[™[™ÈØ]š[™Ğİ\İÛY\‘[XZ[Z\ÜÚ[™Ğİ\İÛY\‘[XZ[HÛ\ÜÓ˜[YOH™\ÚİÜX‹\ÙXÛÛ™\H]LˆËY[›İ[™Y^MKLˆ^\ÛH›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWH\ØX›Y›ÜXÚ]KMŒ‚ˆÜÙ[™[™ÈÈ”Ù[™[™ø )ˆˆˆ”™\Ù[™][İHŸBˆØ]Û‚ˆ
Hˆ[Bˆ]ˆÛ\ÜÓ˜[YOH›]LÈ^^È^VØÛÛÜ˜\ŠK][YK]^[]]Y
WH”Ü[[šÈÚ[™NˆÜ[ˆÛ\ÜÓ˜[YOH^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH‹ÜÜ[Ü][İ\ËŞİÛÒYOÜÜ[Ù]‚ˆ]ˆÛ\ÜÓ˜[YOH›]Lˆ^^È^VØÛÛÜ˜\ŠK][YK]^[]]Y
WHİ\İÛY\ˆÜ[XÚ\Ú[ÛœÈ[™ÚÜ\™XÛÜ™YÛ™HXÚ\Ú[ÛœÈ\ÙHHØ[YHØ[›ÛšXØ[\›İ˜[Y™XŞXÛKÙ]‚ˆÙ]‚ˆÙ]‚‚ˆ]ˆÛ\ÜÓ˜[YO^ØØ\™O‚ˆ]ˆÛ\ÜÓ˜[YO^Ø›Ü™\‹Xˆ	Ù]šY\ŸH	ÜYHKLÈ^\ÛH›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWXO”]ZXÚÈY›ØÙ]‚ˆ]ˆÛ\ÜÓ˜[YO^Ø	ÜYHKM^\ÛH^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWXO‚ˆYXİ]™HÛÜšÈÛ›HÚ[ˆ[[[Û˜[H™YYYˆ[œÜXİ[Ûˆ™XÛÛ[Y[™][ÛœÈÚİ[İ^H[ˆØ[›ÛšXØ[][İH[™\È[[İ\İÛY\ˆ\›İ˜[ÛX]\šX[^˜][Û‹‚ˆ]Ûˆ\OH˜]ÛˆˆÛÛXÚÏ^ÛÜ[Y›Ø•Ú]™Yš[HÛ\ÜÓ˜[YOH™\ÚİÜX‹\š[X\H]LÈËY[›İ[™Y^MKLˆ^\ÛH›Û\Ù[ZX›ÛŠÈY›Øˆ[™OØ]Û‚ˆÙ]‚ˆÙ]‚ˆÙ]‚ˆÙ]‚‚ˆÈY[X™YY	‰ˆ]ˆÛ\ÜÓ˜[YOH›]Mˆ^^È^VØÛÛÜ˜\ŠK][YK]^[]]Y
WH•ÛÜšÈÜ™\ˆQˆİÛËšYH8 (ˆİ]\ÎˆÜİ]\ÓX™[
ÛËœİ]\Ê_OÙ]ŸB‚ˆÙXÚ\Ú[Û‘X[ÙÈÈ
ˆ]ˆÛ\ÜÓ˜[YOH™š^Y[œÙ]L‹VÌLH›^][\ËXÙ[\ˆ\İYKXÙ[\ˆ™ËX›XÚËÍHMˆ›ÛOH™X[ÙÈˆ\šXK[[Ù[HYHˆ\šXK[X™[YOHœÚÜYXÚ\Ú[Û‹]]H‚ˆ]ˆÛ\ÜÓ˜[YOHËY[X^]Ë[È›İ[™YL›Ü™\ˆ›Ü™\‹VØÛÛÜ˜\ŠKY\ÚİÜX›Ü™\ŠWH™ËVØÛÛÜ˜\ŠK][YK\İ\™˜XÙK[İ™\›^JWHMHÚYİËL‚ˆ]ˆÛ\ÜÓ˜[YOH^^È›Û\Ù[ZX›Û\\˜Ø\ÙH˜XÚÚ[™ËVÌŒN[WH^VØÛÛÜ˜\ŠK][YK]^[]]Y
WHÛ\ÜÚXÈÚÜ\›İ˜[Ù]‚ˆˆYHœÚÜYXÚ\Ú[Û‹]]HˆÛ\ÜÓ˜[YOH›]Lˆ^[È›Û\Ù[ZX›Û^VØÛÛÜ˜\ŠK][YK]^\š[X\JWH”™XÛÜ™Üİ]\ÓX™[
XÚ\Ú[Û‘X[ÙË™XÚ\Ú[ÛŠ_H8 %ÜØY™Uš[JXÚ\Ú[Û‘X[ÙË›[™K™\ØÜš\[ÛŠHœ][İH[™HŸOÚ‚ˆÛ\ÜÓ˜[YOH›]Lˆ^\ÛH^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH•\ÙH\ÈY\ˆÛÛ™š\›Z[™ÈHİ\İÛY\‰˜\ÜÎÜÈXÚ\Ú[Ûˆİ]ÚYHHÜ[ˆHYš\ÛÜ‹ÛÛXİY]Ù[YK[™›İH\™H™]Z[™YÚ]H][İKÜ‚ˆX™[Û\ÜÓ˜[YOH›]M›ØÚÈ^^È›Û[YY][H^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH‚ˆİ\İÛY\ˆÛÛXİY]ÙˆÙ[Xİ˜[YO^ÙXÚ\Ú[ÛÛÛXİHÛÚ[™ÙO^Ê]™[
HOˆÙ]XÚ\Ú[ÛÛÛXİ
]™[\™Ù]˜[YH\ÈÛÛXİY]Ù
_HÛ\ÜÓ˜[YO^Ú[œ]ÛßO‚ˆÜ[Ûˆ˜[YOHœÛ™H”Û™HØ[ÛÜ[ÛÜ[Ûˆ˜[YOHš[—Ü\œÛÛˆ’[ˆ\œÛÛÛÜ[ÛÜ[Ûˆ˜[YOH™[XZ[‘[XZ[ÛÜ[ÛÜ[Ûˆ˜[YOH›İ\ˆ“İ\ÛÜ[Û‚ˆÜÙ[Xİ‚ˆÛX™[‚ˆX™[Û\ÜÓ˜[YOH›]LÈ›ØÚÈ^^È›Û[YY][H^VØÛÛÜ˜\ŠK][YK]^\ÙXÛÛ™\JWH‚ˆYš\ÛÜˆ›İH
Ü[Û˜[
Bˆ^\™XH˜[YO^ÙXÚ\Ú[Û“›İ_HÛÚ[™ÙO^Ê]™[
HOˆÙ]XÚ\Ú[Û“›İJ]™[\™Ù]˜[YKœÛXÙJL
J_H›İÜÏ^ÌßHXÙZÛ\H‘^[\Nˆ\›İ™YHÛ™HÚ]˜[ZYH]ŒMHKˆˆÛ\ÜÓ˜[YO^Ú[œ]ÛßHÏ‚ˆÛX™[‚ˆ]ˆÛ\ÜÓ˜[YOH›]MH›^›^]Ü˜\\İYKY[™Ø\Lˆ‚ˆ]Ûˆ\OH˜]Ûˆˆ\ØX›Y^ÙXÚ\Ú[Û”Ø]š[™ßHÛÛXÚÏ^Ê
HOˆÙ]XÚ\Ú[Û‘X[ÙÊ[
_HÛ\ÜÓ˜[YOH™\ÚİÜX‹\ÙXÛÛ™\H›İ[™Y^MKLˆ^\ÛH›Û\Ù[ZX›Û\ØX›Y›ÜXÚ]KMLØ[˜Ù[Ø]Û‚ˆ]Ûˆ\OH˜]Ûˆˆ\ØX›Y^ÙXÚ\Ú[Û”Ø]š[™ßHÛÛXÚÏ^Ê
HOˆ›ÚYÛÛ™š\›TÚÜXÚ\Ú[ÛŠ
_HÛ\ÜÓ˜[YO^ÙXÚ\Ú[Û‘X[ÙË™XÚ\Ú[ÛˆOOH™XÛ[™HˆÈœ›İ[™Y^›Ü™\ˆ›Ü™\‹\™YMÍH™Ë\™YMLÌMHMKLˆ^\ÛH›Û\Ù[ZX›Û^\™YLL\ØX›Y›ÜXÚ]KMLˆˆ™\ÚİÜX‹\š[X\H›İ[™Y^MKLˆ^\ÛH›Û\Ù[ZX›Û\ØX›Y›ÜXÚ]KMLŸOÙXÚ\Ú[Û”Ø]š[™ÈÈ”™XÛÜ™[™ø )ˆˆˆÛÛ™š\›H	Üİ]\ÓX™[
XÚ\Ú[Û‘X[ÙË™XÚ\Ú[ÛŠ_XOØ]Û‚ˆÙ]‚ˆÙ]‚ˆÙ]‚ˆ
Hˆ[B‚ˆY›Ø“[Ù[ˆ\ÓÜ[^ØY›Ø“Ü[ŸBˆÛÛÜÙO^Ê
HOˆÙ]Y›Ø“Ü[Š˜[ÙJ_BˆÛÜšÓÜ™\’Y^İÛËšYBˆ™ZXÛRY^İÛË™ZXÛWÚYBˆÚÜY^İÛËœÚÜÚYBˆXÚY^Øİ\œ™[\Ù\’YBˆÛ’›ØYY^Ê
HOˆÂˆÙ]Y›Ø“Ü[Š˜[ÙJNÂˆ›ÚY™[ØY

NÂˆ_BˆÏ‚ˆÙ]‚ˆÙ]‚ˆ
NÂŸB