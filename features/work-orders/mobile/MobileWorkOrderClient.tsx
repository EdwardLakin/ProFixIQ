// features/work-orders/mobile/MobileWorkOrderClient.tsx (FULL FILE REPLACEMENT)
// ✅ Theme aligned to MobileTechHome (metal-panel / metal-card)
// ✅ Adds ?focus=<workOrderLineId> handling so MobileTechHome links open focused job automatically
// ✅ Adds templateName + template_id params when opening inspections (best-effort lookup)
// ❗ Leaves all behavior + logic the same otherwise

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";

import { supabaseBrowser as supabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import VoiceContextSetter from "@/features/shared/voice/VoiceContextSetter";
import { useTabState } from "@/features/shared/hooks/useTabState";
import { JobCard } from "@/features/work-orders/mobile/MobileJobCard";
import MobileFocusedJob from "@/features/work-orders/mobile/MobileFocusedJob";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type WorkOrderQuoteLine =
  DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type WorkOrderQuoteLineWithLineId = WorkOrderQuoteLine & {
  work_order_line_id?: string | null;
};

// 🔹 Extra metadata shape for inspection template ids (mirrors desktop logic)
type WorkOrderLineWithInspectionMeta = WorkOrderLine & {
  inspection_template_id?: string | null;
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

// 🔹 Desktop-style helper for finding the inspection template id on a line
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

/* ---------------------------- Badges (WO header) ---------------------------- */

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
  "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-medium tracking-wide";

const BADGE: Record<KnownStatus, string> = {
  awaiting_approval:
    "bg-sky-900/30 border-sky-400/60 text-sky-200 shadow-[0_0_18px_rgba(56,189,248,0.35)]",
  awaiting:
    "bg-slate-900/40 border-slate-400/60 text-slate-200 shadow-[0_0_18px_rgba(148,163,184,0.25)]",
  queued:
    "bg-indigo-900/30 border-indigo-400/70 text-indigo-200 shadow-[0_0_18px_rgba(129,140,248,0.40)]",
  in_progress:
    "bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.32),rgba(15,23,42,0.9))] border-[color:var(--accent-copper-soft)] text-[color:var(--accent-copper-light)] shadow-[0_0_20px_rgba(248,113,22,0.50)]",
  on_hold:
    "bg-amber-950/40 border-amber-400/70 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.35)]",
  planned:
    "bg-purple-950/40 border-purple-400/70 text-purple-200 shadow-[0_0_18px_rgba(147,51,234,0.40)]",
  new:
    "bg-neutral-900/80 border-neutral-500/70 text-neutral-200 shadow-[0_0_14px_rgba(148,163,184,0.28)]",
  completed:
    "bg-emerald-950/50 border-emerald-400/70 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.55)]",
  ready_to_invoice:
    "bg-emerald-950/40 border-emerald-400/80 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.55)]",
  invoiced:
    "bg-teal-950/40 border-teal-400/80 text-teal-200 shadow-[0_0_20px_rgba(45,212,191,0.55)]",
};

const chip = (s: string | null | undefined): string => {
  const key = (s ?? "awaiting")
    .toLowerCase()
    .replaceAll(" ", "_") as KnownStatus;
  return `${BASE_BADGE} ${BADGE[key] ?? BADGE.awaiting}`;
};

/* ------------------------ Line status → card styles ------------------------ */

type LineRollupStatus = "awaiting" | "in_progress" | "on_hold" | "completed";

const LINE_STATUS_LABELS: Record<LineRollupStatus, string> = {
  awaiting: "Awaiting",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Completed",
};

const LINE_CARD_STYLES: Record<LineRollupStatus, string> = {
  awaiting: "border-[var(--metal-border-soft)] bg-black/30",
  in_progress:
    "border-[var(--accent-copper-soft)] bg-[radial-gradient(circle_at_top,_rgba(212,118,49,0.18),rgba(15,23,42,0.96))] shadow-[0_0_26px_rgba(212,118,49,0.55)]",
  on_hold:
    "border-amber-500/70 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.14),rgba(15,23,42,0.98))]",
  completed:
    "border-emerald-500/60 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),rgba(15,23,42,0.97))]",
};

const LINE_PILL_STYLES: Record<LineRollupStatus, string> = {
  awaiting: "border-slate-500/70 bg-slate-900/60 text-slate-200",
  in_progress:
    "border-[var(--accent-copper-soft)] bg-[rgba(212,118,49,0.16)] text-[var(--accent-copper-light)] shadow-[0_0_20px_rgba(212,118,49,0.55)]",
  on_hold: "border-amber-400/70 bg-amber-500/12 text-amber-100",
  completed: "border-emerald-400/70 bg-emerald-500/12 text-emerald-100",
};

function toLineBucket(status: string | null | undefined): LineRollupStatus {
  const s = (status ?? "").toLowerCase();
  if (s === "in_progress") return "in_progress";
  if (s === "on_hold") return "on_hold";
  if (s === "completed" || s === "ready_to_invoice" || s === "invoiced") {
    return "completed";
  }
  return "awaiting";
}

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

export default function MobileWorkOrderClient({
  routeId,
}: {
  routeId: string;
}): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ✅ handle ?focus=<workOrderLineId>
  const focusParam = searchParams?.get("focus") ?? null;
  const handledFocusRef = useRef<string | null>(null);

  // 🔥 IMPORTANT: scope tab-state keys by routeId so different work orders don’t bleed state
  const keyBase = useMemo(() => `m:wo:${routeId}`, [routeId]);

  const [wo, setWo] = useTabState<WorkOrder | null>(`${keyBase}:wo`, null);
  const [lines, setLines] = useTabState<WorkOrderLine[]>(
    `${keyBase}:lines`,
    [],
  );
  const [quoteLines, setQuoteLines] = useTabState<WorkOrderQuoteLine[]>(
    `${keyBase}:quoteLines`,
    [],
  );
  const [vehicle, setVehicle] = useTabState<Vehicle | null>(
    `${keyBase}:veh`,
    null,
  );
  const [customer, setCustomer] = useTabState<Customer | null>(
    `${keyBase}:cust`,
    null,
  );

  const [loading, setLoading] = useState<boolean>(false);
  const [viewError, setViewError] = useState<string | null>(null);

  const [techNamesById, setTechNamesById] = useState<Record<string, string>>(
    {},
  );

  const [currentUserId, setCurrentUserId] = useTabState<string | null>(
    `${keyBase}:uid`,
    null,
  );
  const [, setUserId] = useTabState<string | null>(
    `${keyBase}:effectiveUid`,
    null,
  );
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  const [shopId, setShopId] = useTabState<string | null>(
    `${keyBase}:shopId`,
    null,
  );

  const [showDetails, setShowDetails] = useTabState<boolean>(
    `${keyBase}:showDetails`,
    true,
  );
  const [warnedMissing, setWarnedMissing] = useState(false);

  // mobile focused job view
  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);
  const [focusedOpen, setFocusedOpen] = useState(false);

  /* ---------------------- AUTH ---------------------- */
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
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("role, shop_id")
          .eq("id", uid)
          .maybeSingle();

        if (!profErr) {
          setCurrentUserRole(prof?.role ?? null);
          setShopId((prof?.shop_id as string | null) ?? null);
        } else {
          setCurrentUserRole(null);
          setShopId(null);
        }
      } else {
        setCurrentUserRole(null);
        setShopId(null);
      }

      if (!uid) setLoading(false);
    };

    void waitForSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (s?.user) void waitForSession();
      else {
        setCurrentUserId(null);
        setUserId(null);
        setCurrentUserRole(null);
        setShopId(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [routeId, setCurrentUserId, setUserId, setShopId]);

  /* ---------------------- FETCH ---------------------- */
  const fetchAll = useCallback(
    async (retry = 0) => {
      if (!routeId) return;
      setLoading(true);
      setViewError(null);

      try {
        let woRow: WorkOrder | null = null;

        // 1) by UUID
        if (looksLikeUuid(routeId)) {
          const { data, error } = await supabase
            .from("work_orders")
            .select("*")
            .eq("id", routeId)
            .maybeSingle();
          if (!error) woRow = (data as WorkOrder | null) ?? null;
        }

        // 2) by custom_id (NOW SHOP-SCOPED when we have shopId)
        if (!woRow) {
          // exact match
          const eqQuery = supabase
            .from("work_orders")
            .select("*")
            .eq("custom_id", routeId);

          const eqRes = shopId
            ? await eqQuery.eq("shop_id", shopId).maybeSingle()
            : await eqQuery.maybeSingle();

          woRow = (eqRes.data as WorkOrder | null) ?? null;

          // ilike match
          if (!woRow) {
            const ilikeQuery = supabase
              .from("work_orders")
              .select("*")
              .ilike("custom_id", routeId.toUpperCase());

            const ilikeRes = shopId
              ? await ilikeQuery.eq("shop_id", shopId).maybeSingle()
              : await ilikeQuery.maybeSingle();

            woRow = (ilikeRes.data as WorkOrder | null) ?? null;
          }

          // prefix + number normalization fallback
          if (!woRow) {
            const { prefix, n } = splitCustomId(routeId);
            if (n !== null) {
              const candQuery = supabase
                .from("work_orders")
                .select("*")
                .ilike("custom_id", `${prefix}%`)
                .limit(50);

              const { data: cands } = shopId
                ? await candQuery.eq("shop_id", shopId)
                : await candQuery;

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

        const [linesRes, vehRes, custRes, quotesRes] = await Promise.all([
          supabase
            .from("work_order_lines")
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
          supabase
            .from("work_order_quote_lines")
            .select("*")
            .eq("work_order_id", woRow.id)
            .order("created_at", { ascending: true }),
        ]);

        if (linesRes.error) throw linesRes.error;
        const lineRows = (linesRes.data ?? []) as WorkOrderLine[];
        setLines(lineRows);

        // 🔹 populate tech names from assigned_to
        const techIds = Array.from(
          new Set(
            lineRows
              .map((ln) => ln.assigned_to)
              .filter((id): id is string => Boolean(id)),
          ),
        );

        if (techIds.length > 0) {
          const { data: techProfiles, error: techErr } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", techIds);

          if (!techErr && techProfiles) {
            const map: Record<string, string> = {};
            techProfiles.forEach((p) => {
              map[p.id] = p.full_name ?? "Technician";
            });
            setTechNamesById(map);
          } else {
            setTechNamesById({});
          }
        } else {
          setTechNamesById({});
        }

        if (quotesRes.error) throw quotesRes.error;
        setQuoteLines((quotesRes.data as WorkOrderQuoteLine[] | null) ?? []);

        if (vehRes?.error) throw vehRes.error;
        setVehicle((vehRes?.data as Vehicle | null) ?? null);

        if (custRes?.error) throw custRes.error;
        setCustomer((custRes?.data as Customer | null) ?? null);
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : "Failed to load work order.";
        setViewError(msg);
        // eslint-disable-next-line no-console
        console.error("[Mobile WO id page] load error:", e);
      } finally {
        setLoading(false);
      }
    },
    [
      routeId,
      shopId,
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
      .channel(`m:wo:${wo.id}`)
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
          table: "work_order_quote_lines",
          filter: `work_order_id=eq.${wo.id}`,
        },
        () => fetchAll(),
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        //
      }
    };
  }, [wo?.id, fetchAll]);

  // 🔁 refresh when a parts request or inspection completes
  useEffect(() => {
    const handleParts = () => {
      void fetchAll();
    };
    const handleInspectionCompleted = (
      ev: CustomEvent<{
        workOrderLineId?: string;
        cause?: string;
        correction?: string;
      }>,
    ) => {
      const d = ev.detail || {};
      const lineId = d.workOrderLineId;
      if (!lineId) return;

      setFocusedJobId(lineId);
      setFocusedOpen(true);

      // legacy event for desktop flow – harmless if unused on mobile
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

    window.addEventListener("parts-request:submitted", handleParts);
    window.addEventListener(
      "inspection:completed",
      handleInspectionCompleted as EventListener,
    );

    return () => {
      window.removeEventListener("parts-request:submitted", handleParts);
      window.removeEventListener(
        "inspection:completed",
        handleInspectionCompleted as EventListener,
      );
    };
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

  const approvalPending = useMemo(
    () => lines.filter((l) => (l.approval_state ?? null) === "pending"),
    [lines],
  );

  const quotePending = useMemo(
    () =>
      quoteLines.filter((q) => {
        const status = (q.status ?? "").toLowerCase();
        return status !== "converted" && status !== "declined";
      }),
    [quoteLines],
  );

  const activeJobLines = useMemo(
    () => lines.filter((l) => (l.approval_state ?? null) !== "pending"),
    [lines],
  );

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

  const canAssign = false; // assignments handled in focused view / desktop
  const canApprove = currentUserRole
    ? APPROVAL_ROLES.has(currentUserRole)
    : false;

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

  const hasAnyPending = approvalPending.length > 0 || quotePending.length > 0;

  /* ----------------------- line & quote actions ----------------------- */

  const approveLine = useCallback(
    async (lineId: string) => {
      if (!lineId) return;
      const { error } = await supabase
        .from("work_order_lines")
        .update({
          approval_state: "approved",
          status: "queued",
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", lineId);
      if (error) return toast.error(error.message);
      toast.success("Line approved");
      void fetchAll();
    },
    [fetchAll],
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

  const sendToParts = useCallback(async (lineId: string) => {
    if (!lineId) return;
    const { error } = await supabase
      .from("work_order_lines")
      .update({
        status: "on_hold",
        hold_reason: "Awaiting parts quote",
      } as DB["public"]["Tables"]["work_order_lines"]["Update"])
      .eq("id", lineId);
    if (error) return toast.error(error.message);
    toast.success("Sent to parts for quoting");
  }, []);

  const sendAllPendingToParts = useCallback(async () => {
    if (!approvalPending.length) return;
    const ids = approvalPending.map((l) => l.id);
    const { error } = await supabase
      .from("work_order_lines")
      .update({
        status: "on_hold",
        hold_reason: "Awaiting parts quote",
      } as DB["public"]["Tables"]["work_order_lines"]["Update"])
      .in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Queued all pending lines for parts quoting");
  }, [approvalPending]);

  const authorizeQuote = useCallback(
    async (quoteId: string) => {
      if (!quoteId) return;
      try {
        const res = await fetch(
          `/api/work-orders/quotes/${quoteId}/authorize`,
          {
            method: "POST",
          },
        );
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(j?.error || "Failed to authorize quote line");
        }
        toast.success("Quote authorized and added as job line");
        void fetchAll();
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : "Failed to authorize quote line",
        );
      }
    },
    [fetchAll],
  );

  const declineQuote = useCallback(
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

  // 🔹 Open mobile inspection page for a given line
  const openInspection = useCallback(
    async (ln: WorkOrderLine) => {
      if (!ln?.id || !wo?.id) return;

      const anyLine = ln as WorkOrderLineWithInspectionMeta;
      const templateId = extractInspectionTemplateId(anyLine);

      if (!templateId) {
        toast.error(
          "This job line doesn't have an inspection template attached yet. Attach or build a template first.",
        );
        return;
      }

      // ✅ NEW: best-effort lookup for template_name so mobile can display it
      let templateName: string | null = null;
      try {
        const { data } = await supabase
          .from("inspection_templates")
          .select("template_name")
          .eq("id", templateId)
          .maybeSingle();
        templateName =
          (data as { template_name?: string | null } | null)?.template_name ??
          null;
      } catch {
        // ignore (we can still open with templateId)
      }

      const sp = new URLSearchParams();
      sp.set("workOrderId", wo.id);
      sp.set("workOrderLineId", ln.id);

      sp.set("templateId", templateId);
      sp.set("template_id", templateId);

      if (templateName) {
        sp.set("templateName", templateName);
        sp.set("template_name", templateName);
      }

      sp.set("view", "mobile");

      router.push(`/mobile/inspections/${ln.id}?${sp.toString()}`);
    },
    [router, wo?.id],
  );

  /* ----------------------- ✅ focus param handling ----------------------- */

  useEffect(() => {
    // open focused job from URL once per unique focus value
    if (!focusParam) return;
    if (handledFocusRef.current === focusParam) return;

    // only attempt once we have loaded at least once
    if (loading) return;

    handledFocusRef.current = focusParam;
    setFocusedJobId(focusParam);
    setFocusedOpen(true);
  }, [focusParam, loading]);

  /* ----------------------- mobile focused job view ----------------------- */

  if (focusedOpen && focusedJobId) {
    return (
      <MobileFocusedJob
        workOrderLineId={focusedJobId}
        onBack={() => setFocusedOpen(false)}
        onChanged={fetchAll}
        mode="tech"
      />
    );
  }

  /* -------------------------- UI -------------------------- */
  if (!routeId)
    return <div className="p-6 text-red-400">Missing work order id.</div>;

  const Skeleton = ({ className = "" }: { className?: string }) => (
    <div
      className={`metal-card animate-pulse rounded-2xl border border-[var(--metal-border-soft)] bg-black/40 backdrop-blur ${className}`}
    />
  );

  return (
    <div className="space-y-6 px-4 py-4 text-white">
      <VoiceContextSetter
        currentView="work_order_page_mobile"
        workOrderId={wo?.id}
        vehicleId={vehicle?.id}
        customerId={customer?.id}
        lineId={null}
      />

      {/* header bar */}
      <div className="flex items-center justify-between gap-2">
        <PreviousPageButton />
        {wo?.custom_id && (
          <span className="rounded-full border border-[var(--metal-border-soft)] bg-black/40 px-3 py-1 text-[11px] text-neutral-300 backdrop-blur">
            Internal ID:{" "}
            <span className="font-mono text-neutral-100">
              {wo.id.slice(0, 8)}
            </span>
          </span>
        )}
      </div>

      {!currentUserId && (
        <div className="metal-panel metal-panel--card rounded-2xl border border-amber-500/40 px-3 py-3 text-xs text-amber-100 shadow-[0_18px_40px_rgba(0,0,0,0.75)]">
          You appear signed out on this tab. If actions fail, open{" "}
          <Link
            href="/sign-in"
            className="underline decoration-dotted underline-offset-2 hover:text-white"
          >
            Sign In
          </Link>{" "}
          and return here.
        </div>
      )}

      {viewError && (
        <div className="metal-panel metal-panel--card whitespace-pre-wrap rounded-2xl border border-red-500/50 px-3 py-3 text-xs text-red-100 shadow-[0_18px_40px_rgba(0,0,0,0.75)]">
          {viewError}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
          <Skeleton className="h-40" />
        </div>
      ) : !wo ? (
        <div className="text-sm text-red-300">Work order not found.</div>
      ) : (
        <div className="space-y-6">
          {/* Header card */}
          <div className="metal-panel metal-panel--card rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.85)]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold sm:text-xl">
                    Work Order{" "}
                    <span className="text-[color:var(--accent-copper-light)]">
                      {wo.custom_id || `#${wo.id.slice(0, 8)}`}
                    </span>
                  </h1>
                  <span className={chip(wo.status)}>
                    {(wo.status ?? "awaiting").replaceAll("_", " ")}
                  </span>
                  {isWaiter && (
                    <span
                      className="
                        ml-auto
                        inline-flex items-center whitespace-nowrap
                        rounded-full border border-red-500/80
                        bg-red-500/10
                        px-4 py-1.5
                        text-xs sm:text-sm font-semibold uppercase tracking-[0.16em]
                        text-red-200
                        shadow-[0_0_18px_rgba(239,68,68,0.55)]
                      "
                    >
                      Waiter
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400">
                  Created {createdAtText}
                </p>
              </div>
            </div>

            <div className="mt-3 grid gap-3 text-[11px] text-neutral-300 sm:grid-cols-2">
              <div>
                <div className="text-neutral-500">Created</div>
                <div>{createdAtText}</div>
              </div>
              <div>
                <div className="text-neutral-500">WO ID</div>
                <div className="truncate font-mono text-[11px] text-neutral-200">
                  {wo.id}
                </div>
              </div>
              <div>
                <div className="text-neutral-500">Custom ID</div>
                <div className="truncate">
                  {wo.custom_id ?? (
                    <span className="text-neutral-500">Not set</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-neutral-500">Status</div>
                <div className="mt-0.5">
                  <span className={chip(wo.status)}>
                    {(wo.status ?? "awaiting").replaceAll("_", " ")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Vehicle & Customer */}
          <div className="metal-panel metal-panel--card rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 shadow-[0_14px_36px_rgba(0,0,0,0.80)]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold sm:text-base">
                Vehicle &amp; Customer
              </h2>
              <button
                type="button"
                className="text-[11px] font-medium text-[color:var(--accent-copper-light)] underline-offset-2 hover:underline"
                onClick={() => setShowDetails((v) => !v)}
                aria-expanded={showDetails}
              >
                {showDetails ? "Hide details" : "Show details"}
              </button>
            </div>

            {showDetails && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="metal-card rounded-2xl border border-[var(--metal-border-soft)] bg-black/35 p-3">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                    Vehicle
                  </h3>
                  {vehicle ? (
                    <>
                      <p className="text-sm font-medium text-white">
                        {(vehicle.year ?? "").toString()} {vehicle.make ?? ""}{" "}
                        {vehicle.model ?? ""}
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-400">
                        VIN:{" "}
                        <span className="font-mono">{vehicle.vin ?? "—"}</span>
                        <br />
                        Plate:{" "}
                        {vehicle.license_plate ?? (
                          <span className="text-neutral-500">—</span>
                        )}
                        <br />
                        Mileage:{" "}
                        {vehicle.mileage ?? (
                          <span className="text-neutral-500">—</span>
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-neutral-500">
                      No vehicle linked yet.
                    </p>
                  )}
                </div>

                <div className="metal-card rounded-2xl border border-[var(--metal-border-soft)] bg-black/35 p-3">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                    Customer
                  </h3>
                  {customer ? (
                    <>
                      <p className="text-sm font-medium text-white">
                        {[customer.first_name ?? "", customer.last_name ?? ""]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-400">
                        {customer.phone ?? "—"}{" "}
                        {customer.email ? (
                          <>
                            <span className="mx-1 text-neutral-600">•</span>
                            {customer.email}
                          </>
                        ) : null}
                      </p>
                      {customer.id && (
                        <Link
                          href={`/mobile/work-orders/${wo.id}/vehicle`}
                          className="mt-2 inline-flex text-[11px] font-medium text-[color:var(--accent-copper-light)] underline-offset-2 hover:underline"
                          title="Open customer profile"
                        >
                          View customer profile →
                        </Link>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-neutral-500">
                      No customer linked yet.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Awaiting Customer Approval */}
          <div className="metal-panel metal-panel--card rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 shadow-[0_22px_55px_rgba(0,0,0,0.95)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-neutral-100 sm:text-base">
                Awaiting customer approval
              </h2>
              {approvalPending.length > 1 && (
                <button
                  type="button"
                  className="rounded-full bg-[var(--accent-copper-soft)] px-3 py-1.5 text-[11px] font-semibold text-black shadow-[0_0_18px_rgba(212,118,49,0.55)] hover:bg-[var(--accent-copper-light)]"
                  onClick={sendAllPendingToParts}
                  title="Queue all lines for parts quoting"
                >
                  Quote all pending lines
                </button>
              )}
            </div>

            {!hasAnyPending ? (
              <p className="text-xs text-neutral-400">
                No lines waiting for approval.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Job lines needing approval */}
                {approvalPending.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                      Jobs awaiting approval
                    </div>
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
                          className="metal-card rounded-2xl border border-[var(--metal-border-soft)] bg-black/35 p-3"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-white">
                                {idx + 1}.{" "}
                                {ln.description ||
                                  ln.complaint ||
                                  "Untitled job"}
                              </div>
                              <div className="mt-0.5 text-[11px] text-neutral-300">
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

                              {isAwaitingPartsBase && (
                                <div className="mt-1 inline-flex items-center rounded-full border border-[var(--accent-copper-soft)]/70 bg-[rgba(212,118,49,0.10)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-copper-light)]">
                                  {partsLabel}
                                </div>
                              )}

                              {ln.notes && (
                                <div className="mt-1 text-[11px] text-neutral-300">
                                  Notes: {ln.notes}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {canApprove && (
                                <>
                                  <button
                                    type="button"
                                    className="rounded-md border border-emerald-400/80 px-2.5 py-1 text-[11px] font-medium text-emerald-100 hover:bg-emerald-500/10"
                                    onClick={() => approveLine(ln.id)}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-md border border-red-400/80 px-2.5 py-1 text-[11px] font-medium text-red-100 hover:bg-red-500/10"
                                    onClick={() => declineLine(ln.id)}
                                  >
                                    Decline
                                  </button>
                                </>
                              )}

                              {isAwaitingPartsBase ? (
                                <button
                                  type="button"
                                  disabled
                                  className="cursor-not-allowed rounded-md border border-neutral-600/70 px-2.5 py-1 text-[11px] text-neutral-400"
                                >
                                  Sent to parts
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="rounded-md border border-[var(--accent-copper-soft)]/80 px-2.5 py-1 text-[11px] font-medium text-[var(--accent-copper-light)] hover:bg-[rgba(212,118,49,0.12)]"
                                  onClick={() => sendToParts(ln.id)}
                                  title="Send to parts for quoting"
                                >
                                  Send to parts
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Quote lines created from AI suggestions etc. */}
                {quotePending.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                      Quote lines / AI suggestions
                    </div>
                    {quotePending.map((q, idx) => (
                      <div
                        key={q.id}
                        className="metal-card rounded-2xl border border-[var(--metal-border-soft)] bg-black/35 p-3"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-white">
                              {idx + 1}. {q.description}
                            </div>
                            <div className="mt-0.5 text-[11px] text-neutral-300">
                              {String(q.job_type ?? "job").replaceAll(
                                "_",
                                " ",
                              )}{" "}
                              •{" "}
                              {typeof q.est_labor_hours === "number"
                                ? `${q.est_labor_hours}h`
                                : "—"}{" "}
                              • Quote status:{" "}
                              {(q.status ?? "pending_parts").replaceAll(
                                "_",
                                " ",
                              )}
                            </div>
                            {q.notes && (
                              <div className="mt-1 text-[11px] text-neutral-300">
                                Notes: {q.notes}
                              </div>
                            )}
                          </div>

                          {canApprove && (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="rounded-md border border-emerald-400/80 px-2.5 py-1 text-[11px] font-medium text-emerald-100 hover:bg-emerald-500/10"
                                onClick={() => authorizeQuote(q.id)}
                              >
                                Approve &amp; add job
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-red-400/80 px-2.5 py-1 text-[11px] font-medium text-red-100 hover:bg-red-500/10"
                                onClick={() => declineQuote(q.id)}
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
              </div>
            )}
          </div>

          {/* Jobs list */}
          <div className="metal-panel metal-panel--card rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 shadow-[0_16px_40px_rgba(0,0,0,0.88)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold sm:text-base">
                  Jobs in this work order
                </h2>
                <p className="text-[11px] text-neutral-500">
                  Tap a job or open inspection to go into the focused job view.
                </p>
              </div>
            </div>

            {sortedLines.length === 0 ? (
              <p className="text-sm text-neutral-400">No lines yet.</p>
            ) : (
              <div className="space-y-2">
                {sortedLines.map((ln, idx) => {
                  const punchedIn = !!ln.punched_in_at && !ln.punched_out_at;

                  const openFocused = () => {
                    setFocusedJobId(ln.id);
                    setFocusedOpen(true);
                  };

                  const assignedTechName = ln.assigned_to
                    ? techNamesById[ln.assigned_to] ?? "Assigned tech"
                    : null;

                  const bucket = toLineBucket(ln.status);
                  const cardColor = LINE_CARD_STYLES[bucket];
                  const pillColor = LINE_PILL_STYLES[bucket];
                  const statusLabel = LINE_STATUS_LABELS[bucket];

                  return (
                    <div
                      key={ln.id}
                      className={[
                        "space-y-1 rounded-2xl border p-2 transition-shadow",
                        cardColor,
                        punchedIn ? "ring-2 ring-emerald-500/80" : "ring-0",
                      ].join(" ")}
                    >
                      {/* header row with status pill on the right */}
                      <div className="mb-1 flex items-center justify-between gap-2 px-1">
                        <div className="text-[11px] text-neutral-400">
                          {idx + 1}.{" "}
                          {String(ln.job_type ?? "job").replaceAll(
                            "_",
                            " ",
                          )}
                        </div>
                        <span
                          className={[
                            "inline-flex items-center rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em]",
                            pillColor,
                          ].join(" ")}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      <div className="metal-card rounded-2xl border border-[var(--metal-border-soft)] bg-black/35">
                        <JobCard
                          index={idx}
                          line={ln}
                          parts={[]} // stripped-down: no parts list on main mobile view
                          technicians={[]} // assignment handled in focused view / desktop
                          canAssign={canAssign}
                          isPunchedIn={punchedIn}
                          onOpen={openFocused}
                          onAssign={undefined}
                          onOpenInspection={() => void openInspection(ln)}
                          onAddPart={undefined}
                        />
                      </div>

                      {/* Assigned tech pill */}
                      <div className="pl-2 pt-1 text-[11px] text-neutral-400">
                        Assigned to:{" "}
                        <span className="font-medium text-neutral-200">
                          {assignedTechName ?? "Unassigned"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}