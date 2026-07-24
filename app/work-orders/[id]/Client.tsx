// /app/work-orders/[id]/Client.tsx (FULL FILE REPLACEMENT)

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import dynamic from "next/dynamic";

import { supabaseBrowser as supabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import FocusedJobModal from "@/features/work-orders/components/workorders/FocusedJobModal";
import DeleteOrVoidLineModal from "@/features/work-orders/components/workorders/DeleteOrVoidLineModal";
import VoiceContextSetter from "@/features/shared/voice/VoiceContextSetter";
import { useTabState } from "@/features/shared/hooks/useTabState";
import PartsDrawer from "@/features/parts/components/PartsDrawer";
import AssignTechModal from "@/features/work-orders/components/workorders/extras/AssignTechModal";
import { JobCard } from "@/features/work-orders/components/JobCard";
import WorkOrderAiOperationalRecommendations from "@/features/work-orders/components/WorkOrderAiOperationalRecommendations";
import WorkOrderAiFreshnessBadge from "@/features/work-orders/components/WorkOrderAiFreshnessBadge";
import PageShell from "@/features/shared/components/PageShell";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";
import DecisionTimeline, {
  type DecisionTimelineStage,
} from "@/features/shared/components/ui/DecisionTimeline";
import DecisionEventFeed from "@/features/shared/components/ui/DecisionEventFeed";
import { PANEL_VARIANTS } from "@/features/shared/components/ui/panelHierarchy";
import { cn } from "@shared/lib/utils";
import { formatDecisionStatus, resolveDecisionStatus } from "@/features/shared/lib/decisionStatus";
import { deriveEventsFromWorkOrder } from "@/features/shared/lib/decisionEvents";
import { resolveWorkOrderLinePricing } from "@/features/work-orders/lib/pricing/resolveWorkOrderLinePricing";
import { filterAllocationsNotBackedByCanonicalParts } from "@/features/work-orders/lib/display/workOrderParts";
import { isReviewableQuoteLine } from "@/features/work-orders/lib/quotes/reviewableQuoteLines";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { useTabs } from "@/features/shared/components/tabs/TabsProvider";

import { prepareSectionsWithCornerGrid } from "@inspections/lib/inspection/prepareSectionsWithCornerGrid";

// inspection modal
const InspectionModal = dynamic(
  () => import("@/features/inspections/components/InspectionModal"),
  { ssr: false },
);

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderQuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type WorkOrderQuoteLineWithLineId = WorkOrderQuoteLine & {
  work_order_line_id?: string | null;
};
type WorkOrderShopRateRow = Pick<DB["public"]["Tables"]["shops"]["Row"], "labor_rate">;
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type AllocationRow =
  DB["public"]["Tables"]["work_order_part_allocations"]["Row"] & {
    parts?: { name: string | null } | null;
  };
type WorkOrderPartRow = DB["public"]["Tables"]["work_order_parts"]["Row"] & {
  description_snapshot?: string | null;
  manufacturer_snapshot?: string | null;
  part_number_snapshot?: string | null;
  unit_sell_price_snapshot?: number | null;
  lifecycle_status?: string | null;
  is_active?: boolean | null;
  source_parts_request_item_id?: string | null;
  parts?: { name: string | null; sku?: string | null; part_number?: string | null; manufacturer?: string | null } | null;
};
type LineTechRow = DB["public"]["Tables"]["work_order_line_technicians"]["Row"];
type PartRequestRow = Pick<
  DB["public"]["Tables"]["part_requests"]["Row"],
  "id" | "quote_line_id" | "job_id" | "status"
>;

type WorkOrderLineWithInspectionMeta = WorkOrderLine & {
  // real DB column
  inspection_template_id?: string | null;

  // older / alternate fields we may have used in earlier iterations
  inspection_template?: string | null;
  inspectionTemplate?: string | null;
  template?: string | null;
  metadata?: {
    inspection_template?: string | null;
    template?: string | null;
  } | null;
  metadata2?: {
    inspection_template?: string | null;
    template?: string | null;
  } | null;
};
type JobLinePriority = "low" | "normal" | "high" | "urgent";


type PropertyContext = {
  requestId: string;
  requestTitle: string | null;
  requestStatus: string | null;
  severity: string | null;
  category: string | null;
  preferredWindow: string | null;
  accessNotes: string | null;
  propertyName: string | null;
  unitLabel: string | null;
  assetName: string | null;
  assetType: string | null;
  latestVendorAssignment: string | null;
};

const looksLikeUuid = (s: string) => s.includes("-") && s.length >= 36;

function splitCustomId(raw: string): { prefix: string; n: number | null } {
  const m = raw.toUpperCase().match(/^([A-Z]+)\s*0*?(\d+)?$/);
  if (!m) return { prefix: raw.toUpperCase(), n: null };
  const n = m[2] ? parseInt(m[2], 10) : null;
  return { prefix: m[1], n: Number.isFinite(n!) ? n : null };
}

function isCompletedLineStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "completed" || normalized === "ready_to_invoice" || normalized === "invoiced";
}

function partsRequestActionLabel(requests: PartRequestRow[]): string {
  if (requests.length === 0) return "Request all parts";
  const statuses = new Set(
    requests.map((request) => String(request.status ?? "requested").toLowerCase()),
  );
  if (statuses.has("fulfilled")) return "Parts handed off";
  if (
    statuses.has("approved") ||
    statuses.has("partially_ordered") ||
    statuses.has("partially_consumed") ||
    statuses.has("partially_returned")
  ) {
    return "Open Pick / Order";
  }
  if (statuses.has("quoted")) return "Awaiting approval";
  if (statuses.has("rejected") || statuses.has("cancelled")) return "View parts history";
  return "Parts requested";
}

/** Normalize “where is the inspection template id stored for this line?” */
function extractInspectionTemplateId(ln: WorkOrderLineWithInspectionMeta): string | null {
  return (
    ln.inspection_template_id ??
    ln.inspection_template ??
    ln.inspectionTemplate ??
    ln.template ??
    ln.metadata?.inspection_template ??
    ln.metadata?.template ??
    ln.metadata2?.inspection_template ??
    ln.metadata2?.template ??
    null
  );
}

// ----------------- Inspection template helpers -----------------

type TemplateSectionItem = { item: string; unit?: string | null };
type TemplateSection = { title: string; items: TemplateSectionItem[] };

// roles allowed to assign jobs

// roles allowed to delete/void lines
const LINE_DELETE_ROLES = new Set(["owner", "admin", "manager", "advisor"]);

/* ----------------------- AI review icon support ----------------------- */

type ReviewIssue = { kind: string; message: string; lineId?: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}
function asString(x: unknown): string | undefined {
  if (typeof x === "string") return x;
  if (typeof x === "number") return String(x);
  return undefined;
}
function toReviewIssues(raw: unknown): ReviewIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: ReviewIssue[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const kind = asString(item.kind) ?? "issue";
    const message =
      asString(item.message) ??
      asString(item.reason) ??
      asString(item.detail) ??
      "Review issue";
    const lineId =
      asString(item.lineId) ??
      asString(item.workOrderLineId) ??
      asString(item.work_order_line_id) ??
      asString(item.line_id) ??
      undefined;
    out.push({ kind, message, lineId });
  }
  return out;
}
function groupIssuesByLine(issues: ReviewIssue[]): Record<string, ReviewIssue[]> {
  const m: Record<string, ReviewIssue[]> = {};
  for (const it of issues) {
    if (!it.lineId) continue;
    if (!m[it.lineId]) m[it.lineId] = [];
    m[it.lineId].push(it);
  }
  return m;
}

/* ------------------------------------------------------------------------- */

