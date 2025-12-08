//app/work-orders/[id]/Client.tsx

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import dynamic from "next/dynamic";

import { supabaseBrowser as supabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import VehiclePhotoUploader from "@parts/components/VehiclePhotoUploader";
import VehiclePhotoGallery from "@parts/components/VehiclePhotoGallery";
import FocusedJobModal from "@/features/work-orders/components/workorders/FocusedJobModal";
import VoiceContextSetter from "@/features/shared/voice/VoiceContextSetter";
import VoiceButton from "@/features/shared/voice/VoiceButton";
import { useTabState } from "@/features/shared/hooks/useTabState";
import PartsDrawer from "@/features/parts/components/PartsDrawer";
import AssignTechModal from "@/features/work-orders/components/workorders/extras/AssignTechModal";
import { JobCard } from "@/features/work-orders/components/JobCard";
import { WorkOrderSuggestionsPanel } from "@/features/work-orders/components/WorkOrderSuggestionsPanel";
import { useWorkOrderActions } from "@/features/work-orders/hooks/useWorkOrderActions";

// inspection modal
const InspectionModal = dynamic(
  () => import("@/features/inspections/components/InspectionModal"),
  { ssr: false },
);

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderQuoteLine =
  DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type WorkOrderQuoteLineWithLineId = WorkOrderQuoteLine & {
  work_order_line_id?: string | null;
};
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type AllocationRow =
  DB["public"]["Tables"]["work_order_part_allocations"]["Row"] & {
    parts?: { name: string | null } | null;
  };
type LineTechRow =
  DB["public"]["Tables"]["work_order_line_technicians"]["Row"];

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

const looksLikeUuid = (s: string) => s.includes("-") && s.length >= 36;

function splitCustomId(raw: string): { prefix: string; n: number | null } {
  const m = raw.toUpperCase().match(/^([A-Z]+)\s*0*?(\d+)?$/);
  if (!m) return { prefix: raw.toUpperCase(), n: null };
  const n = m[2] ? parseInt(m[2], 10) : null;
  return { prefix: m[1], n: Number.isFinite(n!) ? n : null };
}

/** Normalize “where is the inspection template id stored for this line?” */
function extractInspectionTemplateId(
  ln: WorkOrderLineWithInspectionMeta,
): string | null {
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

const HYD_ITEM_RE = /^(LF|RF|LR|RR)\s+/i;
const AIR_ITEM_RE =
  /^(Steer\s*\d*|Drive\s*\d+|Tag|Trailer\s*\d+)\s+(Left|Right)\s+/i;

function looksLikeCornerTitle(title: string | undefined | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return (
    t.includes("corner grid") ||
    t.includes("tires & brakes") ||
    t.includes("tires and brakes") ||
    t.includes("air brake") ||
    t.includes("hydraulic brake")
  );
}

function stripExistingCornerGrids(sections: TemplateSection[]): TemplateSection[] {
  return sections.filter((s) => {
    if (looksLikeCornerTitle(s.title)) return false;

    const items = s.items ?? [];
    const looksHyd = items.some((it) => HYD_ITEM_RE.test(it.item || ""));
    const looksAir = items.some((it) => AIR_ITEM_RE.test(it.item || ""));
    return !(looksHyd || looksAir);
  });
}

function buildHydraulicCornerSection(): TemplateSection {
  const metrics: Array<{ label: string; unit: string | null }> = [
    { label: "Tire Pressure", unit: "psi" },
    { label: "Tire Tread", unit: "mm" },
    { label: "Brake Pad", unit: "mm" },
    { label: "Rotor", unit: "mm" },
    { label: "Rotor Condition", unit: null },
    { label: "Rotor Thickness", unit: "mm" },
    { label: "Wheel Torque", unit: "ft·lb" },
  ];
  const corners = ["LF", "RF", "LR", "RR"];
  const items: TemplateSectionItem[] = [];
  for (const c of corners) {
    for (const m of metrics) {
      items.push({ item: `${c} ${m.label}`, unit: m.unit });
    }
  }
  return { title: "Corner Grid (Hydraulic)", items };
}

function buildAirCornerSection(): TemplateSection {
  const steer: TemplateSectionItem[] = [
    { item: "Steer 1 Left Tire Pressure", unit: "psi" },
    { item: "Steer 1 Right Tire Pressure", unit: "psi" },
    { item: "Steer 1 Left Tread Depth", unit: "mm" },
    { item: "Steer 1 Right Tread Depth", unit: "mm" },
    { item: "Steer 1 Left Lining/Shoe", unit: "mm" },
    { item: "Steer 1 Right Lining/Shoe", unit: "mm" },
    { item: "Steer 1 Left Drum/Rotor", unit: "mm" },
    { item: "Steer 1 Right Drum/Rotor", unit: "mm" },
    { item: "Steer 1 Left Push Rod Travel", unit: "in" },
    { item: "Steer 1 Right Push Rod Travel", unit: "in" },
  ];

  const drive: TemplateSectionItem[] = [
    { item: "Drive 1 Left Tire Pressure", unit: "psi" },
    { item: "Drive 1 Right Tire Pressure", unit: "psi" },
    { item: "Drive 1 Left Tread Depth (Outer)", unit: "mm" },
    { item: "Drive 1 Left Tread Depth (Inner)", unit: "mm" },
    { item: "Drive 1 Right Tread Depth (Outer)", unit: "mm" },
    { item: "Drive 1 Right Tread Depth (Inner)", unit: "mm" },
    { item: "Drive 1 Left Lining/Shoe", unit: "mm" },
    { item: "Drive 1 Right Lining/Shoe", unit: "mm" },
    { item: "Drive 1 Left Drum/Rotor", unit: "mm" },
    { item: "Drive 1 Right Drum/Rotor", unit: "mm" },
    { item: "Drive 1 Left Push Rod Travel", unit: "in" },
    { item: "Drive 1 Right Push Rod Travel", unit: "in" },
  ];

  return { title: "Corner Grid (Air)", items: [...steer, ...drive] };
}

function prepareSectionsWithCornerGrid(
  sections: TemplateSection[],
  vehicleType: string | null | undefined,
  gridParam: string | null,
): TemplateSection[] {
  const s = Array.isArray(sections) ? sections : [];

  const hasCornerByTitle = s.some((sec) => looksLikeCornerTitle(sec.title));
  if (hasCornerByTitle) {
    return s;
  }

  const withoutGrids = stripExistingCornerGrids(s);
  const gridMode = (gridParam || "").toLowerCase(); // air | hyd | none | ""

  if (gridMode === "none") return withoutGrids;

  let injectAir: boolean;
  if (gridMode === "air" || gridMode === "hyd") {
    injectAir = gridMode === "air";
  } else {
    const vt = (vehicleType || "").toLowerCase();
    injectAir = vt === "truck" || vt === "bus" || vt === "trailer";
  }

  const injected = injectAir
    ? buildAirCornerSection()
    : buildHydraulicCornerSection();

  return [injected, ...withoutGrids];
}

/* ---------------------------- Badges ---------------------------- */

type KnownStatus =
  | "awaiting_approval"
  | "awaiting"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "planned"
  | "new"
  | "completed"
  | "ready_to_invoice"
  | "invoiced";

const BASE_BADGE =
  "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium";

const BADGE: Record<KnownStatus, string> = {
  awaiting_approval: "bg-blue-900/20 border-blue-500/40 text-blue-300",
  awaiting: "bg-sky-900/20 border-sky-500/40 text-sky-300",
  queued: "bg-indigo-900/20 border-indigo-500/40 text-indigo-300",
  in_progress: "bg-orange-900/20 border-orange-500/40 text-orange-300",
  on_hold: "bg-amber-900/20 border-amber-500/40 text-amber-300",
  planned: "bg-purple-900/20 border-purple-500/40 text-purple-300",
  new: "bg-neutral-800 border-neutral-600 text-neutral-200",
  completed: "bg-green-900/20 border-green-500/40 text-green-300",
  ready_to_invoice: "bg-emerald-900/20 border-emerald-500/40 text-emerald-300",
  invoiced: "bg-teal-900/20 border-teal-500/40 text-teal-300",
};

const chip = (s: string | null | undefined): string => {
  const key = (s ?? "awaiting").toLowerCase().replaceAll(" ", "_") as KnownStatus;
  return `${BASE_BADGE} ${BADGE[key] ?? BADGE.awaiting}`;
};

// roles allowed to assign jobs
const ASSIGN_ROLES = new Set(["owner", "admin", "manager", "advisor"]);

// roles allowed to approve / decline
const APPROVAL_ROLES = new Set([
  "owner",
  "admin",
  "manager",
  "advisor",
  "lead_hand",
  "lead",
  "leadhand",
]);

/* ------------------------------------------------------------------------- */

export default function WorkOrderIdClient(): JSX.Element {
  const params = useParams();
  const routeId = (params?.id as string) || "";

  const [wo, setWo] = useTabState<WorkOrder | null>("wo:id:wo", null);
  const [lines, setLines] = useTabState<WorkOrderLine[]>("wo:id:lines", []);
  const [quoteLines, setQuoteLines] = useTabState<WorkOrderQuoteLine[]>(
    "wo:id:quoteLines",
    [],
  );
  const [vehicle, setVehicle] = useTabState<Vehicle | null>("wo:id:veh", null);
  const [customer, setCustomer] = useTabState<Customer | null>("wo:id:cust", null);

  const [allocsByLine, setAllocsByLine] = useState<Record<string, AllocationRow[]>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [viewError, setViewError] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useTabState<string | null>("wo:id:uid", null);
  const [, setUserId] = useTabState<string | null>("wo:id:effectiveUid", null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  const [showDetails, setShowDetails] = useTabState<boolean>("wo:showDetails", true);
  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);
  const [focusedOpen, setFocusedOpen] = useState(false);
  const [warnedMissing, setWarnedMissing] = useState(false);

  // parts
  const [partsLineId, setPartsLineId] = useState<string | null>(null);
  const [bulkQueue, setBulkQueue] = useState<string[]>([]);
  const [bulkActive, setBulkActive] = useState<boolean>(false);

  // inspection
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionSrc, setInspectionSrc] = useState<string | null>(null);

  // assign mechanic
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignLineId, setAssignLineId] = useState<string | null>(null);
  const [assignables, setAssignables] = useState<
    Array<Pick<Profile, "id" | "full_name" | "role">>
  >([]);

  // per-line technicians
  const [lineTechsByLine, setLineTechsByLine] = useState<Record<string, string[]>>({});

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
          setWo(null);
          setLines([]);
          setQuoteLines([]);
          setVehicle(null);
          setCustomer(null);
          setAllocsByLine({});
          setLineTechsByLine({});
          setLoading(false);
          return;
        }

        setWo(woRow);

        if (!warnedMissing && (!woRow.vehicle_id || !woRow.customer_id)) {
          toast.error(
            "This work order is missing vehicle and/or customer. Open the Create form to set them.",
          );
          setWarnedMissing(true);
        }

        const [linesRes, quoteRes, vehRes, custRes] = await Promise.all([
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

        // allocations + line techs
        if (lineRows.length) {
          const [allocsQuery, lineTechsQuery] = await Promise.all([
            supabase
              .from("work_order_part_allocations")
              .select("*, parts(name)")
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
          ]);

          const byLine: Record<string, AllocationRow[]> = {};
          (allocsQuery.data ?? []).forEach((a) => {
            const row = a as AllocationRow;
            const key = row.work_order_line_id;
            if (!byLine[key]) byLine[key] = [];
            byLine[key].push(row);
          });
          setAllocsByLine(byLine);

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
        } else {
          setAllocsByLine({});
          setLineTechsByLine({});
        }
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : "Failed to load work order.";
        setViewError(msg);
        // eslint-disable-next-line no-console
        console.error("[WO id page] load error:", e);
      } finally {
        setLoading(false);
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
    ],
  );

  useEffect(() => {
    if (!routeId || !currentUserId) return;
    void fetchAll();
  }, [fetchAll, routeId, currentUserId]);

  /* ---------------------- REALTIME ---------------------- */
  useEffect(() => {
    if (!wo?.id) return;

    const ch = supabase
      .channel(`wo:${wo.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders", filter: `id=eq.${wo.id}` },
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
  }, [wo?.id, fetchAll]);

  // ---------- listen for inspection finish ----------
  useEffect(() => {
    interface InspectionCompletedEventDetail {
      workOrderLineId?: string;
      cause?: string;
      correction?: string;
    }

    const handler = (ev: CustomEvent<InspectionCompletedEventDetail>) => {
      const d = ev.detail || {};
      const lineId = d.workOrderLineId;
      if (!lineId) return;

      setFocusedJobId(lineId);
      setFocusedOpen(true);

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

  // simple map of active quote-lines per work_order_line
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

  // lines that are already quoted & waiting on customer
  const approvalPending = useMemo(
    () => lines.filter((l) => (l.approval_state ?? null) === "pending"),
    [lines],
  );

  // lines that still need to be sent to parts for quoting
  const linesNeedingQuote = useMemo(
    () =>
      lines.filter((l) => {
        const approval = l.approval_state ?? null;
        const status = l.status ?? "awaiting";

        // skip items already in an approval state
        if (approval === "pending" || approval === "approved" || approval === "declined") {
          return false;
        }

        // skip completed / invoiced stuff
        if (
          status === "completed" ||
          status === "ready_to_invoice" ||
          status === "invoiced"
        ) {
          return false;
        }

        // skip if already on hold specifically for parts / quote
        const hold = (l.hold_reason ?? "").toLowerCase();
        if (
          status === "on_hold" &&
          (hold.includes("part") || hold.includes("quote"))
        ) {
          return false;
        }

        return true;
      }),
    [lines],
  );

  const activeJobLines = useMemo(
    () => lines.filter((l) => (l.approval_state ?? null) !== "pending"),
    [lines],
  );

  // Quote lines that are still in play (not converted/declined)
  const approvalPendingQuotes = useMemo(
    () =>
      quoteLines.filter((q) => {
        const status = (q.status ?? "").toLowerCase();
        return status !== "converted" && status !== "declined";
      }),
    [quoteLines],
  );

  const hasAnyApprovalItems =
    approvalPending.length > 0 || approvalPendingQuotes.length > 0;

  const sortedLines = useMemo(() => {
    const pr: Record<string, number> = {
      diagnosis: 1,
      inspection: 2,
      maintenance: 3,
      repair: 4,
    };
    return [...activeJobLines].sort((a, b) => {
      const pa = pr[String(a.job_type ?? "repair")] ?? 999;
      const pb = pr[String(b.job_type ?? "repair")] ?? 999;
      if (pa !== pb) return pa - pb;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });
  }, [activeJobLines]);

  const createdAt = wo?.created_at ? new Date(wo.created_at) : null;
  const createdAtText =
    createdAt && !Number.isNaN(createdAt.getTime())
      ? format(createdAt, "PPpp")
      : "—";

  const canAssign = currentUserRole ? ASSIGN_ROLES.has(currentUserRole) : false;
  const canApprove = currentUserRole ? APPROVAL_ROLES.has(currentUserRole) : false;

  const assignablesById = useMemo(() => {
    const m: Record<string, { full_name: string | null; role: string | null }> =
      {};
    assignables.forEach((a) => {
      m[a.id] = { full_name: a.full_name, role: a.role };
    });
    return m;
  }, [assignables]);

  type WorkOrderWaiterFlags = {
    is_waiter?: boolean | null;
    waiter?: boolean | null;
    customer_waiting?: boolean | null;
  };

  const waiterFlagSource: (WorkOrder & WorkOrderWaiterFlags) | null = wo
    ? (wo as WorkOrder & WorkOrderWaiterFlags)
    : null;

  const isWaiter =
    !!(
      waiterFlagSource &&
      (waiterFlagSource.is_waiter ||
        waiterFlagSource.waiter ||
        waiterFlagSource.customer_waiting)
    );

  /* ----------------------- line actions ----------------------- */

  // hook for parts-quoting actions
  const { sendAllPendingToParts } = useWorkOrderActions({
    // we want the bulk-quote button to operate on lines that *need* quoting,
    // so feed those into the hook
    approvalPending: linesNeedingQuote,
    setPartsLineId,
    setBulkQueue,
    setBulkActive,
  });

  const approveLine = useCallback(
    async (lineId: string) => {
      if (!lineId) return;

      // When approving a line that was on parts hold:
      // - mark approval_state approved
      // - move status to queued (ready to start)
      // - clear hold + punch timestamps so tech gets a fresh Start button
      const update: DB["public"]["Tables"]["work_order_lines"]["Update"] = {
        approval_state: "approved",
        status: "queued",
        hold_reason: null,
        punched_in_at: null,
        punched_out_at: null,
      };

      const { data, error } = await supabase
        .from("work_order_lines")
        .update(update)
        .eq("id", lineId)
        .select("work_order_id")
        .maybeSingle();

      if (error) {
        toast.error(error.message);
        return;
      }

      const workOrderId =
        (data as Pick<WorkOrderLine, "work_order_id"> | null)?.work_order_id ??
        wo?.id ??
        null;

      if (workOrderId) {
        // If the work order was previously marked in_progress while waiting for parts,
        // move it back to queued to match the fact that no line is currently running.
        const { error: woErr } = await supabase
          .from("work_orders")
          .update({ status: "queued" } as DB["public"]["Tables"]["work_orders"]["Update"])
          .eq("id", workOrderId);

        if (woErr) {
          // eslint-disable-next-line no-console
          console.error(
            "[approveLine] failed to update work order status",
            woErr,
          );
        }
      }

      toast.success("Line approved");
      void fetchAll();
    },
    [fetchAll, wo?.id],
  );

  const declineLine = useCallback(
    async (lineId: string) => {
      if (!lineId) return;
      const { error } = await supabase
        .from("work_order_lines")
        .update({
          approval_state: "declined",
          status: "awaiting",
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", lineId);
      if (error) return toast.error(error.message);
      toast.success("Line declined");
      void fetchAll();
    },
    [fetchAll],
  );

  const approveQuoteLine = useCallback(
    async (quoteId: string) => {
      if (!quoteId) return;
      try {
        const res = await fetch(`/api/work-orders/quotes/${quoteId}/authorize`, {
          method: "POST",
        });
        const j = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;

        if (!res.ok || j?.error) {
          throw new Error(j?.error || "Failed to authorize quote");
        }

        toast.success("Quote authorized");
        void fetchAll();
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to authorize quote";
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

  // 🔍 open inspection – fetch template, inject corner grid, stage to session, then open generic fill screen
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

    // 1) Load the inspection template for this line
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
    const sections = prepareSectionsWithCornerGrid(
      rawSections,
      vehicleType,
      null, // no explicit ?grid override from here
    );

    const title = data.template_name ?? "Inspection";

    // 2) Stage into sessionStorage so GenericInspectionScreen can boot in the modal
    if (typeof window !== "undefined") {
      const paramsObj: Record<string, string> = {};

      if (wo?.id) paramsObj.workOrderId = wo.id;
      paramsObj.workOrderLineId = ln.id;
      paramsObj.view = "mobile";
      paramsObj.embed = "1";
      if (ln.description) paramsObj.seed = String(ln.description);

      // prefill customer / vehicle into params if available
      if (customer) {
        if (customer.first_name) paramsObj.first_name = customer.first_name;
        if (customer.last_name) paramsObj.last_name = customer.last_name;
        if (customer.phone) paramsObj.phone = customer.phone;
        if (customer.email) paramsObj.email = customer.email;
        if (customer.address) paramsObj.address = customer.address;
        if (customer.city) paramsObj.city = customer.city;
        if (customer.province) paramsObj.province = customer.province;
        if (customer.postal_code)
          paramsObj.postal_code = customer.postal_code;
      }

      if (vehicle) {
        if (vehicle.year != null)
          paramsObj.year = String(vehicle.year as string | number);
        if (vehicle.make) paramsObj.make = vehicle.make;
        if (vehicle.model) paramsObj.model = vehicle.model;
        if (vehicle.vin) paramsObj.vin = vehicle.vin;
        if (vehicle.license_plate)
          paramsObj.license_plate = vehicle.license_plate;
        if (vehicle.mileage != null)
          paramsObj.mileage = String(vehicle.mileage);
        if (vehicle.color) paramsObj.color = vehicle.color;
        if (vehicle.unit_number)
          paramsObj.unit_number = vehicle.unit_number;
        if (vehicle.engine_hours != null)
          paramsObj.engine_hours = String(vehicle.engine_hours);
      }

      sessionStorage.setItem("inspection:sections", JSON.stringify(sections));
      sessionStorage.setItem("inspection:title", title);
      sessionStorage.setItem("inspection:vehicleType", vehicleType);
      sessionStorage.setItem("inspection:template", "generic");
      sessionStorage.setItem("inspection:params", JSON.stringify(paramsObj));

      // Legacy keys for older flows
      sessionStorage.setItem(
        "customInspection:sections",
        JSON.stringify(sections),
      );
      sessionStorage.setItem("customInspection:title", title);
      sessionStorage.setItem(
        "customInspection:includeOil",
        JSON.stringify(false),
      );
    }

    // 3) Set src for the modal (mainly for debugging / template label)
    const sp = new URLSearchParams();
    sp.set("template", "generic");
    if (wo?.id) sp.set("workOrderId", wo.id);
    sp.set("workOrderLineId", ln.id);
    sp.set("embed", "1");
    sp.set("view", "mobile");
    if (ln.description) sp.set("seed", String(ln.description));

    const url = `/inspections/fill?${sp.toString()}`;

    setInspectionSrc(url);
    setInspectionOpen(true);
    toast.success("Inspection opened");
  },
  [wo?.id, customer, vehicle],
);

  // parts drawer close / bulk
  useEffect(() => {
    if (!partsLineId) return;

    const evtName = `parts-drawer:closed:${partsLineId}`;

    const handler = () => {
      if (bulkActive && bulkQueue.length > 0) {
        const [, ...rest] = bulkQueue;
        setBulkQueue(rest);
        setPartsLineId(rest[0] ?? null);
        if (rest.length === 0) {
          setBulkActive(false);
          void fetchAll();
        }
      } else {
        setPartsLineId(null);
        void fetchAll();
      }
    };

    window.addEventListener(evtName, handler as EventListener);
    return () =>
      window.removeEventListener(evtName, handler as EventListener);
  }, [partsLineId, bulkActive, bulkQueue, fetchAll]);

  /* -------------------------- UI -------------------------- */
  if (!routeId)
    return <div className="p-6 text-red-500">Missing work order id.</div>;

  const Skeleton = ({ className = "" }: { className?: string }) => (
    <div className={`animate-pulse rounded-lg bg-muted ${className}`} />
  );

  return (
    <div className="w-full bg-background px-3 py-6 text-foreground sm:px-6 lg:px-10 xl:px-16">
      <VoiceContextSetter
        currentView="work_order_page"
        workOrderId={wo?.id}
        vehicleId={vehicle?.id}
        customerId={customer?.id}
        lineId={null}
      />

      <div className="mb-4 flex items-center justify-between gap-2">
        {/* Back now goes to previous page, with /work-orders as internal fallback */}
        <PreviousPageButton />
        {/* Internal ID pill removed */}
      </div>

      {!currentUserId && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-900/10 p-3 text-sm text-amber-100">
          You appear signed out on this tab. If actions fail, open{" "}
          <Link href="/sign-in" className="underline hover:text-white">
            Sign In
          </Link>{" "}
          and return here.
        </div>
      )}

      {viewError && (
        <div className="mb-4 whitespace-pre-wrap rounded-xl border border-red-500/40 bg-red-950/60 p-3 text-sm text-red-200">
          {viewError}
        </div>
      )}

      {loading ? (
        <div className="mt-6 grid gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
          <Skeleton className="h-56" />
        </div>
      ) : !wo ? (
        <div className="mt-6 text-sm text-red-400">Work order not found.</div>
      ) : (
        <div className="space-y-6">
          {/* Header – simplified, thinner border, full-width */}
          <div className="rounded-xl border border-border/60 bg-card/90 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
                  Work Order{" "}
                  <span className="text-orange-400">
                    {wo.custom_id || `#${wo.id.slice(0, 8)}`}
                  </span>
                </h1>
                <p className="text-xs text-muted-foreground">
                  Created {createdAtText}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className={chip(wo.status)}>
                  {(wo.status ?? "awaiting").replaceAll("_", " ")}
                </span>
                {isWaiter && (
                  <span
                    className="
                      inline-flex items-center whitespace-nowrap
                      rounded-full border border-red-500
                      bg-red-500/10
                      px-4 py-1.5
                      text-xs sm:text-sm font-semibold uppercase tracking-[0.16em]
                      text-red-200
                      shadow-[0_0_18px_rgba(248,113,113,0.9)]
                    "
                  >
                    Waiter
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Vehicle & Customer – styled like the photo block */}
          <div className="rounded-xl border border-border/60 bg-card/90 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground sm:text-base">
                Vehicle &amp; Customer
              </h2>
              <button
                type="button"
                className="text-xs font-medium text-orange-400 hover:text-orange-300 hover:underline"
                onClick={() => setShowDetails((v) => !v)}
                aria-expanded={showDetails}
              >
                {showDetails ? "Hide details" : "Show details"}
              </button>
            </div>

            {showDetails && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {/* Vehicle */}
                <div className="rounded-lg bg-muted/70 p-3">
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
                        VIN:{" "}
                        <span className="font-mono">
                          {vehicle.vin ?? "—"}
                        </span>
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
                    <p className="text-sm text-muted-foreground">
                      No vehicle linked yet.
                    </p>
                  )}
                </div>

                {/* Customer */}
                <div className="rounded-lg bg-muted/70 p-3">
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
                          className="mt-2 inline-flex text-[11px] font-medium text-orange-400 hover:text-orange-300 hover:underline"
                          title="Open customer profile"
                        >
                          View customer profile →
                        </Link>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No customer linked yet.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Awaiting Customer Approval */}
          <div className="rounded-xl border border-border/60 bg-card/90 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-blue-200 sm:text-base">
                Awaiting customer approval
              </h2>
            </div>

            {!hasAnyApprovalItems ? (
              <p className="text-xs text-muted-foreground">
                No lines waiting for approval.
              </p>
            ) : (
              <>
                {approvalPending.length > 0 && (
                  <div className="space-y-2">
                    {approvalPending.map((ln, idx) => {
                      const isAwaitingPartsBase =
                        (ln.status === "on_hold" &&
                          (ln.hold_reason ?? "")
                            .toLowerCase()
                            .includes("part")) ||
                        (ln.hold_reason ?? "")
                          .toLowerCase()
                          .includes("quote");

                      const hasQuotedParts =
                        (activeQuotesByLine[ln.id] ?? []).length > 0;

                      const partsLabel = hasQuotedParts
                        ? "Quoted, awaiting approval"
                        : "Awaiting parts quote";

                      return (
                        <div
                          key={ln.id}
                          className="rounded-lg border border-border/60 bg-muted/70 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-foreground">
                                {idx + 1}.{" "}
                                {ln.description ||
                                  ln.complaint ||
                                  "Untitled job"}
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                {String(ln.job_type ?? "job").replaceAll(
                                  "_",
                                  " ",
                                )}{" "}
                                •{" "}
                                {typeof ln.labor_time === "number"
                                  ? `${ln.labor_time}h`
                                  : "—"}{" "}
                                • Status:{" "}
                                {(ln.status ?? "awaiting").replaceAll(
                                  "_",
                                  " ",
                                )}{" "}
                                • Approval:{" "}
                                {(ln.approval_state ?? "pending").replaceAll(
                                  "_",
                                  " ",
                                )}
                              </div>

                              {/* flag lines that are on hold for parts */}
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
                                  className="rounded-md border border-green-700 px-2 py-1 text-[11px] font-medium text-green-200 hover:bg-green-900/25"
                                  onClick={() => approveLine(ln.id)}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="rounded-md border border-red-700 px-2 py-1 text-[11px] font-medium text-red-200 hover:bg-red-900/30"
                                  onClick={() => declineLine(ln.id)}
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

                {approvalPendingQuotes.length > 0 && (
                  <div
                    className={
                      approvalPending.length > 0 ? "mt-4 space-y-2" : "space-y-2"
                    }
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-300">
                      Quote suggestions
                    </div>
                    {approvalPendingQuotes.map((q, idx) => (
                      <div
                        key={q.id}
                        className="rounded-lg border border-border/60 bg-muted/70 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">
                              {idx + 1}. {q.description || "Quoted item"}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {String(q.job_type ?? "job").replaceAll(
                                "_",
                                " ",
                              )}{" "}
                              •{" "}
                              {typeof q.est_labor_hours === "number"
                                ? `${q.est_labor_hours}h`
                                : "—"}{" "}
                              • Status:{" "}
                              {(q.status ?? "pending_parts").replaceAll(
                                "_",
                                " ",
                              )}
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
                                className="rounded-md border border-green-700 px-2 py-1 text-[11px] font-medium text-green-200 hover:bg-green-900/25"
                                onClick={() => approveQuoteLine(q.id)}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-red-700 px-2 py-1 text-[11px] font-medium text-red-200 hover:bg-red-900/30"
                                onClick={() => declineQuoteLine(q.id)}
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
              </>
            )}
          </div>

          {/* Jobs list – full width; JobCard handles its own status pills */}
          <div className="rounded-xl border border-border/60 bg-card/90 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-foreground sm:text-base">
                  Jobs in this work order
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Tap a job to open the focused panel with full controls.
                </p>
              </div>

              {linesNeedingQuote.length > 0 && (
                <button
                  type="button"
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-60"
                  onClick={sendAllPendingToParts}
                  disabled={bulkActive}
                  title="Send all jobs to parts for quoting"
                >
                  Quote all lines
                </button>
              )}
            </div>

            {sortedLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lines yet.</p>
            ) : (
              <div className="space-y-2">
                {sortedLines.map((ln, idx) => {
                  const punchedIn =
                    !!ln.punched_in_at && !ln.punched_out_at;

                  const partsForLine = allocsByLine[ln.id] ?? [];

                  const lineTechIds = lineTechsByLine[ln.id] ?? [];
                  const primaryId =
                    typeof ln.assigned_to === "string"
                      ? (ln.assigned_to as string)
                      : null;

                  const orderedTechIds: string[] = [];
                  if (primaryId) orderedTechIds.push(primaryId);
                  lineTechIds.forEach((tid) => {
                    if (!orderedTechIds.includes(tid)) {
                      orderedTechIds.push(tid);
                    }
                  });

                  const technicians = orderedTechIds.map((tid) => {
                    const info = assignablesById[tid];
                    return {
                      id: tid,
                      full_name: info?.full_name ?? null,
                      role: info?.role ?? null,
                    };
                  });

                  return (
                    <JobCard
                      key={ln.id}
                      index={idx}
                      line={ln}
                      parts={partsForLine}
                      technicians={technicians}
                      canAssign={canAssign}
                      isPunchedIn={punchedIn}
                      onOpen={() => {
                        setFocusedJobId(ln.id);
                        setFocusedOpen(true);
                      }}
                      onAssign={
                        canAssign
                          ? () => {
                              setAssignLineId(ln.id);
                              setAssignOpen(true);
                            }
                          : undefined
                      }
                      onOpenInspection={
                        ln.job_type === "inspection"
                          ? () => {
                              void openInspectionForLine(ln);
                            }
                          : undefined
                      }
                      onAddPart={() => {
                        setPartsLineId(ln.id);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Suggested maintenance / quick add – full-width card */}
          <div className="rounded-xl border border-border/60 bg-card/90 p-4 text-sm text-muted-foreground">
            <WorkOrderSuggestionsPanel
              workOrderId={wo.id}
              vehicleId={vehicle?.id ?? null}
              odometerKm={wo.odometer_km ?? null}
              onAdded={fetchAll}
            />
          </div>

          <div className="rounded-xl border border-border/60 bg-card/90 p-4 text-sm text-muted-foreground">
            <p>
              Select a job card above to open the focused job panel with full editing,
              punch and inspection controls.
            </p>
          </div>
        </div>
      )}

      {/* Vehicle photos */}
      {vehicle?.id && (
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold text-foreground sm:text-xl">
            Vehicle photos
          </h2>
          <VehiclePhotoUploader vehicleId={vehicle.id} />
          <VehiclePhotoGallery
            vehicleId={vehicle.id}
            currentUserId={currentUserId || "anon"}
          />
        </div>
      )}

      {/* Focused job modal */}
      {focusedOpen && focusedJobId && (
        <FocusedJobModal
          isOpen={focusedOpen}
          onClose={() => setFocusedOpen(false)}
          workOrderLineId={focusedJobId}
          onChanged={fetchAll}
          mode="tech"
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
                  year: (
                    vehicle.year as string | number | null
                  )?.toString() ?? null,
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
          jobNotes={
            lines.find((l) => l.id === partsLineId)?.notes ?? null
          }
          closeEventName={`parts-drawer:closed:${partsLineId}`}
        />
      )}

      {/* Inspection modal */}
      {inspectionOpen && inspectionSrc && (
        <InspectionModal
          open={inspectionOpen}
          src={inspectionSrc}
          title="Inspection"
          onClose={() => setInspectionOpen(false)}
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

      <VoiceButton />
    </div>
  );
}