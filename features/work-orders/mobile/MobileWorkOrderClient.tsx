// features/work-orders/mobile/MobileWorkOrderClient.tsx (FULL FILE REPLACEMENT)
// ✅ Theme aligned to MobileTechHome (metal-panel / metal-card)
// ✅ Adds ?focus=<workOrderLineId> handling so MobileTechHome links open focused job automatically
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
import { JobCard } from "@/features/work-orders/components/JobCard";
import MobileFocusedJob from "@/features/work-orders/mobile/MobileFocusedJob";
import AskAssistantEntry from "@/features/assistant/components/AskAssistantEntry";
import { runJobPunchTransition } from "@/features/work-orders/lib/jobPunchTransitionsClient";
import { isReviewableQuoteLine } from "@/features/work-orders/lib/quotes/reviewableQuoteLines";
import {
  applyFetchedMobileDetailSnapshot,
  deriveMobileDetailOperationalState,
} from "@/features/work-orders/mobile/detailOperationalState";
import {
  getOfflineMutationScope,
  getOfflineSyncSummary,
  setOfflineMutationScope,
  subscribeOfflineMutations,
} from "@/features/shared/lib/offline/mutations";
import { saveOfflineSnapshot } from "@/features/shared/lib/offline/database";
import {
  loadProjectedWorkOrderSnapshot,
  type MobileWorkOrderSnapshot,
} from "@/features/work-orders/mobile/technicianOfflineExecution";
import { useTabs } from "@/features/shared/components/tabs/TabsProvider";

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
  | "waiting_parts"
  | "awaiting"
  | "assigned"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "unassigned"
  | "planned"
  | "new"
  | "completed"
  | "ready_to_invoice"
  | "invoiced";

const BASE_BADGE =
  "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-medium tracking-wide";

