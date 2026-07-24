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
import { quoteLineTotalResolved, resolveQuoteLineParts, type CatalogPart, type PartRequest, type PartRequestItem, type ResolvedQuotePart } from "./partsModel";
import { useTabs } from "@/features/shared/components/tabs/TabsProvider";

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
  return safeTrim(value).replaceAll("_", " ") || "—";
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
  if (!customer) return "—";
  const full = safeTrim((customer as unknown as { full_name?: unknown }).full_name);
  const first = safeTrim(customer.first_name);
  const last = safeTrim(customer.last_name);
  return full || safeTrim(customer.business_name) || [first, last].filter(Boolean).join(" ") || "—";
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

function quoteLinePartsTotal(line: Pick<QuoteLine, "parts_total" | "metadata">): number {
  const explicit = asNumber(line.parts_total);
  if (explicit != null) return explicit;

  const parts = quoteMetadata(line).parts;
  if (!Array.isArray(parts)) return 0;

  return parts.reduce<number>((sum, part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return sum;
    const p = part as Record<string, Json>;
    const qty = jsonNumber(p.qty) ?? 1;
    const unit = jsonNumber(p.unitPrice) ?? jsonNumber(p.unit_price) ?? jsonNumber(p.unitCost) ?? jsonNumber(p.unit_cost) ?? 0;
    return sum + qty * unit;
  }, 0);
}

function quoteLineTotal(line: EditableQuoteLine, shopLaborRate: number): number {
  return quoteLineTotalResolved({
    persistedGrandTotal: line.grand_total,
    persistedSubtotal: line.subtotal,
    calculatedLabor: quoteLineLaborTotal(line, shopLaborRate),
    calculatedParts: quoteLinePartsTotal(line),
  });
}

function hasPartsPrice(line: Pick<QuoteLine, "parts_total" | "metadata">): boolean {
  if (asNumber(line.parts_total) != null) return true;
  const parts = quoteMetadata(line).parts;
  if (!Array.isArray(parts) || parts.length === 0) return true;
  return parts.every((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return false;
    const p = part as Record<string, Json>;
    return (
      jsonNumber(p.unitPrice) != null ||
      jsonNumber(p.unit_price) != null ||
      jsonNumber(p.unitCost) != null ||
      jsonNumber(p.unit_cost) != null
    );
  });
}


function partsQuoteSummary(line: Pick<QuoteLine, "metadata">): {
  requiredCount: number;
  quotedCount: number;
  pendingCount: number;
  partsTotal: number | null;
} | null {
  const partsQuote = quoteMetadata(line).parts_quote;
  if (!partsQuote || typeof partsQuote !== "object" || Array.isArray(partsQuote)) return null;
  const record = partsQuote as Record<string, Json>;
  return {
    requiredCount: jsonNumber(record.required_count) ?? 0,
    quotedCount: jsonNumber(record.quoted_count) ?? 0,
    pendingCount: jsonNumber(record.pending_count) ?? 0,
    partsTotal: jsonNumber(record.parts_total),
  };
}