export default function WorkOrderIdClient(): JSX.Element {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { updateActiveTab } = useTabs();

  const routeId = (params?.id as string) || "";

  const [wo, setWo] = useTabState<WorkOrder | null>("wo:id:wo", null);
  const [lines, setLines] = useTabState<WorkOrderLine[]>("wo:id:lines", []);
  const [quoteLines, setQuoteLines] = useTabState<WorkOrderQuoteLine[]>(
    "wo:id:quoteLines",
    [],
  );
  const [vehicle, setVehicle] = useTabState<Vehicle | null>("wo:id:veh", null);
  const [customer, setCustomer] = useTabState<Customer | null>("wo:id:cust", null);
  const [shopLaborRate, setShopLaborRate] = useState<number | null>(null);

  const [allocsByLine, setAllocsByLine] = useState<Record<string, AllocationRow[]>>({});
  const [stagedPartsByLine, setStagedPartsByLine] = useState<Record<string, WorkOrderPartRow[]>>({});
  const [partRequestsByQuoteLine, setPartRequestsByQuoteLine] = useState<Record<string, PartRequestRow[]>>({});
  const [partRequestsByLine, setPartRequestsByLine] = useState<Record<string, PartRequestRow[]>>({});
  const [requestingPartsLineId, setRequestingPartsLineId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadedOnce, setLoadedOnce] = useState<boolean>(false);
  const [viewError, setViewError] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useTabState<string | null>("wo:id:uid", null);
  const [, setUserId] = useTabState<string | null>("wo:id:effectiveUid", null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  // ✅ prevents “logged out” banner flashing / sticking
  const [authChecked, setAuthChecked] = useState<boolean>(false);

  const [showDetails] = useTabState<boolean>("wo:showDetails", false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showApprovalSummary, setShowApprovalSummary] = useState(false);
  const [showWoContext, setShowWoContext] = useState(false);

  // ✅ focused job
  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);
  const [focusedOpen, setFocusedOpen] = useState(false);
  const [warnedMissing, setWarnedMissing] = useState(false);

  // ✅ panel breakpoint (tracks resize)
  const [prefersPanel, setPrefersPanel] = useState(false);

  // parts
  const [partsLineId, setPartsLineId] = useState<string | null>(null);

  // inspection
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionSrc, setInspectionSrc] = useState<string | null>(null);

  // assign mechanic
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignLineId] = useState<string | null>(null);

  // delete/void line modal
  const [delOpen, setDelOpen] = useState(false);
  const [delLineId, setDelLineId] = useState<string | null>(null);

  const [assignables, setAssignables] = useState<
    Array<Pick<Profile, "id" | "full_name" | "role">>
  >([]);

  // per-line technicians
  const [lineTechsByLine, setLineTechsByLine] = useState<Record<string, string[]>>({});

  // ✅ AI review state for status icons
  const [, setReviewChecked] = useState<boolean>(false);
  const [reviewOk, setReviewOk] = useState<boolean | undefined>(undefined);
  const [reviewIssuesByLine, setReviewIssuesByLine] = useState<Record<string, ReviewIssue[]>>(
    {},
  );
  const [propertyContext, setPropertyContext] = useState<PropertyContext | null>(null);
  const isPropertySourcedWorkOrder = propertyContext !== null;

  // ✅ read job from query (desktop panel)
  const jobFromQuery = searchParams?.get("job") || null;

  useEffect(() => {
    if (!wo) return;
    const customerName =
      customer?.business_name?.trim() ||
      customer?.name?.trim() ||
      [customer?.first_name ?? "", customer?.last_name ?? ""]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      wo.customer_name?.trim() ||
      "";
    const vehicleLabel = vehicle
      ? [vehicle.year, vehicle.make, vehicle.model]
          .filter((value) => value != null && String(value).trim())
          .join(" ")
      : "";
    const workOrderLabel = wo.custom_id?.trim() || `WO-${wo.id.slice(0, 8)}`;

    updateActiveTab({
      title: customerName
        ? `${workOrderLabel} · ${customerName}`
        : workOrderLabel,
      subtitle: vehicleLabel || undefined,
      status: formatDecisionStatus({ workStatus: wo.status }).label,
    });
  }, [customer, updateActiveTab, vehicle, wo]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setPrefersPanel(mq.matches);

    update();

    // Safari/iOS: addListener fallback
    try {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    } catch {
      mq.addListener(update);
      return () => mq.removeListener(update);
    }
  }, []);

  // ✅ keep local focusedJobId in sync with query when in panel mode
  useEffect(() => {
    if (!prefersPanel) return;
    setFocusedJobId(jobFromQuery);
    // modal should be closed on desktop
    setFocusedOpen(false);
  }, [jobFromQuery, prefersPanel]);

  const fetchLatestReview = useCallback(async (workOrderId: string) => {
    if (!workOrderId) return;

    try {
      const { data, error } = await supabase
        .from("work_order_invoice_reviews")
        .select("ok, issues, created_at")
        .eq("work_order_id", workOrderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        setReviewChecked(true);
        setReviewOk(undefined);
        setReviewIssuesByLine({});
        return;
      }

      const issues = toReviewIssues((data as unknown as { issues?: unknown }).issues);
      setReviewChecked(true);
      setReviewOk(Boolean((data as unknown as { ok?: unknown }).ok));
      setReviewIssuesByLine(groupIssuesByLine(issues));
    } catch {
      setReviewChecked(true);
      setReviewOk(undefined);
      setReviewIssuesByLine({});
    }
  }, []);

  const openFocusedJob = useCallback(
    (lineId: string) => {
      if (!lineId) return;

      if (prefersPanel) {
        // ✅ IMPORTANT: keep SAME route; just swap query param so it DOES NOT create a new tab
        router.replace(`/work-orders/${routeId}?job=${encodeURIComponent(lineId)}`);
        return;
      }

      // ✅ modal (mobile)
      setFocusedJobId(lineId);
      setFocusedOpen(true);
    },
    [prefersPanel, router, routeId],
  );

  const closeFocusedPanel = useCallback(() => {
    router.replace(`/work-orders/${routeId}`);
  }, [router, routeId]);

  const openQuoteReview = useCallback(() => {
    router.push(`/quote-review/${wo?.id ?? routeId}`);
  }, [router, routeId, wo?.id]);

  /* ---------------------- AUTH + assignables ---------------------- */
  useEffect(() => {
    let mounted = true;

    const waitForSession = async () => {
      let {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 150 * (i + 1)));
          const res = await supabase.auth.getSession();
          session = res.data.session;
          if (session) break;
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!mounted) return;

      const uid = user?.id ?? null;
      setCurrentUserId(uid);
      setUserId(uid);
      setAuthChecked(true);

      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .maybeSingle();
        setCurrentUserRole(prof?.role ?? null);
      }

      try {
        const res = await fetch("/api/assignables");
        const json = (await res.json().catch(() => null)) as
          | { data?: Array<Pick<Profile, "id" | "full_name" | "role">> }
          | null;
        if (res.ok && Array.isArray(json?.data)) {
          setAssignables(json.data);
        }
      } catch {
        // ignore
      }

      if (!uid) setLoading(false);
    };

    void waitForSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (s?.user) void waitForSession();
      else {
        setCurrentUserId(null);
        setUserId(null);
        setAuthChecked(true);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [routeId, setCurrentUserId, setUserId]);

  /* ---------------------- FETCH ---------------------- */
  const fetchAll = useCallback(
    async (retry = 0) => {
      if (!routeId) return;
      setLoading(true);
      setViewError(null);

      try {
        let woRow: WorkOrder | null = null;

        // by UUID
        if (looksLikeUuid(routeId)) {
          const { data, error } = await supabase
            .from("work_orders")
            .select("*")
            .eq("id", routeId)
            .maybeSingle();
          if (!error) woRow = (data as WorkOrder | null) ?? null;
        }

        // by custom_id
        if (!woRow) {
          const eqRes = await supabase
            .from("work_orders")
            .select("*")
            .eq("custom_id", routeId)
            .maybeSingle();
          woRow = (eqRes.data as WorkOrder | null) ?? null;

          if (!woRow) {
            const ilikeRes = await supabase
              .from("work_orders")
              .select("*")
              .ilike("custom_id", routeId.toUpperCase())
              .maybeSingle();
            woRow = (ilikeRes.data as WorkOrder | null) ?? null;
          }

          if (!woRow) {
            const { prefix, n } = splitCustomId(routeId);
            if (n !== null) {
              const { data: cands } = await supabase
                .from("work_orders")
                .select("*")
                .ilike("custom_id", `${prefix}%`)
                .limit(50);
              const wanted = `${prefix}${n}`;
              const match = (cands ?? []).find(
                (r) =>
                  (r.custom_id ?? "")
                    .toUpperCase()
                    .replace(/^([A-Z]+)0+/, "$1") === wanted,
              );
              if (match) woRow = match as WorkOrder;
            }
          }
        }

        if (!woRow) {
          if (retry < 2) {
            await new Promise((r) => setTimeout(r, 200 * Math.pow(2, retry)));
            return fetchAll(retry + 1);
          }
          setViewError("Work order not visible / not found.");
          if (!loadedOnce) {
            setWo(null);
            setLines([]);
            setQuoteLines([]);
            setVehicle(null);
            setCustomer(null);
            setShopLaborRate(null);
            setAllocsByLine({});
            setStagedPartsByLine({});
            setPartRequestsByQuoteLine({});
            setLineTechsByLine({});
          }

          // ✅ reset review state
          setReviewChecked(true);
          setReviewOk(undefined);
          setReviewIssuesByLine({});

          setLoading(false);
          return;
        }

        setWo(woRow);

        // ✅ reset review state until loaded for this WO
        setReviewChecked(false);
        setReviewOk(undefined);
        setReviewIssuesByLine({});

        if (!warnedMissing && (!woRow.vehicle_id || !woRow.customer_id)) {
          toast.error(
            "This work order is missing vehicle and/or customer. Open the Create form to set them.",
          );
          setWarnedMissing(true);
        }

        const [linesRes, quoteRes, vehRes, custRes, shopRes, propertyReqRes] = await Promise.all([
          supabase
            .from("work_order_lines")
            .select("*")
            .eq("work_order_id", woRow.id)
            .order("created_at", { ascending: true }),
          supabase
            .from("work_order_quote_lines")
            .select("*")
            .eq("work_order_id", woRow.id)
            .order("created_at", { ascending: true }),
          woRow.vehicle_id
            ? supabase
                .from("vehicles")
                .select("*")
                .eq("id", woRow.vehicle_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null } as const),
          woRow.customer_id
            ? supabase
                .from("customers")
                .select("*")
                .eq("id", woRow.customer_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null } as const),
          woRow.shop_id
            ? supabase
                .from("shops")
                .select("labor_rate")
                .eq("id", woRow.shop_id)
                .maybeSingle<WorkOrderShopRateRow>()
            : Promise.resolve({ data: null, error: null } as const),
          supabase
            .from("property_maintenance_requests")
            .select("*")
            .eq("work_order_id", woRow.id)
            .maybeSingle(),
        ]);

        if (linesRes.error) throw linesRes.error;
        const lineRows = (linesRes.data ?? []) as WorkOrderLine[];
        setLines(lineRows);

        if (quoteRes.error) throw quoteRes.error;
        const quoteRows = (quoteRes.data ?? []) as WorkOrderQuoteLine[];
        setQuoteLines(quoteRows);

        if (vehRes?.error) throw vehRes.error;
        setVehicle((vehRes?.data as Vehicle | null) ?? null);

        if (custRes?.error) throw custRes.error;
        setCustomer((custRes?.data as Customer | null) ?? null);

        if (shopRes?.error) throw shopRes.error;
        setShopLaborRate(
          typeof shopRes?.data?.labor_rate === "number" && Number.isFinite(shopRes.data.labor_rate)
            ? shopRes.data.labor_rate
            : null,
        );

        if (propertyReqRes?.error) throw propertyReqRes.error;
        const propertyRequest = (propertyReqRes?.data as Record<string, unknown> | null) ?? null;
        if (!propertyRequest) {
          setPropertyContext(null);
        } else {
          const requestId = String(propertyRequest.id ?? "");
          const [propertyRes, unitRes, assetRes, assignmentRes] = await Promise.all([
            propertyRequest.property_id
              ? supabase.from("property_properties").select("name").eq("id", String(propertyRequest.property_id)).maybeSingle()
              : Promise.resolve({ data: null, error: null } as const),
            propertyRequest.unit_id
              ? supabase.from("property_units").select("label").eq("id", String(propertyRequest.unit_id)).maybeSingle()
              : Promise.resolve({ data: null, error: null } as const),
            propertyRequest.asset_id
              ? supabase.from("property_assets").select("name, asset_type").eq("id", String(propertyRequest.asset_id)).maybeSingle()
              : Promise.resolve({ data: null, error: null } as const),
            supabase
              .from("property_vendor_assignments")
              .select("vendor_id, created_at")
              .eq("property_request_id", requestId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);

          if (propertyRes?.error) throw propertyRes.error;
          if (unitRes?.error) throw unitRes.error;
          if (assetRes?.error) throw assetRes.error;
          if (assignmentRes?.error) throw assignmentRes.error;

          let latestVendorAssignment: string | null = null;
          const latestAssignment = assignmentRes.data as { vendor_id?: string | null } | null;
          if (latestAssignment?.vendor_id) {
            const vendorRes = await supabase
              .from("property_vendors")
              .select("name")
              .eq("id", latestAssignment.vendor_id)
              .maybeSingle();
            if (vendorRes.error) throw vendorRes.error;
            latestVendorAssignment = (vendorRes.data as { name?: string | null } | null)?.name ?? null;
          }

          setPropertyContext({
            requestId,
            requestTitle: (propertyRequest.title as string | null) ?? null,
            requestStatus: (propertyRequest.status as string | null) ?? null,
            severity: (propertyRequest.severity as string | null) ?? null,
            category: (propertyRequest.category as string | null) ?? null,
            preferredWindow: (propertyRequest.preferred_window as string | null) ?? null,
            accessNotes: (propertyRequest.access_notes as string | null) ?? null,
            propertyName: (propertyRes.data as { name?: string | null } | null)?.name ?? null,
            unitLabel: (unitRes.data as { label?: string | null } | null)?.label ?? null,
            assetName: (assetRes.data as { name?: string | null } | null)?.name ?? null,
            assetType: (assetRes.data as { asset_type?: string | null } | null)?.asset_type ?? null,
            latestVendorAssignment,
          });
        }

        // allocations + line techs
        if (lineRows.length) {
          const [allocsQuery, stagedQuery, lineTechsQuery, partRequestsQuery] = await Promise.all([
            supabase
              .from("work_order_part_allocations")
              .select("*, parts(name)")
              .in(
                "work_order_line_id",
                lineRows.map((l) => l.id),
              ),

            // ✅ staged/quoted parts from menu quick add (NOT allocated inventory)
            supabase
              .from("work_order_parts")
              .select("*, parts(name, sku, part_number, manufacturer, supplier)")
              .eq("work_order_id", woRow.id)
              .eq("shop_id", woRow.shop_id)
              .eq("is_active", true)
              .in(
                "work_order_line_id",
                lineRows.map((l) => l.id),
              ),

            supabase
              .from("work_order_line_technicians")
              .select("work_order_line_id, technician_id")
              .in(
                "work_order_line_id",
                lineRows.map((l) => l.id),
              ),

            supabase
              .from("part_requests")
              .select("id, quote_line_id, job_id, status")
              .eq("work_order_id", woRow.id)
              .eq("shop_id", woRow.shop_id),
          ]);

          const byLine: Record<string, AllocationRow[]> = {};
          (allocsQuery.data ?? []).forEach((a) => {
            const row = a as AllocationRow;
            const key = row.work_order_line_id;
            if (!byLine[key]) byLine[key] = [];
            byLine[key].push(row);
          });
          setAllocsByLine(byLine);

          const stagedByLine: Record<string, WorkOrderPartRow[]> = {};
          (stagedQuery.data ?? []).forEach((p) => {
            const row = p as WorkOrderPartRow;
            const key = row.work_order_line_id;
            if (!key) return;
            if (!stagedByLine[key]) stagedByLine[key] = [];
            stagedByLine[key].push(row);
          });
          setStagedPartsByLine(stagedByLine);

          const techMap: Record<string, string[]> = {};
          (lineTechsQuery.data as LineTechRow[] | null)?.forEach((lt) => {
            const lnId = lt.work_order_line_id;
            const techId = lt.technician_id;
            if (!techMap[lnId]) techMap[lnId] = [];
            if (!techMap[lnId].includes(techId)) {
              techMap[lnId].push(techId);
            }
          });
          setLineTechsByLine(techMap);

          const requestsByQuote: Record<string, PartRequestRow[]> = {};
          const requestsByLine: Record<string, PartRequestRow[]> = {};
          (partRequestsQuery.data as PartRequestRow[] | null)?.forEach((request) => {
            const quoteLineId = request.quote_line_id;
            if (quoteLineId) {
              if (!requestsByQuote[quoteLineId]) requestsByQuote[quoteLineId] = [];
              requestsByQuote[quoteLineId].push(request);
            }
            const lineId = request.job_id;
            if (lineId) {
              if (!requestsByLine[lineId]) requestsByLine[lineId] = [];
              requestsByLine[lineId].push(request);
            }
          });
          setPartRequestsByQuoteLine(requestsByQuote);
          setPartRequestsByLine(requestsByLine);
        } else {
          setAllocsByLine({});
          setStagedPartsByLine({});
          setPartRequestsByQuoteLine({});
          setPartRequestsByLine({});
          setLineTechsByLine({});
        }

        // ✅ load latest AI invoice review (drives status icons in JobCard)
        void fetchLatestReview(woRow.id);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to load work order.";
        setViewError(msg);
        // eslint-disable-next-line no-console
        console.error("[WO id page] load error:", e);
      } finally {
        setLoading(false);
        setLoadedOnce(true);
      }
    },
    [
      routeId,
      warnedMissing,
      setWo,
      setLines,
      setQuoteLines,
      setVehicle,
      setCustomer,
      setShopLaborRate,
      fetchLatestReview,
      loadedOnce,
      setReviewChecked,
    ],
  );

  useEffect(() => {
    if (!routeId) return;
    void fetchAll();
  }, [fetchAll, routeId]);

  /* ---------------------- REALTIME ---------------------- */
  useEffect(() => {
    if (!wo?.id) return;

    const ch = supabase
      .channel(`wo:${wo.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_orders",
          filter: `id=eq.${wo.id}`,
        },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_lines",
          filter: `work_order_id=eq.${wo.id}`,
        },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_parts",
          filter: `work_order_id=eq.${wo.id}`,
        },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_part_allocations",
        },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_line_technicians",
        },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_quote_lines",
          filter: `work_order_id=eq.${wo.id}`,
        },
        () => fetchAll(),
      )
      // ✅ refresh review icons when a new review row is inserted
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_invoice_reviews",
          filter: `work_order_id=eq.${wo.id}`,
        },
        () => fetchLatestReview(wo.id),
      )
      .subscribe();

    const local = () => fetchAll();
    window.addEventListener("wo:parts-used", local);

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        //
      }
      window.removeEventListener("wo:parts-used", local);
    };
  }, [wo?.id, fetchAll, fetchLatestReview]);

  // ---------- listen for inspection finish ----------
  useEffect(() => {
    interface InspectionCompletedEventDetail {
      workOrderLineId?: string;
      work_order_line_id?: string;
      lineId?: string;
      cause?: string;
      correction?: string;
    }

    const handler = (ev: CustomEvent<InspectionCompletedEventDetail>) => {
      const d = ev.detail || {};
      const lineId = d.workOrderLineId || d.work_order_line_id || d.lineId;
      if (!lineId) return;

      // ✅ open focused job (panel on desktop, modal on mobile)
      openFocusedJob(lineId);

      window.dispatchEvent(
        new CustomEvent("wo:prefill-cause-correction", {
          detail: {
            lineId,
            cause: d.cause ?? "",
            correction: d.correction ?? "",
          },
        }),
      );
    };

    window.addEventListener("inspection:completed", handler as EventListener);
    return () => {
      window.removeEventListener("inspection:completed", handler as EventListener);
    };
  }, [openFocusedJob]);

  // ---------- close inspection modal ----------
  useEffect(() => {
    const close = () => {
      setInspectionOpen(false);
      setInspectionSrc(null);
    };

    window.addEventListener("inspection:close", close);
    window.addEventListener("inspection:completed", close);

    return () => {
      window.removeEventListener("inspection:close", close);
      window.removeEventListener("inspection:completed", close);
    };
  }, []);

  // 🔁 refresh this page when a parts request is submitted from the focused modal
  useEffect(() => {
    const handler = () => {
      void fetchAll();
    };
    window.addEventListener("parts-request:submitted", handler);
    return () => window.removeEventListener("parts-request:submitted", handler);
  }, [fetchAll]);

  /* ----------------------- Derived data ----------------------- */

  const activeQuotesByLine = useMemo(() => {
    const m: Record<string, WorkOrderQuoteLine[]> = {};

    (quoteLines as WorkOrderQuoteLineWithLineId[]).forEach((q) => {
      const status = (q.status ?? "").toLowerCase();
      if (status === "converted" || status === "declined") return;

      const lineId = q.work_order_line_id ?? null;
      if (!lineId) return;

      if (!m[lineId]) m[lineId] = [];
      m[lineId].push(q);
    });

    return m;
  }, [quoteLines]);

  const pricingByLine = useMemo(() => {
    const byLine: Record<string, { laborTotal: number; partsTotal: number; lineTotal: number }> = {};
    for (const line of lines) {
      const quoteCandidates = activeQuotesByLine[line.id] ?? [];
      const quote = quoteCandidates[quoteCandidates.length - 1];
      const resolved = resolveWorkOrderLinePricing({
        line,
        quote,
        shopLaborRate,
        stagedParts: stagedPartsByLine[line.id] ?? [],
        allocatedParts: filterAllocationsNotBackedByCanonicalParts(allocsByLine[line.id] ?? [], stagedPartsByLine[line.id] ?? []),
      });
      byLine[line.id] = {
        laborTotal: resolved.laborTotal,
        partsTotal: resolved.partsTotal,
        lineTotal: resolved.lineTotal,
      };
    }
    return byLine;
  }, [activeQuotesByLine, allocsByLine, lines, shopLaborRate, stagedPartsByLine]);

  const isPendingApprovalLine = (l: WorkOrderLine) => {
    const a = (l.approval_state ?? "").toLowerCase();
    const s = (l.status ?? "").toLowerCase();
    return a === "pending" || s === "waiting_for_approval" || s === "awaiting_approval";
  };

  const jobLines = useMemo(
    () => lines.filter((line) => (line.line_type ?? "job") !== "info"),
    [lines],
  );
  const infoLines = useMemo(
    () => lines.filter((line) => (line.line_type ?? "job") === "info"),
    [lines],
  );

  const approvalPending = useMemo(() => jobLines.filter(isPendingApprovalLine), [jobLines]);

  const activeJobLines = useMemo(() => jobLines, [jobLines]);

  const approvalPendingQuotes = useMemo(
    () => quoteLines.filter((q) => isReviewableQuoteLine(q)),
    [quoteLines],
  );

  const hasAnyApprovalItems = approvalPending.length > 0 || approvalPendingQuotes.length > 0;
  const recentApprovalPending = useMemo(() => approvalPending.slice(0, 2), [approvalPending]);
  const recentApprovalPendingQuotes = useMemo(
    () => approvalPendingQuotes.slice(0, 2),
    [approvalPendingQuotes],
  );
  const decisionTimelineStages = useMemo<DecisionTimelineStage[]>(() => {
    const hasRecommendedLines = jobLines.length > 0;
    const hasAwaitingApproval = jobLines.some(
      (line) =>
        resolveDecisionStatus({
          approvalState: line.approval_state,
          workStatus: line.status,
        }) === "awaiting_approval",
    );
    const hasDeclined = jobLines.some(
      (line) =>
        resolveDecisionStatus({
          approvalState: line.approval_state,
          workStatus: line.status,
        }) === "declined",
    );
    const hasInProgress = jobLines.some(
      (line) =>
        resolveDecisionStatus({
          approvalState: line.approval_state,
          workStatus: line.status,
        }) === "in_progress",
    );
    const isCompleted =
      resolveDecisionStatus({ workStatus: wo?.status ?? null }) === "completed";

    return [
      { key: "inspection", label: "Inspection completed", state: "past" },
      {
        key: "recommendation",
        label: "Recommendation issued",
        state: hasRecommendedLines ? "past" : "future",
      },
      {
        key: "approval",
        label: hasDeclined ? "Declined" : "Awaiting approval",
        state: hasAwaitingApproval ? "current" : hasDeclined || hasInProgress || isCompleted ? "past" : "future",
      },
      {
        key: "execution",
        label: "Work started",
        state: hasInProgress ? "current" : isCompleted ? "past" : "future",
      },
      {
        key: "completed",
        label: "Completed",
        state: isCompleted ? "current" : "future",
      },
    ];
  }, [jobLines, wo?.status]);
  const decisionEvents = useMemo(
    () =>
      deriveEventsFromWorkOrder({
        workOrder: wo,
        lines: jobLines,
        actorLabel: "Service team",
      }),
    [wo, jobLines],
  );

  const sortedLines = useMemo(() => {
    const pr: Record<string, number> = {
      diagnosis: 1,
      inspection: 2,
      maintenance: 3,
      repair: 4,
    };
    const baseSorted = [...activeJobLines].sort((a, b) => {
      const pa = pr[String(a.job_type ?? "repair")] ?? 999;
      const pb = pr[String(b.job_type ?? "repair")] ?? 999;
      if (pa !== pb) return pa - pb;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });

    const activeForCurrentTech = baseSorted.find((line) => {
      const punchedIn = Boolean(line.punched_in_at) && !line.punched_out_at;
      if (!punchedIn || isCompletedLineStatus(line.status)) return false;

      if (!currentUserId) return true;

      const assignedTechId =
        typeof (line as { assigned_tech_id?: string | null }).assigned_tech_id === "string"
          ? (line as { assigned_tech_id?: string | null }).assigned_tech_id
          : null;
      const linkedTechIds = lineTechsByLine[line.id] ?? [];
      return assignedTechId === currentUserId || linkedTechIds.includes(currentUserId);
    });

    const pinnedActiveId = activeForCurrentTech?.id ?? null;
    const nonCompleted = baseSorted.filter(
      (line) => !isCompletedLineStatus(line.status) && line.id !== pinnedActiveId,
    );
    const completed = baseSorted.filter(
      (line) => isCompletedLineStatus(line.status) && line.id !== pinnedActiveId,
    );

    if (activeForCurrentTech) {
      return [activeForCurrentTech, ...nonCompleted, ...completed];
    }
    return [...nonCompleted, ...completed];
  }, [activeJobLines, currentUserId, lineTechsByLine]);

  useEffect(() => {
    if (!prefersPanel) return;
    if (jobFromQuery) return;
    if (sortedLines.length === 0) return;
    const fallbackLineId = sortedLines[0]?.id;
    if (!fallbackLineId) return;
    router.replace(`/work-orders/${routeId}?job=${encodeURIComponent(fallbackLineId)}`);
  }, [prefersPanel, jobFromQuery, sortedLines, routeId, router]);

  const createdAt = wo?.created_at ? new Date(wo.created_at) : null;
  const createdAtText =
    createdAt && !Number.isNaN(createdAt.getTime()) ? format(createdAt, "PPpp") : "—";
  const expectedCompletionText = wo?.expected_completion_at
    ? format(new Date(wo.expected_completion_at), "PPpp")
    : "—";

  const currentActor = getActorCapabilities({ role: currentUserRole });
  const canAssign = currentActor.canAssignWork;
  const canApprove = currentActor.canAuthorizeQuotes;
  const canRequestParts = currentActor.canManageWorkOrders;

  const canDeleteLine = currentUserRole ? LINE_DELETE_ROLES.has(currentUserRole) : false;

  const updateLinePriority = useCallback(
    async (lineId: string, priority: JobLinePriority) => {
      const { error } = await supabase
        .from("work_order_lines")
        .update({ job_priority: priority } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", lineId)
        .eq("work_order_id", routeId)
        .eq("line_type", "job");

      if (error) throw error;
    },
    [routeId],
  );

  const selectedDelLine = useMemo(() => {
    if (!delLineId) return null;
    return lines.find((l) => l.id === delLineId) ?? null;
  }, [delLineId, lines]);

  const selectedDelAllocs = useMemo(() => {
    if (!delLineId) return [];
    return allocsByLine[delLineId] ?? [];
  }, [delLineId, allocsByLine]);

  type WorkOrderWaiterFlags = {
    is_waiter?: boolean | null;
    waiter?: boolean | null;
    customer_waiting?: boolean | null;
  };

  const waiterFlagSource: (WorkOrder & WorkOrderWaiterFlags) | null = wo
    ? (wo as WorkOrder & WorkOrderWaiterFlags)
    : null;

  const isWaiter = !!(
    waiterFlagSource &&
    (waiterFlagSource.is_waiter || waiterFlagSource.waiter || waiterFlagSource.customer_waiting)
  );
  const inProgressCount = useMemo(
    () =>
      jobLines.filter((line) => {
        const status = resolveDecisionStatus({
          approvalState: line.approval_state,
          workStatus: line.status,
        });
        return status === "in_progress";
      }).length,
    [jobLines],
  );
  const blockedCount = useMemo(
    () =>
      jobLines.filter((line) => {
        const status = (line.status ?? "").toLowerCase();
        return status === "on_hold" || status === "waiting_for_parts" || status === "blocked";
      }).length,
    [jobLines],
  );

  const openDeleteForLine = useCallback(
    (lineId: string) => {
      if (!canDeleteLine) {
        toast.error("You don’t have permission to delete/void job lines.");
        return;
      }
      setDelLineId(lineId);
      setDelOpen(true);
    },
    [canDeleteLine],
  );

  const closeDeleteModal = useCallback(() => {
    setDelOpen(false);
    setDelLineId(null);
  }, []);

  const onDeleteDone = useCallback(async () => {
    closeDeleteModal();
    await fetchAll();
  }, [closeDeleteModal, fetchAll]);

  /* ----------------------- line actions ----------------------- */

  const approveLine = useCallback(
    async (lineId: string) => {
      if (!lineId) return;

      const res = await fetch(`/api/work-orders/lines/${lineId}/approval-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "approve",
          workOrderId: wo?.id ?? null,
          resetPunchClock: true,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; workOrderId?: string | null }
        | null;

      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? "Failed to approve line");
        return;
      }

      toast.success("Line approved");
      void fetchAll();
    },
    [fetchAll, wo?.id],
  );

  const declineLine = useCallback(
    async (lineId: string) => {
      if (!lineId) return;
      const res = await fetch(`/api/work-orders/lines/${lineId}/approval-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "decline",
          workOrderId: wo?.id ?? null,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) return toast.error(json?.error ?? "Failed to decline line");
      toast.success("Line declined");
      void fetchAll();
    },
    [fetchAll, wo?.id],
  );

  const approveQuoteLine = useCallback(
    async (quoteId: string) => {
      if (!quoteId) return;
      try {
        const res = await fetch(`/api/work-orders/quotes/${quoteId}/authorize`, {
          method: "POST",
        });
        const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

        if (!res.ok || j?.error) {
          throw new Error(j?.error || "Failed to authorize quote");
        }

        toast.success("Quote authorized");
        void fetchAll();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to authorize quote";
        toast.error(msg);
      }
    },
    [fetchAll],
  );

  const declineQuoteLine = useCallback(
    async (quoteId: string) => {
      if (!quoteId) return;
      const { error } = await supabase
        .from("work_order_quote_lines")
        .update({ status: "declined" })
        .eq("id", quoteId);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Quote declined");
      void fetchAll();
    },
    [fetchAll],
  );

  const openInspectionForLine = useCallback(
    async (ln: WorkOrderLine) => {
      if (!ln?.id) return;

      const anyLine = ln as WorkOrderLineWithInspectionMeta;
      const templateId = extractInspectionTemplateId(anyLine);

      if (!templateId) {
        toast.error(
          "This job line doesn't have an inspection template attached yet. Build or attach a custom inspection first.",
        );
        return;
      }

      const { data, error } = await supabase
        .from("inspection_templates")
        .select("template_name, sections, vehicle_type")
        .eq("id", templateId)
        .maybeSingle();

      if (error || !data) {
        toast.error("Unable to load inspection template.");
        return;
      }

      const rawSections = (data.sections ?? []) as TemplateSection[];
      const vehicleType = String(data.vehicle_type ?? "");
      const sections = prepareSectionsWithCornerGrid(rawSections, vehicleType, null);

      const templateName = data.template_name ?? null;
      const title = templateName ?? "Inspection";

      if (typeof window !== "undefined") {
        const paramsObj: Record<string, string> = {};

        if (wo?.id) {
          paramsObj.workOrderId = wo.id;
          paramsObj.work_order_id = wo.id;
        }

        paramsObj.workOrderLineId = ln.id;
        paramsObj.work_order_line_id = ln.id;
        paramsObj.lineId = ln.id;

        paramsObj.embed = "1";

        // ✅ NEW: template identity for modal + downstream
        paramsObj.templateId = templateId;
        paramsObj.template_id = templateId;
        if (templateName) {
          paramsObj.templateName = templateName;
          paramsObj.template_name = templateName;
        }

        if (ln.description) paramsObj.seed = String(ln.description);

        if (customer) {
          if (customer.first_name) paramsObj.first_name = customer.first_name;
          if (customer.last_name) paramsObj.last_name = customer.last_name;
          if (customer.phone) paramsObj.phone = customer.phone;
          if (customer.email) paramsObj.email = customer.email;
          if (customer.address) paramsObj.address = customer.address;
          if (customer.city) paramsObj.city = customer.city;
          if (customer.province) paramsObj.province = customer.province;
          if (customer.postal_code) paramsObj.postal_code = customer.postal_code;
        }

        if (vehicle) {
          if (vehicle.year != null) paramsObj.year = String(vehicle.year as string | number);
          if (vehicle.make) paramsObj.make = vehicle.make;
          if (vehicle.model) paramsObj.model = vehicle.model;
          if (vehicle.vin) paramsObj.vin = vehicle.vin;
          if (vehicle.license_plate) paramsObj.license_plate = vehicle.license_plate;
          if (vehicle.mileage != null) paramsObj.mileage = String(vehicle.mileage);
          if (vehicle.color) paramsObj.color = vehicle.color;
          if (vehicle.unit_number) paramsObj.unit_number = vehicle.unit_number;
          if (vehicle.engine_hours != null) paramsObj.engine_hours = String(vehicle.engine_hours);
        }

        sessionStorage.setItem("inspection:sections", JSON.stringify(sections));
        sessionStorage.setItem("inspection:title", title);
        sessionStorage.setItem("inspection:vehicleType", vehicleType);
        sessionStorage.setItem("inspection:template", "generic");
        sessionStorage.setItem("inspection:params", JSON.stringify(paramsObj));
      }

      const sp = new URLSearchParams();
      sp.set("template", "generic");

      if (wo?.id) {
        sp.set("workOrderId", wo.id);
        sp.set("work_order_id", wo.id);
      }

      sp.set("workOrderLineId", ln.id);
      sp.set("work_order_line_id", ln.id);
      sp.set("lineId", ln.id);

      sp.set("templateId", templateId);
      sp.set("template_id", templateId);
      if (templateName) {
        sp.set("templateName", templateName);
        sp.set("template_name", templateName);
      }

      sp.set("embed", "1");

      if (ln.description) sp.set("seed", String(ln.description));

      const url = `/inspections/fill?${sp.toString()}`;

      setInspectionSrc(url);
      setInspectionOpen(true);
      toast.success("Inspection opened");
    },
    [wo?.id, customer, vehicle,],
  );

  useEffect(() => {
    if (!partsLineId) return;

    const evtName = `parts-drawer:closed:${partsLineId}`;

    const handler = () => {
      setPartsLineId(null);
      void fetchAll();
    };

    window.addEventListener(evtName, handler as EventListener);
    return () => window.removeEventListener(evtName, handler as EventListener);
  }, [partsLineId, fetchAll]);

  const requestAllPartsForLine = useCallback(
    async (lineId: string, existingRequests: PartRequestRow[]) => {
      if (!wo?.id || requestingPartsLineId) return;
      if (existingRequests.length > 0) {
        router.push(`/parts/requests/${encodeURIComponent(wo.custom_id || wo.id)}`);
        return;
      }

      setRequestingPartsLineId(lineId);
      const toastId = toast.loading("Requesting every part on this line…");
      try {
        const idempotencyKey = crypto.randomUUID();
        const response = await fetch(
          `/api/work-orders/${encodeURIComponent(wo.id)}/lines/${encodeURIComponent(lineId)}/parts-request`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify({ idempotencyKey }),
          },
        );
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          result?: { stage?: string };
        } | null;
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to request line parts.");
        }

        const released = payload?.result?.stage === "order_receive";
        toast.success(
          released
            ? "Approved parts were released to the Pick / Order queue."
            : "Every part on this line was requested.",
          { id: toastId },
        );
        window.dispatchEvent(new Event("parts-request:submitted"));
        await fetchAll();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to request line parts.",
          { id: toastId },
        );
      } finally {
        setRequestingPartsLineId(null);
      }
    },
    [fetchAll, requestingPartsLineId, router, wo],
  );

  /* -------------------------- UI -------------------------- */
  if (!routeId) return <div className="p-6 text-red-500">Missing work order id.</div>;

  const Skeleton = ({ className = "" }: { className?: string }) => (
    <div className={`animate-pulse rounded-lg bg-muted ${className}`} />
  );

  const cardInner = cn(PANEL_VARIANTS.passive, "p-3");
  const supportFullyCollapsed = !showDetails && !showWoContext;

  // ✅ layout: desktop keeps the focused cockpit open with a selected (or first) line.
  const panelLineId = focusedJobId ?? sortedLines[0]?.id ?? null;
  const showPanel = prefersPanel && !!panelLineId;

  return (
    <div className="w-full bg-[var(--theme-surface-2,var(--theme-surface-page))] px-3 py-4 text-foreground sm:px-5 lg:px-8 xl:px-10">
      <VoiceContextSetter
        currentView="work_order_page"
        workOrderId={wo?.id}
        vehicleId={vehicle?.id}
        customerId={customer?.id}
        lineId={focusedJobId}
      />

      <PageShell eyebrow="" title="" description="" actions={null}>
        {authChecked && !currentUserId && (
          <section className={cn(PANEL_VARIANTS.secondary, "p-3 text-sm text-amber-100")}>
            You appear signed out on this tab. If actions fail, open{" "}
            <Link href="/sign-in" className="underline hover:text-[color:var(--theme-text-primary)]">
              Sign In
            </Link>{" "}
            and return here.
          </section>
        )}

        {viewError && (
          <section className={cn(PANEL_VARIANTS.secondary, "p-3 text-sm text-red-200")}>
            {viewError}
          </section>
        )}

        {loading && !loadedOnce ? (
          <div className="mt-1 grid gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
            <Skeleton className="h-56" />
          </div>
        ) : !wo ? (
          <div className="mt-2 text-sm text-red-400">Work order not found.</div>
        ) : (
          <div className={cn("space-y-2.5", supportFullyCollapsed && "space-y-2")}>
            <section className={cn(PANEL_VARIANTS.secondary, "px-3 py-2")}>
              <div className="flex flex-wrap items-center gap-2">
                <PreviousPageButton />
                <div className="text-sm font-semibold text-foreground">
                  {wo.custom_id ?? `WO-${wo.id.slice(0, 8)}`}
                </div>
                <StatusBadge variant={formatDecisionStatus({ workStatus: wo.status }).variant} size="sm">
                  {formatDecisionStatus({ workStatus: wo.status }).label}
                </StatusBadge>
                {isWaiter ? (
                  <StatusBadge variant="danger" size="sm">
                    Waiter
                  </StatusBadge>
                ) : null}
                {hasAnyApprovalItems ? (
                  <StatusBadge variant="warning" size="sm">
                    {approvalPending.length + approvalPendingQuotes.length} awaiting approval
                  </StatusBadge>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {isPropertySourcedWorkOrder
                  ? "Property-linked work order"
                  : `${customer ? [customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ") || "Customer" : "No customer linked"} • ${vehicle ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() || "Vehicle linked" : "No vehicle linked"}`}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-0.5 text-muted-foreground">State: {formatDecisionStatus({ workStatus: wo.status }).label}</span>
                <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-0.5 text-muted-foreground">Active jobs: {sortedLines.length}</span>
                <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-0.5 text-muted-foreground">In progress: {inProgressCount}</span>
                <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-0.5 text-muted-foreground">Blocked: {blockedCount}</span>
                {hasAnyApprovalItems ? (
                  <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-sky-200">Approval queue: {approvalPending.length + approvalPendingQuotes.length}</span>
                ) : null}
              </div>
            </section>

            {loading ? (
              <div className="rounded-lg border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs text-muted-foreground">
                Refreshing work order data…
              </div>
            ) : null}
            <section className={cn(PANEL_VARIANTS.secondary, "p-2")}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setShowWoContext((prev) => !prev)}
                aria-expanded={showWoContext}
              >
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Context &amp; AI
                </span>
                <span className="text-[11px] font-medium text-[rgba(184,115,51,0.95)]">{showWoContext ? "Hide" : "Show"}</span>
              </button>
              {!showWoContext ? (
                <div className={cn(cardInner, "mt-2 p-2 text-[11px] text-muted-foreground")}>
                  AI support, approvals, vehicle/customer, timeline, and context available on demand.
                </div>
              ) : (
                <div className="mt-2 grid gap-2">
                  <WorkOrderAiFreshnessBadge workOrderId={wo.id} />
                  <WorkOrderAiOperationalRecommendations workOrderId={wo.id} />
                  <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                  <div className={cn(cardInner, "p-2")}>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Order state
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusBadge
                        variant={formatDecisionStatus({ workStatus: wo.status }).variant}
                        size="sm"
                      >
                        {formatDecisionStatus({ workStatus: wo.status }).label}
                      </StatusBadge>
                    </div>
                  </div>
                  <div className={cn(cardInner, "p-2")}>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Target completion
                    </div>
                    <div className="mt-1 text-sm font-medium text-foreground">{expectedCompletionText}</div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Planning target set from intake/advisor flow.
                    </p>
                  </div>
                  <div className={cn(cardInner, "p-2 sm:col-span-2 xl:col-span-1")}>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Created
                    </div>
                    <div className="mt-1 text-xs font-medium text-muted-foreground">{createdAtText}</div>
                  </div>
                </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    {isPropertySourcedWorkOrder ? (
                      <div className={cn(cardInner, "sm:col-span-2 xl:col-span-1")}>
                        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Property-linked work order
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Vehicle and customer details are hidden for property-sourced work orders.
                          Use the property context panel above for location, request, and assignment.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Vehicle */}
                        <div className={cardInner}>
                          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Vehicle
                          </h3>
                          {vehicle ? (
                            <>
                              <p className="text-sm font-medium text-foreground">
                                {(vehicle.year ?? "").toString()} {vehicle.make ?? ""}{" "}
                                {vehicle.model ?? ""}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                VIN: <span className="font-mono">{vehicle.vin ?? "—"}</span>
                                <br />
                                Plate:{" "}
                                {vehicle.license_plate ?? (
                                  <span className="text-muted-foreground">—</span>
                                )}
                                <br />
                                Mileage:{" "}
                                {vehicle.mileage
                                  ? vehicle.mileage
                                  : wo?.odometer_km != null
                                    ? `${wo.odometer_km} km`
                                    : "—"}
                              </p>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">No vehicle linked yet.</p>
                          )}
                        </div>

                        {/* Customer */}
                        <div className={cardInner}>
                          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Customer
                          </h3>
                          {customer ? (
                            <>
                              <p className="text-sm font-medium text-foreground">
                                {[customer.first_name ?? "", customer.last_name ?? ""]
                                  .filter(Boolean)
                                  .join(" ") || "—"}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {customer.phone ?? "—"}{" "}
                                {customer.email ? (
                                  <>
                                    <span className="mx-1 text-muted-foreground">•</span>
                                    {customer.email}
                                  </>
                                ) : null}
                              </p>
                              {customer.id && (
                                <Link
                                  href={`/customers/${customer.id}`}
                                  className="mt-2 inline-flex text-[11px] font-medium text-[rgba(184,115,51,0.95)] hover:underline"
                                  title="Open customer profile"
                                >
                                  View customer profile →
                                </Link>
                              )}
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">No customer linked yet.</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <section
                className={cn(
                  PANEL_VARIANTS.secondary,
                  "p-2",
                  hasAnyApprovalItems ? "cursor-pointer hover:border-sky-400/35" : "",
                )}
                onClick={hasAnyApprovalItems ? openQuoteReview : undefined}
                role={hasAnyApprovalItems ? "button" : undefined}
                tabIndex={hasAnyApprovalItems ? 0 : undefined}
                onKeyDown={
                  hasAnyApprovalItems
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openQuoteReview();
                        }
                      }
                    : undefined
                }
                aria-label={hasAnyApprovalItems ? "Open quote review" : undefined}
              >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Approval queue
                </div>
                <button
                  type="button"
                  className="text-[11px] font-medium text-[rgba(184,115,51,0.95)] hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowApprovalSummary((prev) => !prev);
                  }}
                >
                  {showApprovalSummary ? "Hide" : "Show"}
                </button>
              </div>
              {!hasAnyApprovalItems ? (
                <p className="text-[11px] text-muted-foreground">Approval queue clear.</p>
              ) : showApprovalSummary ? (
                <>
                  {recentApprovalPending.length > 0 && (
                    <div className="space-y-2">
                      {recentApprovalPending.map((ln, idx) => {
                        const isAwaitingPartsBase =
                          (ln.status === "on_hold" &&
                            (ln.hold_reason ?? "").toLowerCase().includes("part")) ||
                          (ln.hold_reason ?? "").toLowerCase().includes("quote");

                        const hasQuotedParts = (activeQuotesByLine[ln.id] ?? []).length > 0;
                        const partsLabel = hasQuotedParts
                          ? "Quoted, awaiting approval"
                          : "Awaiting parts quote";

                        return (
                          <div key={ln.id} className={`${cardInner} p-3`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-foreground">
                                  {idx + 1}. {ln.description || ln.complaint || "Untitled job"}
                                </div>
                                <div className="mt-0.5 text-[11px] text-muted-foreground">
                                  {String(ln.job_type ?? "job").replaceAll("_", " ")} •{" "}
                                  {typeof ln.labor_time === "number" ? `${ln.labor_time}h` : "—"} •
                                  Decision:{" "}
                                  {
                                    formatDecisionStatus({
                                      approvalState: ln.approval_state,
                                      workStatus: ln.status,
                                    }).label
                                  }
                                </div>

                                {isAwaitingPartsBase && (
                                  <div className="mt-1 inline-flex items-center rounded-full border border-blue-500/50 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-200">
                                    {partsLabel}
                                  </div>
                                )}

                                {ln.notes && (
                                  <div className="mt-1 text-[11px] text-muted-foreground">
                                    Notes: {ln.notes}
                                  </div>
                                )}
                              </div>

                              {canApprove && (
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    className="rounded-md border border-green-700/60 px-2 py-1 text-[11px] font-medium text-green-200 hover:bg-green-900/25"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void approveLine(ln.id);
                                    }}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-md border border-red-700/60 px-2 py-1 text-[11px] font-medium text-red-200 hover:bg-red-900/30"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void declineLine(ln.id);
                                    }}
                                  >
                                    Decline
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {recentApprovalPendingQuotes.length > 0 && (
                    <div className={recentApprovalPending.length > 0 ? "mt-3 space-y-2" : "space-y-2"}>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-300">
                        Quote suggestions
                      </div>
                      {recentApprovalPendingQuotes.map((q, idx) => (
                        <div key={q.id} className={`${cardInner} p-3`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-foreground">
                                {idx + 1}. {q.description || "Quoted item"}
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                {String(q.job_type ?? "job").replaceAll("_", " ")} •{" "}
                                {typeof q.est_labor_hours === "number"
                                  ? `${q.est_labor_hours}h`
                                  : "—"}{" "}
                                • Decision: {formatDecisionStatus({ workStatus: q.status }).label}
                              </div>
                              {q.notes && (
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  Notes: {q.notes}
                                </div>
                              )}
                            </div>

                            {canApprove && (
                              <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-md border border-green-700/60 px-2 py-1 text-[11px] font-medium text-green-200 hover:bg-green-900/25"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void approveQuoteLine(q.id);
                                  }}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="rounded-md border border-red-700/60 px-2 py-1 text-[11px] font-medium text-red-200 hover:bg-red-900/30"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void declineQuoteLine(q.id);
                                  }}
                                >
                                  Decline
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(approvalPending.length > recentApprovalPending.length ||
                    approvalPendingQuotes.length > recentApprovalPendingQuotes.length) && (
                    <div className="pt-1 text-[11px] text-muted-foreground">
                      Showing recent approvals. Open Quote Review for full queue.
                    </div>
                  )}
                </>
              ) : (
                <div className={cn(cardInner, "p-2 text-[11px] text-muted-foreground")}>
                  {approvalPending.length + approvalPendingQuotes.length} item(s) awaiting decision.
                </div>
              )}
                  </section>
                  <section className={cn(PANEL_VARIANTS.secondary, "p-2")}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 text-left"
                  onClick={() => setShowTimeline((prev) => !prev)}
                  aria-expanded={showTimeline}
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Decision timeline & recent events
                  </span>
                  <span className="text-[11px] font-medium text-[rgba(184,115,51,0.95)]">
                    {showTimeline ? "Hide" : "Show"}
                  </span>
                </button>

                {showTimeline ? (
                  <div className="mt-2 grid gap-2.5">
                    <DecisionTimeline stages={decisionTimelineStages} compact orientation="vertical" />
                    <div className={cn(PANEL_VARIANTS.passive, "p-2")}>
                      <DecisionEventFeed
                        events={decisionEvents}
                        filter="all"
                        maxVisible={showFullHistory ? 10 : 3}
                        compact
                      />
                      {decisionEvents.length > 3 ? (
                        <button
                          type="button"
                          onClick={() => setShowFullHistory((prev) => !prev)}
                          className="mt-1.5 text-[11px] font-medium text-[rgba(184,115,51,0.95)] hover:underline"
                        >
                          {showFullHistory ? "Show recent only" : "View full history"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className={cn(cardInner, "mt-2 p-2 text-[11px] text-muted-foreground")}>
                    Recent decision history is available when needed.
                  </p>
                )}
                  </section>
                </div>
              )}
            </section>

          {/* Workspace */}
          <section className={cn("grid lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)] lg:items-start", supportFullyCollapsed ? "gap-2.5 lg:gap-3" : "gap-3 lg:gap-4")}>
            {/* Left: jobs list/cards */}
            <div className="space-y-2">
              {sortedLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No jobs added yet. Use the{" "}
                  <span className="font-semibold text-[color:var(--accent-copper,#f97316)]">
                    Add job
                  </span>{" "}
                  actions in the focused panel to start building this work order.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {sortedLines.map((ln, idx) => {
                    const punchedIn = !!ln.punched_in_at && !ln.punched_out_at;

                    const allocPartsForLine = allocsByLine[ln.id] ?? [];
                    const stagedForLine = stagedPartsByLine[ln.id] ?? [];

                    const stagedAsAllocShape: AllocationRow[] = stagedForLine.map((p) => {
                      return {
                        id: p.id,
                        work_order_line_id: p.work_order_line_id as string,
                        shop_id: p.shop_id,
                        created_at: p.created_at,
                        part_id: p.part_id ?? null,
                        quantity: (p.quantity as unknown as number) ?? 0,
                        unit_cost: p.unit_price ?? null,
                        unit_price: p.unit_price ?? null,
                        total_cost: null,
                        total_price: p.total_price ?? null,
                        status: "staged",
                        parts: { name: p.description_snapshot ?? p.parts?.name ?? null } as { name: string | null },
                      } as unknown as AllocationRow;
                    });

                    const partsForLine = [...allocPartsForLine, ...stagedAsAllocShape];

                    const lineTechIds = lineTechsByLine[ln.id] ?? [];
                    const primaryId =
                      typeof (ln as unknown as { assigned_tech_id?: string | null }).assigned_tech_id === "string"
                        ? (ln as unknown as { assigned_tech_id?: string | null }).assigned_tech_id
                        : null;

                    const orderedTechIds: string[] = [];
                    if (primaryId) orderedTechIds.push(primaryId);
                    lineTechIds.forEach((tid) => {
                      if (!orderedTechIds.includes(tid)) orderedTechIds.push(tid);
                    });

                    const isPunchedIn = punchedIn;
                    const isCurrentUserWorkingThisLine = Boolean(
                      isPunchedIn &&
                        currentUserId &&
                        (primaryId === currentUserId || lineTechIds.includes(currentUserId)),
                    );
                    const activeTechnicianNames = isPunchedIn
                      ? orderedTechIds
                          .map(
                            (techId) =>
                              assignables.find((tech) => tech.id === techId)?.full_name?.trim() ??
                              null,
                          )
                          .filter((name): name is string => Boolean(name))
                      : [];
                    const isSelectedForPanel = panelLineId === ln.id;
                    const linePartRequests = partRequestsByLine[ln.id] ?? [];
                    const hasRequestableParts =
                      canRequestParts && (stagedPartsByLine[ln.id] ?? []).length > 0;

                    return (
                      <JobCard
                        key={ln.id}
                        index={idx}
                        line={ln}
                        parts={partsForLine}
                        technicians={assignables}
                        canAssign={canAssign}
                        isPunchedIn={isPunchedIn}
                        isCurrentUserWorkingThisLine={isCurrentUserWorkingThisLine}
                        activeTechnicianNames={activeTechnicianNames}
                        isSelectedForPanel={isSelectedForPanel}
                        onOpen={() => openFocusedJob(ln.id)}
                        onAssign={
                          canAssign
                            ? async (techId: string) => {
                                try {
                                  const res = await fetch("/api/work-orders/assign-line", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      work_order_line_id: ln.id,
                                      tech_id: techId,
                                    }),
                                  });

                                  const json = await res.json().catch(() => ({}));

                                  if (!res.ok) {
                                    throw new Error(
                                      typeof json?.error === "string"
                                        ? json.error
                                        : "Failed to update primary tech."
                                    );
                                  }

                                  toast.success("Primary tech updated.");
                                  await fetchAll();
                                } catch (e) {
                                  const msg = e instanceof Error ? e.message : "Failed to update primary tech.";
                                  toast.error(msg);
                                }
                              }
                            : undefined
                        }
                        onPriorityChange={
                          canAssign
                            ? async (priority: JobLinePriority) => {
                                try {
                                  await updateLinePriority(ln.id, priority);
                                  toast.success("Job priority updated.");
                                  await fetchAll();
                                } catch (e) {
                                  const msg =
                                    e instanceof Error ? e.message : "Failed to update priority.";
                                  toast.error(msg);
                                }
                              }
                            : undefined
                        }
                        onOpenInspection={
                          ln.job_type === "inspection"
                            ? () => void openInspectionForLine(ln)
                            : undefined
                        }
                        onAddPart={() => setPartsLineId(ln.id)}
                        onRequestParts={
                          hasRequestableParts
                            ? () => void requestAllPartsForLine(ln.id, linePartRequests)
                            : undefined
                        }
                        requestPartsLabel={partsRequestActionLabel(linePartRequests)}
                        requestPartsBusy={requestingPartsLineId === ln.id}
                        pricing={pricingByLine[ln.id] ?? null}
                        reviewOk={reviewOk}
                        reviewIssues={reviewIssuesByLine[ln.id] ?? []}
                        canDelete={canDeleteLine}
                        onDelete={() => openDeleteForLine(ln.id)}
                        compact={showPanel}
                        selected={isSelectedForPanel}
                        hideExecutionStageCompletenessPills
                      />
                    );
                  })}
                </div>
              )}


              {approvalPendingQuotes.length > 0 && (
                <section className={cn(PANEL_VARIANTS.secondary, "rounded-xl p-3")}>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
                        Pending quote items
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Recommended repairs stay here until advisor/customer approval materializes work lines.
                      </p>
                    </div>
                    <Link href={`/quote-review/${wo?.id ?? routeId}`} className="rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-500/20">
                      Open Quote Review
                    </Link>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {approvalPendingQuotes.map((q) => {
                      const meta = isRecord(q.metadata) ? q.metadata : {};
                      const parts = Array.isArray(meta.parts) ? meta.parts : [];
                      const photoCount = Array.isArray(meta.photo_urls) ? meta.photo_urls.length : 0;
                      const menuMatch = isRecord(meta.menu_match) ? meta.menu_match : null;
                      const pricingReviewRequired = menuMatch?.pricing_review_required === true || q.status === "pending_parts";
                      const partRequests = partRequestsByQuoteLine[q.id] ?? [];
                      const sourceFinding = asString(meta.source_finding_title) ?? q.ai_complaint ?? "Inspection finding";
                      const inspectionStatus = asString(meta.inspection_status)?.toUpperCase() ?? "RECOMMEND";
                      const technicianNotes = asString(meta.technician_notes) ?? q.notes ?? "—";

                      return (
                        <article key={q.id} className="rounded-xl border border-sky-400/20 bg-sky-950/20 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-foreground">{q.description || "Recommended repair"}</div>
                              <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-sky-200">
                                {inspectionStatus} • {sourceFinding}
                              </div>
                            </div>
                            <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-[10px] uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                              {String(q.stage ?? q.status ?? "advisor_pending").replaceAll("_", " ")}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs text-[color:var(--theme-text-secondary)] sm:grid-cols-2">
                            <div>Tech notes: <span className="text-[color:var(--theme-text-primary)]">{technicianNotes}</span></div>
                            <div>Labor: <span className="text-[color:var(--theme-text-primary)]">{typeof q.labor_hours === "number" ? `${q.labor_hours}h` : typeof q.est_labor_hours === "number" ? `${q.est_labor_hours}h` : "—"}</span></div>
                            <div>Parts: <span className="text-[color:var(--theme-text-primary)]">{parts.length > 0 ? `${parts.length} requirement(s)` : "None / labor-only"}</span></div>
                            <div>Evidence: <span className="text-[color:var(--theme-text-primary)]">{photoCount}</span></div>
                            <div>Parts Request: <span className="text-[color:var(--theme-text-primary)]">{partRequests.length > 0 ? partRequests.map((r) => r.status ?? "requested").join(", ") : "Not required / not created"}</span></div>
                            <div>Pricing: <span className={pricingReviewRequired ? "text-amber-200" : "text-emerald-200"}>{pricingReviewRequired ? "Review required" : "Pricing available"}</span></div>
                          </div>
                          {menuMatch ? (
                            <div className="mt-2 text-[11px] text-[color:var(--theme-text-secondary)]">
                              Menu source: {asString(menuMatch.label) ?? asString(menuMatch.menu_repair_item_id) ?? asString(menuMatch.menu_item_id) ?? "matched repair"}
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Link href={`/quote-review/${wo?.id ?? routeId}`} className="rounded-md border border-sky-400/40 px-2.5 py-1 text-[11px] font-semibold text-sky-100 hover:bg-sky-500/10">
                              Review
                            </Link>
                            {partRequests[0]?.id ? (
                              <Link href={`/parts/requests?requestId=${encodeURIComponent(partRequests[0].id)}`} className="rounded-md border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]">
                                View Parts Request
                              </Link>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

              {infoLines.length > 0 && (
                <section className={cn(PANEL_VARIANTS.passive, "rounded-xl p-3")}>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Info / Context (non-actionable)
                  </div>
                  <div className="space-y-2">
                    {infoLines.map((line) => (
                      <div key={line.id} className="rounded-lg border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] p-2.5">
                        <div className="text-sm text-foreground">
                          {line.description || line.complaint || "Context line"}
                        </div>
                        {line.notes && <div className="mt-1 text-xs text-muted-foreground">{line.notes}</div>}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Right: focused job workspace pane */}
            <div className="min-w-0 lg:sticky lg:top-20">
              {panelLineId ? (
                <FocusedJobModal
                  key={panelLineId}
                  isOpen={true}
                  onClose={closeFocusedPanel}
                  workOrderLineId={panelLineId}
                  onChanged={fetchAll}
                  mode="tech"
                  variant="panel"
                />
              ) : (
                <section className={cn(PANEL_VARIANTS.passive, "rounded-2xl p-4 text-sm text-muted-foreground")}>
                  Select a job
                </section>
              )}
            </div>
          </section>

        </div>
      )}
      </PageShell>

      {/* Focused job modal (mobile fallback) */}
      {!prefersPanel && focusedOpen && focusedJobId && (
        <FocusedJobModal
          isOpen={focusedOpen}
          onClose={() => setFocusedOpen(false)}
          workOrderLineId={focusedJobId}
          onChanged={fetchAll}
          mode="tech"
          variant="modal"
        />
      )}

      {/* Parts Drawer */}
      {partsLineId && wo?.id && (
        <PartsDrawer
          open={!!partsLineId}
          workOrderId={wo.id}
          workOrderLineId={partsLineId}
          vehicleSummary={
            vehicle
              ? {
                  year: (vehicle.year as string | number | null)?.toString() ?? null,
                  make: vehicle.make ?? null,
                  model: vehicle.model ?? null,
                }
              : null
          }
          jobDescription={
            lines.find((l) => l.id === partsLineId)?.description ??
            lines.find((l) => l.id === partsLineId)?.complaint ??
            null
          }
          jobNotes={lines.find((l) => l.id === partsLineId)?.notes ?? null}
          closeEventName={`parts-drawer:closed:${partsLineId}`}
        />
      )}

      {/* Inspection modal */}
      {inspectionOpen && inspectionSrc && (
        <InspectionModal
          open={inspectionOpen}
          src={inspectionSrc}
          title="Inspection"
          onClose={() => {
            setInspectionOpen(false);
            setInspectionSrc(null);
          }}
        />
      )}

      {/* Assign mechanic modal */}
      {assignOpen && assignLineId && (
        <AssignTechModal
          isOpen={assignOpen}
          onClose={() => setAssignOpen(false)}
          workOrderLineId={assignLineId}
          mechanics={assignables}
          onAssigned={async () => {
            await fetchAll();
          }}
        />
      )}

      {/* Delete / Void line modal */}
      {delOpen && selectedDelLine && (
        <DeleteOrVoidLineModal
          open={delOpen}
          onClose={closeDeleteModal}
          line={selectedDelLine}
          allocations={selectedDelAllocs}
          onDone={() => void onDeleteDone()}
        />
      )}
    </div>
  );
}