const BADGE: Record<KnownStatus, string> = {
  awaiting_approval:
    "bg-amber-500/12 border-amber-300/65 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.24)]",
  waiting_parts:
    "bg-indigo-500/12 border-indigo-300/65 text-indigo-100 shadow-[0_0_18px_rgba(129,140,248,0.24)]",
  awaiting:
    "bg-[color:var(--theme-surface-panel)] border-[color:var(--theme-border-soft)] text-[color:var(--theme-text-primary)] shadow-[0_0_18px_rgba(148,163,184,0.25)]",
  queued:
    "bg-indigo-900/30 border-indigo-400/70 text-indigo-200 shadow-[0_0_18px_rgba(129,140,248,0.40)]",
  in_progress:
    "border-cyan-300/70 bg-cyan-500/14 text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.30)]",
  on_hold:
    "bg-amber-500/12 border-amber-300/65 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.24)]",
  assigned:
    "bg-sky-900/30 border-sky-400/60 text-sky-200 shadow-[0_0_18px_rgba(56,189,248,0.35)]",
  unassigned:
    "bg-[color:var(--theme-surface-panel-strong)] border-[color:var(--theme-border-soft)] text-[color:var(--theme-text-primary)] shadow-[0_0_14px_rgba(148,163,184,0.20)]",
  planned:
    "bg-purple-950/40 border-purple-400/70 text-purple-200 shadow-[0_0_18px_rgba(147,51,234,0.40)]",
  new:
    "bg-[color:var(--theme-surface-panel)] border-[color:var(--theme-border-soft)] text-[color:var(--theme-text-primary)] shadow-[0_0_14px_rgba(148,163,184,0.28)]",
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

/* Mobile detail operational status is derived in detailOperationalState.ts. */

/* ------------------------------------------------------------------------- */

export default function MobileWorkOrderClient({
  routeId,
}: {
  routeId: string;
}): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { updateActiveTab } = useTabs();

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
  const [offlineSummary, setOfflineSummary] = useState(() => getOfflineSyncSummary());

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

      const uid = user?.id ?? session?.user.id ?? null;
      setCurrentUserId(uid);
      setUserId(uid);

      if (uid) {
        const cachedScope = getOfflineMutationScope();
        if (!navigator.onLine && cachedScope?.userId === uid) {
          setCurrentUserRole(session?.user.user_metadata?.role ?? null);
          setShopId(cachedScope.shopId);
          setLoading(false);
          return;
        }
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("role, shop_id")
          .eq("id", uid)
          .maybeSingle();

        if (!profErr) {
          setCurrentUserRole(prof?.role ?? null);
          setShopId((prof?.shop_id as string | null) ?? null);
          if (prof?.shop_id) setOfflineMutationScope({ userId: uid, shopId: prof.shop_id });
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

  useEffect(() => {
    const refresh = () => setOfflineSummary(getOfflineSyncSummary());
    return subscribeOfflineMutations(refresh);
  }, []);

  /* ---------------------- FETCH ---------------------- */
  const fetchAll = useCallback(
    async (retry = 0) => {
      if (!routeId) return;
      setLoading(true);
      setViewError(null);

      const scope = currentUserId && shopId ? { userId: currentUserId, shopId } : null;
      const loadCached = async (): Promise<boolean> => {
        if (!scope) return false;
        const cached = await loadProjectedWorkOrderSnapshot({
          scope,
          entityId: routeId,
        });
        if (!cached) return false;
        setWo(cached.workOrder);
        setLines(cached.lines);
        setQuoteLines(cached.quoteLines);
        setVehicle(cached.vehicle);
        setCustomer(cached.customer);
        setTechNamesById(cached.techNamesById);
        setViewError("Offline copy · changes may be newer on the server.");
        return true;
      };

      if (!navigator.onLine) {
        if (!(await loadCached())) setViewError("No saved copy of this work order is available.");
        setLoading(false);
        return;
      }

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
        const freshCore = applyFetchedMobileDetailSnapshot({
          cachedWorkOrder: null,
          cachedLines: [],
          fetchedWorkOrder: woRow,
          fetchedLines: lineRows,
        });
        setWo(freshCore.workOrder);
        setLines(freshCore.lines);

        // 🔹 populate tech names from assigned_tech_id
        const techIds = Array.from(
          new Set(
            lineRows
              .map((ln) => ln.assigned_tech_id)
              .filter((id): id is string => Boolean(id)),
          ),
        );

        const techMap: Record<string, string> = {};
        if (techIds.length > 0) {
          const { data: techProfiles, error: techErr } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", techIds);

          if (!techErr && techProfiles) {
            techProfiles.forEach((p) => {
              techMap[p.id] = p.full_name ?? "Technician";
            });
            setTechNamesById(techMap);
          } else {
            setTechNamesById({});
          }
        } else {
          setTechNamesById({});
        }

        const freshQuoteLines = quotesRes.error
          ? []
          : ((quotesRes.data as WorkOrderQuoteLine[] | null) ?? []);
        const freshVehicle = vehRes?.error ? null : ((vehRes?.data as Vehicle | null) ?? null);
        const freshCustomer = custRes?.error ? null : ((custRes?.data as Customer | null) ?? null);

        if (quotesRes.error) {
          setQuoteLines([]);
          console.error("[Mobile WO id page] quote lines load error:", quotesRes.error);
        } else {
          setQuoteLines((quotesRes.data as WorkOrderQuoteLine[] | null) ?? []);
        }

        if (vehRes?.error) {
          setVehicle(null);
          console.error("[Mobile WO id page] vehicle load error:", vehRes.error);
        } else {
          setVehicle((vehRes?.data as Vehicle | null) ?? null);
        }

        if (custRes?.error) {
          setCustomer(null);
          console.error("[Mobile WO id page] customer load error:", custRes.error);
        } else {
          setCustomer((custRes?.data as Customer | null) ?? null);
        }
        if (scope) {
          const snapshot: MobileWorkOrderSnapshot = {
            workOrder: freshCore.workOrder,
            lines: freshCore.lines,
            quoteLines: freshQuoteLines,
            vehicle: freshVehicle,
            customer: freshCustomer,
            techNamesById: techMap,
          };
          await Promise.all([
            saveOfflineSnapshot({ scope, kind: "mobile-work-order-detail", entityId: routeId, data: snapshot }),
            saveOfflineSnapshot({ scope, kind: "mobile-work-order-detail", entityId: woRow.id, data: snapshot }),
          ]);
        }
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : "Failed to load work order.";
        setViewError(msg);
        await loadCached();
        // eslint-disable-next-line no-console
        console.error("[Mobile WO id page] load error:", e);
      } finally {
        setLoading(false);
      }
    },
    [
      routeId,
      shopId,
      currentUserId,
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

  useEffect(() => {
    if (!routeId || !currentUserId) return;
    return subscribeOfflineMutations(() => void fetchAll());
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

  const mobileOperationalState = useMemo(
    () => deriveMobileDetailOperationalState(wo, lines),
    [wo, lines],
  );

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
    const pendingOfflineChanges =
      offlineSummary.queued +
        offlineSummary.syncing +
        offlineSummary.failed +
        offlineSummary.conflicted >
      0;

    updateActiveTab({
      title: customerName
        ? `${workOrderLabel} · ${customerName}`
        : workOrderLabel,
      subtitle: vehicleLabel || undefined,
      status: String(wo.status ?? "awaiting").replaceAll("_", " "),
      offline: !navigator.onLine || pendingOfflineChanges,
    });
  }, [customer, offlineSummary, updateActiveTab, vehicle, wo]);

  const visibleLineState = useCallback(
    (line: WorkOrderLine) => mobileOperationalState.lineStates.get(line) ?? "awaiting",
    [mobileOperationalState],
  );

  const approvalPending = useMemo(
    () =>
      mobileOperationalState.visibleLines.filter(
        (l) => visibleLineState(l) === "awaiting_approval",
      ),
    [mobileOperationalState.visibleLines, visibleLineState],
  );

  const quotePending = useMemo(
    () => quoteLines.filter((q) => isReviewableQuoteLine(q)),
    [quoteLines],
  );

  const actionableLines = useMemo(() => {
    return mobileOperationalState.visibleLines
      .filter((line) => visibleLineState(line) !== "completed")
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return ta - tb;
      });
  }, [mobileOperationalState.visibleLines, visibleLineState]);

  const displayLines = useMemo(() => {
    const pr: Record<string, number> = {
      diagnosis: 1,
      inspection: 2,
      maintenance: 3,
      repair: 4,
    };
    const statePriority: Record<string, number> = {
      in_progress: 1,
      awaiting_approval: 2,
      on_hold: 3,
      waiting_parts: 4,
      assigned: 5,
      awaiting: 6,
      completed: 7,
    };
    return [...mobileOperationalState.visibleLines].sort((a, b) => {
      const sa = statePriority[visibleLineState(a)] ?? 999;
      const sb = statePriority[visibleLineState(b)] ?? 999;
      if (sa !== sb) return sa - sb;

      const pa = pr[String(a.job_type ?? "repair").toLowerCase()] ?? 999;
      const pb = pr[String(b.job_type ?? "repair").toLowerCase()] ?? 999;
      if (pa !== pb) return pa - pb;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });
  }, [mobileOperationalState.visibleLines, visibleLineState]);

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

  const canonicalHeaderStatus = mobileOperationalState.headerStatus;

  const hasAnyPending = approvalPending.length > 0 || quotePending.length > 0;
  const inProgressCount = mobileOperationalState.counters.in_progress;
  const unassignedCount = mobileOperationalState.counters.awaiting + mobileOperationalState.counters.assigned;
  const awaitingPartsCount = mobileOperationalState.counters.waiting_parts;
  const nextActionText = useMemo(() => {
    if (inProgressCount > 0) return "Continue active job punches.";
    if (approvalPending.length > 0) return "Review pending approvals.";
    if (awaitingPartsCount > 0) return "Release parts-blocked jobs.";
    if (mobileOperationalState.counters.on_hold > 0) return "Resolve held jobs.";
    if (unassignedCount > 0) return "Assign unassigned jobs.";
    return "All lines are complete.";
  }, [
    approvalPending.length,
    awaitingPartsCount,
    inProgressCount,
    mobileOperationalState.counters.on_hold,
    unassignedCount,
  ]);

  const vehicleSectionRef = useRef<HTMLElement | null>(null);
  const approvalSectionRef = useRef<HTMLElement | null>(null);
  const jobsSectionRef = useRef<HTMLElement | null>(null);
  const focusedActionRef = useRef<HTMLElement | null>(null);
  const lineRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const setLineRef = useCallback(
    (lineId: string) => (el: HTMLDivElement | null) => {
      lineRefs.current[lineId] = el;
    },
    [],
  );

  const jumpToElement = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: "auto" });
  }, []);

  const firstInProgressLineId = mobileOperationalState.visibleLines.find((line) => visibleLineState(line) === "in_progress")?.id ?? null;
  const firstOnHoldLineId = mobileOperationalState.visibleLines.find((line) => visibleLineState(line) === "on_hold")?.id ?? null;
  const firstPartsWaitingLineId = mobileOperationalState.visibleLines.find((line) => visibleLineState(line) === "waiting_parts" || Boolean(line.hold_reason?.toLowerCase().includes("part")))?.id ?? null;
  const firstUnassignedLineId = mobileOperationalState.visibleLines.find((line) => visibleLineState(line) === "awaiting" || visibleLineState(line) === "assigned")?.id ?? null;

  const primaryActionLine = actionableLines[0] ?? null;

  useEffect(() => {
    if (!focusedJobId) return;
    const stillActionable = actionableLines.some((line) => line.id === focusedJobId);
    if (stillActionable) return;

    const nextLineId = actionableLines[0]?.id ?? null;
    setFocusedJobId(nextLineId);
    if (!nextLineId) {
      setFocusedOpen(false);
    }
  }, [actionableLines, focusedJobId]);

  const operationalPills = useMemo(
    () => [
      { title: "In progress", count: inProgressCount, targetLineId: firstInProgressLineId },
      {
        title: "On hold",
        count: mobileOperationalState.counters.on_hold,
        targetLineId: firstOnHoldLineId,
      },
      { title: "Parts waiting", count: awaitingPartsCount, targetLineId: firstPartsWaitingLineId },
      { title: "Unassigned", count: unassignedCount, targetLineId: firstUnassignedLineId },
    ],
    [
      awaitingPartsCount,
      firstInProgressLineId,
      firstOnHoldLineId,
      firstPartsWaitingLineId,
      firstUnassignedLineId,
      inProgressCount,
      mobileOperationalState.counters.on_hold,
      unassignedCount,
    ],
  );

  /* ----------------------- line & quote actions ----------------------- */

  const approveLine = useCallback(
    async (lineId: string) => {
      if (!lineId) return;
      const res = await fetch(`/api/work-orders/lines/${lineId}/approval-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "approve",
          workOrderId: wo?.id ?? null,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) return toast.error(json?.error ?? "Failed to approve line");
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

  const sendToParts = useCallback(async (lineId: string) => {
    if (!lineId) return;
    try {
      await runJobPunchTransition(lineId, "pause", {
        holdReason: "Awaiting parts quote",
      });
      toast.success("Sent to parts for quoting");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send line to parts");
    }
  }, []);

  const sendAllPendingToParts = useCallback(async () => {
    if (!approvalPending.length) return;
    const ids = approvalPending.map((l) => l.id).filter(Boolean) as string[];
    try {
      for (const lineId of ids) {
        await runJobPunchTransition(lineId, "pause", {
          holdReason: "Awaiting parts quote",
        });
      }
      toast.success("Queued all pending lines for parts quoting");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to queue pending lines for parts");
    }
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
      const res = await fetch(`/api/work-orders/quotes/${quoteId}/decline`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? "Failed to decline quote");
        return;
      }
      toast.success("Quote declined");
      void fetchAll();
    },
    [fetchAll],
  );

  // 🔹 Open mobile inspection page for a given line
  const openInspection = useCallback(
    (ln: WorkOrderLine) => {
      if (!ln?.id || !wo?.id) return;

      const anyLine = ln as WorkOrderLineWithInspectionMeta;
      const templateId = extractInspectionTemplateId(anyLine);

      if (!templateId) {
        toast.error(
          "This job line doesn't have an inspection template attached yet. Attach or build a template first.",
        );
        return;
      }

      const sp = new URLSearchParams();
      sp.set("workOrderId", wo.id);
      sp.set("workOrderLineId", ln.id);
      sp.set("templateId", templateId);
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
      className={`metal-card animate-pulse rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] backdrop-blur ${className}`}
    />
  );

  return (
    <div className="relative space-y-5 overflow-hidden px-4 pb-24 pt-4 text-[color:var(--theme-text-primary)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[var(--theme-gradient-panel)]"
      />
      <VoiceContextSetter
        currentView="work_order_page_mobile"
        workOrderId={wo?.id}
        vehicleId={vehicle?.id}
        customerId={customer?.id}
        lineId={null}
      />

      {/* compact operational header */}
      <div className="flex items-center justify-between gap-2">
        <PreviousPageButton />
        {wo?.custom_id && (
          <span className="rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-page)] px-2.5 py-1 text-[10px] text-[color:var(--theme-text-secondary)]">
            ID <span className="font-mono text-[color:var(--theme-text-primary)]">{wo.id.slice(0, 8)}</span>
          </span>
        )}
      </div>

      {!currentUserId && (
        <div className="metal-panel metal-panel--card rounded-2xl border border-amber-500/40 px-3 py-3 text-xs text-amber-100 shadow-[var(--theme-shadow-medium)]">
          You appear signed out on this tab. If actions fail, open{" "}
          <Link
            href="/sign-in"
            className="underline decoration-dotted underline-offset-2 hover:text-[color:var(--theme-text-primary)]"
          >
            Sign In
          </Link>{" "}
          and return here.
        </div>
      )}

      {viewError && (
        <div className="metal-panel metal-panel--card whitespace-pre-wrap rounded-2xl border border-red-500/50 px-3 py-3 text-xs text-red-100 shadow-[var(--theme-shadow-medium)]">
          {viewError}
        </div>
      )}
      {(offlineSummary.queued > 0 ||
        offlineSummary.syncing > 0 ||
        offlineSummary.failed > 0 ||
        offlineSummary.conflicted > 0) && (
        <div className="metal-panel metal-panel--card rounded-2xl border border-amber-500/35 px-3 py-2 text-xs text-amber-100">
          Sync queue: pending {offlineSummary.queued + offlineSummary.syncing} • failed{" "}
          {offlineSummary.failed} • conflicted {offlineSummary.conflicted}
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
        <div className="space-y-5">
          <div className="metal-panel metal-panel--card rounded-2xl border border-[var(--metal-border-soft)] px-3 py-3 shadow-[var(--theme-shadow-medium)]">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-semibold sm:text-lg">
                    Work Order{" "}
                    <span className="text-sky-200">{wo.custom_id || `#${wo.id.slice(0, 8)}`}</span>
                  </h1>
                  <span className={chip(canonicalHeaderStatus)}>
                    {canonicalHeaderStatus.replaceAll("_", " ")}
                  </span>
                  {isWaiter ? (
                    <span className="rounded-full border border-red-400/65 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-200">
                      Waiter
                    </span>
                  ) : null}
                </div>
                <p className="text-[11px] text-[color:var(--theme-text-secondary)]">Created {createdAtText}</p>
              </div>
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {operationalPills.map((pill) => {
                const disabled = !pill.targetLineId;
                return (
                  <button
                    key={pill.title}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (!pill.targetLineId) return;
                      jumpToElement(lineRefs.current[pill.targetLineId] ?? null);
                    }}
                    className={[
                      "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                      disabled
                        ? "cursor-not-allowed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] text-[color:var(--theme-text-muted)]"
                        : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] text-[color:var(--theme-text-primary)] active:bg-[color:var(--theme-surface-panel-strong)]",
                    ].join(" ")}
                  >
                    {pill.title}
                    <span className="rounded-full border border-current/30 px-1.5 py-0.5 text-[9px] leading-none">
                      {pill.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vehicle & Customer */}
          <section
            ref={vehicleSectionRef}
            className="metal-panel metal-panel--card scroll-mt-20 rounded-2xl border border-sky-400/25 bg-[var(--theme-gradient-panel)] px-4 py-4 shadow-[var(--theme-shadow-medium)]"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold sm:text-base">
                Vehicle &amp; Customer
              </h2>
                <button
                  type="button"
                  className="text-[11px] font-medium text-sky-200 underline-offset-2 hover:underline"
                  onClick={() => setShowDetails((v) => !v)}
                  aria-expanded={showDetails}
                >
                {showDetails ? "Hide details" : "Show details"}
              </button>
            </div>

            {showDetails && (
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div className="metal-card rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                    Vehicle
                  </h3>
                  {vehicle ? (
                    <>
                      <p className="text-sm font-medium text-[color:var(--theme-text-primary)]">
                        {(vehicle.year ?? "").toString()} {vehicle.make ?? ""}{" "}
                        {vehicle.model ?? ""}
                      </p>
                      <p className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                        VIN:{" "}
                        <span className="font-mono">
                          {vehicle.vin ?? "—"}
                        </span>
                        <br />
                        Plate:{" "}
                        {vehicle.license_plate ?? (
                          <span className="text-[color:var(--theme-text-muted)]">—</span>
                        )}
                        <br />
                        Mileage:{" "}
                        {vehicle.mileage ?? (
                          <span className="text-[color:var(--theme-text-muted)]">—</span>
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-[color:var(--theme-text-muted)]">
                      No vehicle linked yet.
                    </p>
                  )}
                </div>

                <div className="metal-card rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                    Customer
                  </h3>
                  {customer ? (
                    <>
                      <p className="text-sm font-medium text-[color:var(--theme-text-primary)]">
                        {[
                          customer.first_name ?? "",
                          customer.last_name ?? "",
                        ]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </p>
                      <p className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                        {customer.phone ?? "—"}{" "}
                        {customer.email ? (
                          <>
                            <span className="mx-1 text-[color:var(--theme-text-muted)]">•</span>
                            {customer.email}
                          </>
                        ) : null}
                      </p>
                      {customer.id && (
                        <Link
                          href={`/mobile/work-orders/${wo.id}/vehicle`}
                          className="mt-2 inline-flex text-[11px] font-medium text-sky-200 underline-offset-2 hover:underline"
                          title="Open customer profile"
                        >
                          View customer profile →
                        </Link>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-[color:var(--theme-text-muted)]">
                      No customer linked yet.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Awaiting Customer Approval */}
          {hasAnyPending ? (
            <section
              ref={approvalSectionRef}
              className="metal-panel metal-panel--card scroll-mt-20 rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 shadow-[var(--theme-shadow-medium)]"
            >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)] sm:text-base">
                Awaiting customer approval
              </h2>
              {approvalPending.length > 1 && (
                <button
                  type="button"
                  className="rounded-full border border-amber-300/65 bg-amber-500/14 px-3 py-1.5 text-[11px] font-semibold text-amber-100 shadow-[0_0_14px_rgba(251,191,36,0.20)] hover:bg-amber-500/18"
                  onClick={sendAllPendingToParts}
                  title="Queue all lines for parts quoting"
                >
                  Quote all pending lines
                </button>
              )}
            </div>

            <div className="space-y-4">
                {/* Job lines needing approval */}
                {approvalPending.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
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
                          className="metal-card rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-[color:var(--theme-text-primary)]">
                                {idx + 1}.{" "}
                                {ln.description ||
                                  ln.complaint ||
                                  "Untitled job"}
                              </div>
                              <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
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
                                <div className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
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
                                  className="cursor-not-allowed rounded-md border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-[11px] text-[color:var(--theme-text-secondary)]"
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
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                      Quote lines / AI suggestions
                    </div>
                    {quotePending.map((q, idx) => (
                      <div
                        key={q.id}
                        className="metal-card rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-[color:var(--theme-text-primary)]">
                              {idx + 1}. {q.description}
                            </div>
                            <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
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
                              <div className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
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
            </section>
          ) : null}

          {/* Jobs list */}
          <section
            ref={jobsSectionRef}
            className="metal-panel metal-panel--card scroll-mt-20 rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 shadow-[var(--theme-shadow-medium)]"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold sm:text-base">
                  Jobs in this work order
                </h2>
                <p className="text-[11px] text-[color:var(--theme-text-muted)]">
                  Tap a job or open inspection to go into the focused job view.
                </p>
              </div>
            </div>

            {displayLines.length === 0 ? (
              <p className="text-sm text-[color:var(--theme-text-secondary)]">No lines yet.</p>
            ) : (
              <div className="space-y-2">
                {displayLines.map((ln, idx) => {
                  const punchedIn = !!ln.punched_in_at && !ln.punched_out_at;

                  const openFocused = () => {
                    setFocusedJobId(ln.id);
                    setFocusedOpen(true);
                  };

                  const lineTechnicians = ln.assigned_tech_id
                    ? [
                        {
                          id: ln.assigned_tech_id,
                          full_name: techNamesById[ln.assigned_tech_id] ?? "Assigned tech",
                        },
                      ]
                    : [];

                  return (
                    <div
                      key={ln.id}
                      ref={setLineRef(ln.id)}
                      className="scroll-mt-24"
                    >
                      <JobCard
                        index={idx}
                        line={ln}
                        parts={[]} // stripped-down: no parts list on main mobile view
                        technicians={lineTechnicians}
                        canAssign={canAssign}
                        isPunchedIn={punchedIn}
                        onOpen={openFocused}
                        onAssign={undefined}
                        onOpenInspection={() => openInspection(ln)}
                        onAddPart={undefined}
                        compact
                        hideExecutionStageCompletenessPills
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>


          {quotePending.length > 0 && (
            <section className="metal-panel metal-panel--card scroll-mt-20 rounded-2xl border border-sky-400/25 px-4 py-4 shadow-[var(--theme-shadow-medium)]">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-sky-100 sm:text-base">Pending quote items</h2>
                  <p className="text-[11px] text-[color:var(--theme-text-muted)]">Recommended repairs awaiting quote review or customer decision.</p>
                </div>
                <Link href={`/quote-review/${wo?.id ?? routeId}`} className="rounded-full border border-sky-400/40 px-3 py-1.5 text-[11px] font-semibold text-sky-100">
                  Review
                </Link>
              </div>
              <div className="space-y-2">
                {quotePending.map((q) => {
                  const meta = typeof q.metadata === "object" && q.metadata && !Array.isArray(q.metadata) ? q.metadata as Record<string, unknown> : {};
                  const parts = Array.isArray(meta.parts) ? meta.parts : [];
                  const inspectionStatus = typeof meta.inspection_status === "string" ? meta.inspection_status.toUpperCase() : "RECOMMEND";
                  const sourceFinding = typeof meta.source_finding_title === "string" ? meta.source_finding_title : q.ai_complaint ?? "Inspection finding";
                  const pricingReviewRequired = q.status === "pending_parts" || (typeof meta.menu_match === "object" && meta.menu_match !== null && (meta.menu_match as Record<string, unknown>).pricing_review_required === true);
                  return (
                    <article key={q.id} className="rounded-xl border border-sky-400/20 bg-sky-950/20 p-3">
                      <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{q.description || "Recommended repair"}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-sky-200">{inspectionStatus} • {sourceFinding}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[color:var(--theme-text-secondary)]">
                        <div>Labor: {typeof q.labor_hours === "number" ? `${q.labor_hours}h` : typeof q.est_labor_hours === "number" ? `${q.est_labor_hours}h` : "—"}</div>
                        <div>Parts: {parts.length > 0 ? `${parts.length} req.` : "None"}</div>
                        <div>Stage: {String(q.stage ?? q.status ?? "advisor_pending").replaceAll("_", " ")}</div>
                        <div className={pricingReviewRequired ? "text-amber-200" : "text-emerald-200"}>{pricingReviewRequired ? "Pricing review" : "Pricing available"}</div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <section
            ref={focusedActionRef}
            className="metal-panel metal-panel--card scroll-mt-20 rounded-2xl border border-[var(--metal-border-soft)] px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold sm:text-base">Focused job / actions</h2>
                <p className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">{nextActionText}</p>
              </div>
              {primaryActionLine ? (
                <button
                  type="button"
                  className="mobile-tech-btn-utility rounded-full border px-3 py-1.5 text-[11px] font-semibold"
                  onClick={() => {
                    setFocusedJobId(primaryActionLine.id);
                    setFocusedOpen(true);
                  }}
                >
                  {canonicalHeaderStatus === "in_progress"
                    ? "Open active job"
                    : "Open next job"}
                </button>
              ) : (
                <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                  Completed
                </span>
              )}
            </div>
          </section>

          <section className="metal-panel metal-panel--card rounded-2xl border border-[var(--metal-border-soft)] px-4 py-3">
            <h2 className="text-sm font-semibold sm:text-base">Supporting utilities</h2>
            <div className="mt-2">
              <AskAssistantEntry mobile placement="dock" />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