function partsWorkflowLabel(line: EditableQuoteLine): { label: string; tone: "warn" | "ok" | "info" } | null {
  const summary = partsQuoteSummary(line);
  const status = safeTrim(line.status).toLowerCase();
  const stage = safeTrim(line.stage).toLowerCase();

  if (summary) {
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

function partPricingLabel(part: ResolvedQuotePart): string {
  if (part.pricingState === "unresolved") return "Pricing unresolved";
  if (part.unitPrice != null) return `Unit price: ${fmt(part.unitPrice)}`;
  return "Price entered";
}

function selectedPartLabel(part: ResolvedQuotePart): string | null {
  const identity = [part.selectedPartName, part.selectedPartNumber].filter(Boolean).join(" • ");
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
        customerName && customerName !== "—"
          ? `${workOrderLabel} · ${customerName}`
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
            .select("id,name,sku,part_number,supplier")
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
    const parts = quoteLines.reduce((sum, line) => sum + quoteLinePartsTotal(line), 0);
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
    return { labor, parts, linesTotal, shopSupplies, total, sendable, pendingParts, sent };
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
        const laborHours = quoteLineLaborHours(line);
        const laborTotal = quoteLineLaborTotal(line, laborRate);
        const partsTotal = quoteLinePartsTotal(line);
        const subtotal = laborTotal + partsTotal;
        const metadata = {
          ...quoteMetadata(line),
          labor_rate: quoteLineLaborRate(line, laborRate),
        } as Json;

        const patch: QuoteLineUpdate = {
          description: line.description,
          ai_complaint: line.ai_complaint,
          ai_cause: line.ai_cause,
          ai_correction: line.ai_correction,
          notes: line.notes,
          est_labor_hours: line.est_labor_hours,
          labor_hours: laborHours,
          labor_total: laborTotal,
          parts_total: partsTotal,
          subtotal,
          grand_total: subtotal,
          status: line.status,
          stage: line.stage,
          metadata,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("work_order_quote_lines")
          .update(patch)
          .eq("id", line.id)
          .eq("shop_id", wo.shop_id)
          .eq("work_order_id", woId);
        if (error) throw error;
      }

      toast.success("Quote lines saved.");
      await reload();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save quote lines.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openDecisionDialog(line: EditableQuoteLine, decision: QuoteDecision) {
    setDecisionContact("phone");
    setDecisionNote("");
    setDecisionDialog({ line, decision });
  }

  async function confirmShopDecision() {
    if (!decisionDialog || decisionSaving) return;
    setDecisionSaving(true);
    try {
      if (quoteLines.some((line) => line._dirty)) {
        const saved = await saveAllDirty();
        if (!saved) return;
      }
      const response = await fetch(`/api/work-orders/quotes/${decisionDialog.line.id}/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: decisionDialog.decision, contactMethod: decisionContact, note: decisionNote, operationKey: crypto.randomUUID() }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not record the shop decision.");
      const pastTense = decisionDialog.decision === "approve" ? "approved" : decisionDialog.decision === "decline" ? "declined" : "deferred";
      toast.success(`Quote line ${pastTense} by the shop.`);
      setDecisionDialog(null);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record the shop decision.");
    } finally {
      setDecisionSaving(false);
    }
  }

  async function saveSuppliesOverride() {
    if (!wo?.shop_id || savingSuppliesOverride) return;
    const amountOverride = suppliesAmountDraft.trim() ? asNumber(suppliesAmountDraft) : null;
    if (suppliesAmountDraft.trim() && amountOverride == null) {
      toast.error("Enter a valid shop supplies override amount.");
      return;
    }

    setSavingSuppliesOverride(true);
    try {
      const { error } = await supabase
        .from("work_orders")
        .update({
          shop_supplies_enabled_override: suppliesEnabledDraft,
          shop_supplies_amount_override: amountOverride,
          updated_at: new Date().toISOString(),
        } as DB["public"]["Tables"]["work_orders"]["Update"])
        .eq("id", wo.id)
        .eq("shop_id", wo.shop_id);
      if (error) throw error;
      toast.success("Shop supplies override saved.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save shop supplies override.");
    } finally {
      setSavingSuppliesOverride(false);
    }
  }

  function resetSuppliesOverride() {
    setSuppliesEnabledDraft(null);
    setSuppliesAmountDraft("");
  }

  async function saveCustomerEmailInline() {
    if (!wo?.customer_id) {
      toast.error("No customer linked to this work order.");
      return;
    }
    const nextEmail = safeTrim(pendingCustomerEmail);
    if (!nextEmail || !isValidEmail(nextEmail)) {
      toast.error("Enter a valid customer email.");
      return;
    }

    setSavingCustomerEmail(true);
    try {
      const { error } = await supabase.from("customers").update({ email: nextEmail }).eq("id", wo.customer_id);
      if (error) throw error;
      setSendBlocker(null);
      toast.success("Customer email saved.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save customer email.");
    } finally {
      setSavingCustomerEmail(false);
    }
  }

  async function sendQuoteToCustomer() {
    if (!woId || sending) return;
    setSending(true);
    try {
      const saved = await saveAllDirty();
      if (!saved) return;

      const res = await fetch(`/api/work-orders/${woId}/send-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; detail?: string } | null;

      if (!res.ok || !json?.ok) {
        const message = safeTrim(json?.error ?? json?.detail ?? "Failed to send quote.");
        if (message.toLowerCase().includes("email")) setSendBlocker("Customer email required to send quote");
        toast.error(message);
        return;
      }

      setSendBlocker(null);
      toast.success("Quote sent to customer using canonical quote lines.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send quote.");
    } finally {
      setSending(false);
    }
  }

  function openAddJobWithPrefill() {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        "addJobModal:prefill",
        JSON.stringify({ jobName: "", notes: "", laborHours: null, partsPaste: "", parts: null }),
      );
    }
    setAddJobOpen(true);
  }

  if (!woId) return <div className="p-6 text-red-300">Missing work order id.</div>;
  if (loading && !loadedOnce) return <div className="p-6 text-[color:var(--theme-text-secondary)]">Loading…</div>;
  if (!wo) return <div className="p-6 text-red-300">Work order not found.</div>;

  const outerCls = embedded ? "min-h-full w-full px-0 py-0 text-foreground" : "min-h-screen px-4 py-6 text-foreground";
  const containerCls = embedded ? "mx-auto w-full max-w-none" : "mx-auto max-w-7xl";
  const padX = embedded ? "px-3" : "px-5";
  const padY = embedded ? "py-3" : "py-4";
  const mainGridCls = embedded ? "mt-3 grid gap-3" : "mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_380px]";
  const actionBtnCls = embedded ? `${ui.buttonSecondary} px-3 py-1.5 text-xs disabled:opacity-60` : `${ui.buttonSecondary} px-4 py-2 text-sm disabled:opacity-60`;
  const saveBtnCls = embedded ? `${ui.buttonPrimary} px-3 py-1.5 text-xs disabled:opacity-60` : `${ui.buttonPrimary} px-4 py-2 text-sm disabled:opacity-60`;

  return (
    <div className={outerCls} style={{ ["--copper" as never]: COPPER }}>
      <div className={containerCls}>
        {loading ? (
          <div className="mb-2 rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">
            Refreshing canonical quote lines…
          </div>
        ) : null}

        <div className={embedded ? "mb-2 flex flex-wrap items-center justify-between gap-2" : "mb-4 flex flex-wrap items-center justify-between gap-3"}>
          {!embedded && (
            <button onClick={() => router.back()} className="text-sm text-[color:var(--copper)] hover:underline">
              ← Back
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void sendQuoteToCustomer()} disabled={sending || quoteTotals.sendable === 0} className={actionBtnCls} title="Email the ready canonical quote lines to the customer">
              {sending ? "Sending…" : "Send Quote"}
            </button>
            <button onClick={() => void saveAllDirty()} disabled={saving} className={saveBtnCls} title="Save canonical quote line changes">
              {saving ? "Saving…" : "Save"}
            </button>
            {!embedded && (
              <a href={`/work-orders/${woId}`} className="desktop-btn-secondary rounded-full px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)]" title="Open the work order">
                Open WO
              </a>
            )}
          </div>
        </div>

        <div className={`${card} ${padX} ${padY}`}>
          <div className={embedded ? "grid gap-3" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1.15fr)_auto]"}>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.25em] text-[color:var(--theme-text-secondary)]">Advisor quote review</div>
              <div className={embedded ? "mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]" : "mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]"}>
                <span className="text-[color:var(--theme-text-primary)]">#</span>
                <span style={{ color: COPPER }}>{wo.custom_id ? wo.custom_id : wo.id.slice(0, 8)}</span>
              </div>
              <div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Canonical quote lines: {quoteLines.length} • Active work lines: {workLines.length}</div>
            </div>

            <div className="desktop-panel-soft w-full px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-muted)]">Customer contact</div>
              <div className={embedded ? "mt-2 grid gap-2" : "mt-2 grid gap-2 sm:grid-cols-3"}>
                <div className="min-w-0">
                  <div className="text-[11px] text-[color:var(--theme-text-muted)]">Name</div>
                  <div className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">{customerDisplayName(customer)}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-[color:var(--theme-text-muted)]">Phone</div>
                  {tel ? <a href={`tel:${tel}`} className="truncate text-sm font-semibold text-[color:var(--copper)] hover:underline">{customerPhone}</a> : <div className="truncate text-sm font-semibold text-[color:var(--theme-text-secondary)]">—</div>}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-[color:var(--theme-text-muted)]">Email</div>
                  {customerEmail ? <a href={`mailto:${customerEmail}`} className="block break-all text-sm font-semibold leading-tight text-[color:var(--copper)] hover:underline">{customerEmail}</a> : <div className="truncate text-sm font-semibold text-[color:var(--theme-text-secondary)]">—</div>}
                </div>
              </div>
            </div>

            <div className={embedded ? "text-left" : "text-right self-start"}>
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--theme-text-muted)]">Shop labor rate</div>
              <div className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">{fmt(laborRate)}/hr</div>
            </div>
          </div>
        </div>

        <div className={mainGridCls}>
          <div>
            <div className={card}>
              <div className={`border-b ${divider} ${padX} py-3 text-sm font-semibold text-[color:var(--theme-text-primary)]`}>
                Canonical quote lines
              </div>
              {quoteLines.length === 0 ? (
                <div className={`${padX} py-4 text-sm text-[color:var(--theme-text-secondary)]`}>
                  No canonical quote lines exist for this work order yet. Phase 5B does not create temporary work_order_lines for portal visibility; customer portal rendering remains Phase 5C.
                </div>
              ) : (
                <div className="divide-y divide-[color:var(--desktop-border)]">
                  {quoteLines.map((line, index) => {
                    const workflow = workflowDisplay(line);
                    const partsWorkflow = partsWorkflowLabel(line);
                    const partsSummary = partsQuoteSummary(line);
                    const meta = quoteMetadata(line);
                    const photos = [...jsonStringArray(meta.photo_urls), ...jsonStringArray(meta.evidence_urls)];
                    const techNotes = jsonString(meta.technician_notes) || jsonString(meta.tech_notes) || safeTrim(line.ai_cause);
                    const laborHours = quoteLineLaborHours(line);
                    const lineLaborRate = quoteLineLaborRate(line, laborRate);
                    const laborTotal = quoteLineLaborTotal(line, laborRate);
                    const partsTotal = quoteLinePartsTotal(line);
                    const total = quoteLineTotal(line, laborRate);
                    const sources = sourceSummary(line);
                    const historyInsight = historyInsights[line.id];
                    const finalDecision = isFinalDecision(line);

                    return (
                      <div key={line.id} className={`${padX} py-4`}>
                        <div className="desktop-panel-soft p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">Quote line {index + 1}</div>
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass(workflow.tone)}`}>{workflow.label}</span>
                                {partsWorkflow ? <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass(partsWorkflow.tone)}`}>{partsWorkflow.label}</span> : null}
                                {line._dirty ? <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">Unsaved</span> : null}
                              </div>
                              <h3 className="mt-2 text-base font-semibold text-[color:var(--theme-text-primary)]">{safeTrim(line.description) || "Untitled quote line"}</h3>
                              {safeTrim(line.ai_complaint) ? <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Complaint: {line.ai_complaint}</p> : null}
                              {safeTrim(line.notes) ? <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Notes: {line.notes}</p> : null}
                              {techNotes ? <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Technician notes: {techNotes}</p> : null}
                              <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">{workflow.detail}</p>
                            </div>
                            <div className="min-w-[180px] rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--theme-surface-inset)] p-3 text-sm">
                              <div className="flex justify-between gap-4"><span className="text-[color:var(--theme-text-secondary)]">Labor</span><span className="font-semibold text-[color:var(--theme-text-primary)]">{fmt(laborTotal)}</span></div>
                              <div className="mt-1 flex justify-between gap-4"><span className="text-[color:var(--theme-text-secondary)]">Parts</span><span className="font-semibold text-[color:var(--theme-text-primary)]">{fmt(partsTotal)}</span></div>
                              <div className={`mt-2 flex justify-between gap-4 border-t ${divider} pt-2`}><span className="text-[color:var(--theme-text-secondary)]">Total</span><span className="font-bold" style={{ color: COPPER }}>{fmt(total)}</span></div>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 text-xs text-[color:var(--theme-text-secondary)] sm:grid-cols-2 lg:grid-cols-4">
                            <div>Stage: <span className="text-[color:var(--theme-text-primary)]">{statusLabel(line.stage)}</span></div>
                            <div>Status: <span className="text-[color:var(--theme-text-primary)]">{statusLabel(line.status)}</span></div>
                            <div>Labor hours: <span className="text-[color:var(--theme-text-primary)]">{laborHours}</span></div>
                            <div>Labor rate: <span className="text-[color:var(--theme-text-primary)]">{fmt(lineLaborRate)}/hr</span></div>
                          </div>

                          {historyInsight ? (
                            <div className="mt-3 rounded-xl border border-sky-300/30 bg-sky-400/10 p-3 text-xs">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="font-semibold uppercase tracking-[0.16em] text-sky-100">Relevant vehicle history</div>
                                  <div className="mt-1 text-[color:var(--theme-text-primary)]">Completed {historyDistanceLabel(historyInsight)}{historyInsight.workOrderNumber ? ` on WO ${historyInsight.workOrderNumber}` : " on a prior work order"}.</div>
                                  <div className="mt-1 text-[color:var(--theme-text-secondary)]">{historyInsight.description}</div>
                                </div>
                                <a href={`/work-orders/${historyInsight.workOrderId}`} className="rounded-lg border border-sky-300/35 px-2.5 py-1.5 font-semibold text-sky-100 hover:bg-sky-400/10">View prior WO</a>
                              </div>
                            </div>
                          ) : historyLoading ? <div className="mt-3 text-xs text-[color:var(--theme-text-muted)]">Checking relevant vehicle history…</div> : null}

                          <div className="mt-3 rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--theme-surface-inset)] p-3 text-xs text-[color:var(--theme-text-secondary)]">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">Required parts</div>
                              <div className="flex flex-wrap items-center gap-2">
                                {partsSummary ? <div className="text-[color:var(--theme-text-secondary)]">Sync: <span className="text-[color:var(--theme-text-primary)]">{partsSummary.pendingCount > 0 ? "pending" : "quoted"} • {partsSummary.quotedCount}/{partsSummary.requiredCount} quoted • {fmt(partsSummary.partsTotal)}</span></div> : null}
                                {(partsByQuoteLine[line.id] ?? []).length > 0 ? <button type="button" onClick={() => setOpenParts((prev) => ({ ...prev, [line.id]: !prev[line.id] }))} className="rounded-lg border border-[color:var(--desktop-border)] px-2.5 py-1.5 font-semibold text-[color:var(--theme-text-primary)]">{openParts[line.id] ? "Hide parts" : `View ${(partsByQuoteLine[line.id] ?? []).length} parts`}</button> : null}
                              </div>
                            </div>
                            {(partsByQuoteLine[line.id] ?? []).length > 0 && openParts[line.id] ? (
                              <div className="mt-2 space-y-2">
                                {(partsByQuoteLine[line.id] ?? []).map((part) => {
                                  const request = part.requestId ? (requestsByQuoteLine[line.id] ?? []).find((candidate) => candidate.id === part.requestId) ?? null : null;
                                  const selected = selectedPartLabel(part);
                                  return (
                                    <div key={`${part.source}:${part.requestItemId ?? part.requestId ?? part.description}`} className="rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--theme-surface-inset)] p-2">
                                      {selected ? (
                                        <>
                                          <div className="text-[color:var(--theme-text-primary)]">Requested: <span className="font-semibold text-[color:var(--theme-text-primary)]">{part.description} × {part.quantity}</span></div>
                                          <div className="mt-1 text-[color:var(--theme-text-secondary)]">Selected: <span className="text-[color:var(--theme-text-primary)]">{selected}</span></div>
                                        </>
                                      ) : (
                                        <div className="font-semibold text-[color:var(--theme-text-primary)]">{part.description} × {part.quantity}</div>
                                      )}
                                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[color:var(--theme-text-secondary)]">
                                        {part.requestedPartNumber ? <span>Requested part #: <span className="text-[color:var(--theme-text-primary)]">{part.requestedPartNumber}</span></span> : null}
                                        {part.manufacturer ? <span>Manufacturer: <span className="text-[color:var(--theme-text-primary)]">{part.manufacturer}</span></span> : null}
                                        {part.supplier ?? part.vendor ? <span>Supplier: <span className="text-[color:var(--theme-text-primary)]">{part.supplier ?? part.vendor}</span></span> : null}
                                        <span>{partPricingLabel(part)}</span>
                                        {part.lineTotal != null ? <span>Line: <span className="text-[color:var(--theme-text-primary)]">{fmt(part.lineTotal)}</span></span> : null}
                                        {part.status ? <span>Status: <span className="text-[color:var(--theme-text-primary)]">{statusLabel(part.status)}</span></span> : null}
                                      </div>
                                      {request ? (
                                        <a href={`/parts/requests/${request.id}`} className="mt-2 inline-flex rounded-lg border border-sky-300/35 bg-sky-400/10 px-2.5 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-400/15">
                                          View Parts Request — {partsRequestLabel(line, index)}
                                        </a>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="mt-2 rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--theme-surface-inset)] p-2 text-[color:var(--theme-text-secondary)]">
                                <div>Parts: <span className="text-[color:var(--theme-text-primary)]">None</span></div>
                                <div>Parts Request: <span className="text-[color:var(--theme-text-primary)]">Not required</span></div>
                              </div>
                            )}
                          </div>

                          {sources.length > 0 ? (
                            <div className="mt-3 rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--theme-surface-inset)] p-3 text-xs text-[color:var(--theme-text-secondary)]">
                              Source inspection metadata: <span className="text-[color:var(--theme-text-primary)]">{sources.join(" • ")}</span>
                            </div>
                          ) : null}

                          {photos.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {photos.map((url) => (
                                <a key={url} href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-sky-300/35 bg-sky-400/10 px-2.5 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-400/15">
                                  Evidence photo
                                </a>
                              ))}
                            </div>
                          ) : null}

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" disabled={finalDecision} onClick={() => setOpenDetails((prev) => ({ ...prev, [line.id]: !prev[line.id] }))} className="desktop-btn-secondary rounded-xl px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-primary)] disabled:opacity-45">
                              {openDetails[line.id] ? "Hide editor" : "Edit quote line"}
                            </button>
                            <button type="button" disabled={finalDecision} onClick={() => markRecommendedReady(line)} className="desktop-btn-secondary rounded-xl px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-primary)] disabled:opacity-45">
                              Recompute ready state
                            </button>
                            {!line.sent_to_customer_at && canSendLine(line) ? <span className="rounded-xl border border-emerald-300/35 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100">Will send</span> : null}
                            {!finalDecision ? <>
                              <button type="button" disabled={!canSendLine(line) && !isSentForDecision(line)} onClick={() => openDecisionDialog(line, "approve")} className="rounded-xl border border-emerald-300/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-45">Approve</button>
                              <button type="button" onClick={() => openDecisionDialog(line, "defer")} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-primary)]">Defer</button>
                              <button type="button" onClick={() => openDecisionDialog(line, "decline")} className="rounded-xl border border-red-400/45 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100">Decline</button>
                            </> : null}
                          </div>

                          {openDetails[line.id] && !finalDecision ? (
                            <div className="desktop-panel-soft mt-3 p-4">
                              <div className={embedded ? "grid gap-3" : "grid gap-3 md:grid-cols-2"}>
                                <label className="text-xs text-[color:var(--theme-text-secondary)]">
                                  Title / description
                                  <input value={line.description ?? ""} onChange={(e) => patchQuoteLine(line.id, { description: e.target.value })} className={inputCls} />
                                </label>
                                <label className="text-xs text-[color:var(--theme-text-secondary)]">
                                  Complaint
                                  <input value={line.ai_complaint ?? ""} onChange={(e) => patchQuoteLine(line.id, { ai_complaint: e.target.value })} className={inputCls} />
                                </label>
                                <label className="text-xs text-[color:var(--theme-text-secondary)]">
                                  Technician notes
                                  <input value={techNotes} onChange={(e) => patchQuoteLineMetadata(line, { technician_notes: e.target.value })} className={inputCls} />
                                </label>
                                <label className="text-xs text-[color:var(--theme-text-secondary)]">
                                  Advisor notes
                                  <input value={line.notes ?? ""} onChange={(e) => patchQuoteLine(line.id, { notes: e.target.value })} className={inputCls} />
                                </label>
                                <label className="text-xs text-[color:var(--theme-text-secondary)]">
                                  Labor hours
                                  <input inputMode="decimal" value={String(laborHours)} onChange={(e) => patchQuoteLine(line.id, { labor_hours: asNumber(e.target.value) ?? 0, est_labor_hours: asNumber(e.target.value) ?? 0 })} className={inputCls} />
                                </label>
                                <label className="text-xs text-[color:var(--theme-text-secondary)]">
                                  Labor rate
                                  <input inputMode="decimal" value={String(lineLaborRate)} onChange={(e) => patchQuoteLine(line.id, { _laborRateDraft: asNumber(e.target.value) ?? 0 })} className={inputCls} />
                                </label>
                                <label className="text-xs text-[color:var(--theme-text-secondary)]">
                                  Labor amount
                                  <input inputMode="decimal" value={String(laborTotal)} onChange={(e) => patchQuoteLine(line.id, { labor_total: asNumber(e.target.value) ?? 0 })} className={inputCls} />
                                </label>
                                <label className="text-xs text-[color:var(--theme-text-secondary)]">
                                  Parts quoted amount
                                  <input inputMode="decimal" value={String(partsTotal)} onChange={(e) => patchQuoteLine(line.id, { parts_total: asNumber(e.target.value) ?? 0 })} className={inputCls} />
                                </label>
                                <label className="text-xs text-[color:var(--theme-text-secondary)]">
                                  Status
                                  <select value={line.status ?? ""} onChange={(e) => patchQuoteLine(line.id, { status: e.target.value })} className={inputCls}>
                                    <option value="pending_parts">pending parts</option>
                                    <option value="quoted">ready / quoted</option>
                                    <option value="sent">sent</option>
                                  </select>
                                </label>
                                <label className="text-xs text-[color:var(--theme-text-secondary)]">
                                  Stage
                                  <select value={line.stage ?? ""} onChange={(e) => patchQuoteLine(line.id, { stage: e.target.value })} className={inputCls}>
                                    <option value="advisor_pending">advisor pending</option>
                                    <option value="ready_to_send">ready to send</option>
                                    <option value="sent">sent</option>
                                  </select>
                                </label>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {workLines.length > 0 ? (
              <div className={`${card} mt-4`}>
                <div className={`border-b ${divider} ${padX} py-3 text-sm font-semibold text-[color:var(--theme-text-primary)]`}>
                  Active approved / punchable work
                </div>
                <div className="divide-y divide-[color:var(--desktop-border)]">
                  {workLines.map((line) => (
                    <div key={line.id} className={`${padX} py-3 text-sm`}>
                      <div className="font-semibold text-[color:var(--theme-text-primary)]">{safeTrim(line.description) || `Line ${line.line_no ?? ""}`}</div>
                      <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">Status: {statusLabel(line.status)} • Approval: {statusLabel(line.approval_state)} • Punchable: {line.punchable ? "yes" : "no"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className={embedded ? "" : "space-y-4"}>
            <div className={card}>
              <div className={`border-b ${divider} ${padX} py-3 text-sm font-semibold text-[color:var(--theme-text-primary)]`}>Quote readiness</div>
              <div className={`${padX} py-4 text-sm text-[color:var(--theme-text-secondary)]`}>
                <div className="flex items-center justify-between"><span>Ready to send</span><span className="font-semibold text-[color:var(--theme-text-primary)]">{quoteTotals.sendable}</span></div>
                <div className="mt-2 flex items-center justify-between"><span>Pending parts</span><span className="font-semibold text-[color:var(--theme-text-primary)]">{quoteTotals.pendingParts}</span></div>
                <div className="mt-2 flex items-center justify-between"><span>Sent</span><span className="font-semibold text-[color:var(--theme-text-primary)]">{quoteTotals.sent}</span></div>
                <div className={`mt-3 flex items-center justify-between border-t ${divider} pt-3`}><span>Labor</span><span className="font-medium text-[color:var(--theme-text-primary)]">{fmt(quoteTotals.labor)}</span></div>
                <div className="mt-2 flex items-center justify-between"><span>Parts</span><span className="font-medium text-[color:var(--theme-text-primary)]">{fmt(quoteTotals.parts)}</span></div>
                <div className="mt-2 flex items-center justify-between"><span>Shop supplies</span><span className="font-medium text-[color:var(--theme-text-primary)]">{fmt(quoteTotals.shopSupplies.amount)}</span></div>
                <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">{shopSuppliesSummaryText(quoteTotals.shopSupplies)}</div>
                <div className={`mt-3 flex items-center justify-between border-t ${divider} pt-3`}><span className="font-semibold text-[color:var(--theme-text-primary)]">Grand total</span><span className="text-lg font-bold" style={{ color: COPPER }}>{fmt(quoteTotals.total)}</span></div>
                <div className={`mt-4 border-t ${divider} pt-3`}>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">Shop supplies override</div>
                  <select
                    value={suppliesEnabledDraft == null ? "default" : suppliesEnabledDraft ? "on" : "off"}
                    onChange={(e) => setSuppliesEnabledDraft(e.target.value === "default" ? null : e.target.value === "on")}
                    className="mt-2 w-full rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none"
                  >
                    <option value="default">Use shop default</option>
                    <option value="on">Include shop supplies</option>
                    <option value="off">Remove shop supplies</option>
                  </select>
                  <input
                    value={suppliesAmountDraft}
                    onChange={(e) => setSuppliesAmountDraft(e.target.value)}
                    placeholder="Optional fixed override amount"
                    className="mt-2 w-full rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)]"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => void saveSuppliesOverride()} disabled={savingSuppliesOverride} className="desktop-btn-secondary rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60">
                      {savingSuppliesOverride ? "Saving…" : "Save override"}
                    </button>
                    <button type="button" onClick={resetSuppliesOverride} className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]">Reset draft</button>
                  </div>
                </div>
                <button onClick={() => void saveAllDirty()} disabled={saving} className="desktop-btn-primary mt-4 w-full rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60">
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>

            <div className={card}>
              <div className={`border-b ${divider} ${padX} py-3 text-sm font-semibold text-[color:var(--theme-text-primary)]`}>Send to customer</div>
              <div className={`${padX} py-4 text-sm text-[color:var(--theme-text-secondary)]`}>
                Sends only canonical work_order_quote_lines that are ready to send. Pending parts, declined, deferred, approved, and converted lines are not sent.
                {quoteTotals.sendable === 0 ? (
                  <div className="mt-3 rounded-xl border border-amber-300/35 bg-amber-400/10 p-3 text-amber-100">No ready canonical quote lines are available to send.</div>
                ) : null}
                {missingCustomerEmail || sendBlocker ? (
                  <div className="mt-3 rounded-xl border border-sky-400/35 bg-sky-500/10 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-100">Blocked</div>
                    <div className="mt-1 text-sm font-semibold text-sky-100">{sendBlocker ?? "Customer email required to send quote"}</div>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input type="email" value={pendingCustomerEmail} onChange={(e) => setPendingCustomerEmail(e.target.value)} placeholder="customer@email.com" className="w-full rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-sky-300/70" />
                      <button type="button" onClick={() => void saveCustomerEmailInline()} disabled={savingCustomerEmail} className="rounded-lg border border-amber-300/45 bg-amber-400/15 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-amber-400/20 disabled:opacity-60">
                        {savingCustomerEmail ? "Saving…" : "Save email"}
                      </button>
                    </div>
                  </div>
                ) : null}
                <button onClick={() => void sendQuoteToCustomer()} disabled={sending || savingCustomerEmail || quoteTotals.sendable === 0} className="desktop-btn-secondary mt-3 w-full rounded-xl px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] disabled:opacity-60">
                  {sending ? "Sending…" : "Send ready quote lines"}
                </button>
                <div className="mt-3 text-xs text-[color:var(--theme-text-muted)]">Portal link will be: <span className="text-[color:var(--theme-text-secondary)]">/portal/quotes/{woId}</span></div>
                <div className="mt-2 text-xs text-[color:var(--theme-text-muted)]">Customer portal decisions and shop-recorded phone decisions use the same canonical approval lifecycle.</div>
              </div>
            </div>

            <div className={card}>
              <div className={`border-b ${divider} ${padX} py-3 text-sm font-semibold text-[color:var(--theme-text-primary)]`}>Quick add job</div>
              <div className={`${padX} py-4 text-sm text-[color:var(--theme-text-secondary)]`}>
                Add active work only when intentionally needed. Inspection recommendations should stay in canonical quote lines until customer approval/materialization.
                <button type="button" onClick={openAddJobWithPrefill} className="desktop-btn-primary mt-3 w-full rounded-xl px-4 py-2 text-sm font-semibold">+ Add job line</button>
              </div>
            </div>
          </div>
        </div>

        {!embedded && <div className="mt-6 text-xs text-[color:var(--theme-text-muted)]">Work Order ID: {wo.id} • Status: {statusLabel(wo.status)}</div>}

        {decisionDialog ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-labelledby="shop-decision-title">
            <div className="w-full max-w-lg rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--theme-surface-overlay)] p-5 shadow-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">Classic shop approval</div>
              <h2 id="shop-decision-title" className="mt-2 text-lg font-semibold text-[color:var(--theme-text-primary)]">Record {statusLabel(decisionDialog.decision)} — {safeTrim(decisionDialog.line.description) || "quote line"}</h2>
              <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">Use this after confirming the customer&apos;s decision outside the portal. The advisor, contact method, time, and note are retained with the quote.</p>
              <label className="mt-4 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
                Customer contact method
                <select value={decisionContact} onChange={(event) => setDecisionContact(event.target.value as ContactMethod)} className={inputCls}>
                  <option value="phone">Phone call</option><option value="in_person">In person</option><option value="email">Email</option><option value="other">Other</option>
                </select>
              </label>
              <label className="mt-3 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
                Advisor note (optional)
                <textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value.slice(0, 1000))} rows={3} placeholder="Example: Approved by phone with Jamie at 2:15 PM." className={inputCls} />
              </label>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" disabled={decisionSaving} onClick={() => setDecisionDialog(null)} className="desktop-btn-secondary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">Cancel</button>
                <button type="button" disabled={decisionSaving} onClick={() => void confirmShopDecision()} className={decisionDialog.decision === "decline" ? "rounded-xl border border-red-400/45 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-100 disabled:opacity-50" : "desktop-btn-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"}>{decisionSaving ? "Recording…" : `Confirm ${statusLabel(decisionDialog.decision)}`}</button>
              </div>
            </div>
          </div>
        ) : null}

        <AddJobModal
          isOpen={addJobOpen}
          onClose={() => setAddJobOpen(false)}
          workOrderId={wo.id}
          vehicleId={wo.vehicle_id}
          shopId={wo.shop_id}
          techId={currentUserId}
          onJobAdded={() => {
            setAddJobOpen(false);
            void reload();
          }}
        />
      </div>
    </div>
  );
}
