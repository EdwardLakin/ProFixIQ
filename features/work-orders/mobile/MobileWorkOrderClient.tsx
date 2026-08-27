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
import { registerMobileWorkflowDock } from "@/features/copilot/technician/client/mobileWorkflowDock";
import AskAssistantEntry from "@/features/assistant/components/AskAssistantEntry";
import { isReviewableQuoteLine } from "@/features/work-orders/lib/quotes/reviewableQuoteLines";
import { resolveWorkOrderLinePricing } from "@/features/work-orders/lib/pricing/resolveWorkOrderLinePricing";
import { filterAllocationsNotBackedByCanonicalParts } from "@/features/work-orders/lib/display/workOrderParts";
import {
  emptyCanonicalWorkOrderLineContext,
  getPartsRequestStatusLabel,
  type CanonicalWorkOrderLineContext,
} from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";
import {
  applyFetchedMobileDetailSnapshot,
  deriveMobileDetailOperationalState,
  selectMobileDetailPrimaryActionLine,
} from "@/features/work-orders/mobile/detailOperationalState";
import {
  getOfflineMutationScope,
  getOfflineSyncSummary,
  setOfflineMutationScope,
  subscribeOfflineMutations,
} from "@/features/shared/lib/offline/mutations";
import { saveOfflineSnapshot } from "@/features/shared/lib/offline/database";
import {
  clearWorkspaceAuthorizationSnapshot,
  readWorkspaceAuthorizationSnapshot,
} from "@/features/workspace/authorization/offlineWorkspaceAuthorization";
import {
  loadProjectedWorkOrderSnapshot,
  removeMobileWorkOrderDetailSnapshots,
} from "@/features/work-orders/mobile/technicianOfflineExecution";
import {
  canOpenMobileCustomerProfile,
  parseMobileWorkOrderSnapshot,
  type MobileWorkOrderSnapshot,
} from "@/features/work-orders/mobile/mobileWorkOrderDetail";
import {
  reconcileMobileProductScope,
  removeMobileProductScopedSnapshots,
} from "@/features/work-orders/mobile/mobileProductScopeStorage";
import { resolveMobileLineDisplayNumbers } from "@/features/work-orders/mobile/mobileLineDisplay";
import {
  deniedWorkOrderFinancialAccess,
  type WorkOrderFinancialAccess,
} from "@/features/work-orders/workspace/workOrderFinancialAccess";
import { resolveMobileWorkOrderReturnHref } from "@/features/mobile/work-orders/mobileWorkOrderRouting";
import { useTabs } from "@/features/shared/components/tabs/TabsProvider";
import RouteLoadPanel from "@/features/shared/components/ui/RouteLoadPanel";
import {
  asRouteLoadFailure,
  routeLoadFailureFromStatus,
  runBoundedRouteLoad,
  type RouteLoadFailure,
} from "@/features/shared/lib/route-load";
import { resolveCanonicalStaffProfile } from "@/features/shared/lib/authenticated-profile";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";
import { useWorkspaceCapabilities } from "@/features/workspace/authorization/useWorkspaceCapabilities";
import {
  canOpenWorkOrderInspectionModule,
  canRunWorkOrderLineInspection,
} from "@/features/work-orders/workspace/workOrderWorkspace";

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

// 🔹 Desktop-style helper for finding the inspection template id on a line
function extractInspectionTemplateId(
  ln: WorkOrderLineWithInspectionMeta,
): string | null {
  return (
    ln.inspection_template_id ??
    ln.template_id ??
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

const FIELD_INSPECTION_LOCKED_LINE_STATUSES = new Set([
  "completed",
  "ready_to_invoice",
  "invoiced",
  "declined",
  "deferred",
  "cancelled",
  "canceled",
  "closed",
  "void",
  "voided",
]);

const FIELD_INSPECTION_LOCKED_PARENT_STATUSES = new Set([
  "completed",
  "ready_to_invoice",
  "invoiced",
  "cancelled",
  "canceled",
  "closed",
  "paid",
  "void",
  "voided",
  "archived",
]);

function normalizeFieldInspectionStatus(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function formatOptionalDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "PPpp");
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
  new: "bg-[color:var(--theme-surface-panel)] border-[color:var(--theme-border-soft)] text-[color:var(--theme-text-primary)] shadow-[0_0_14px_rgba(148,163,184,0.28)]",
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

function MobileWorkOrderDetailSkeleton({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`metal-card animate-pulse rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] backdrop-blur ${className}`}
    />
  );
}

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
  const { can: canWorkspace } = useWorkspaceCapabilities();
  const canRunInspections = canWorkspace(
    WORKSPACE_CAPABILITIES.runWorkOrderInspections,
  );
  const canExecuteJobs = canWorkspace(
    WORKSPACE_CAPABILITIES.executeAssignedWorkOrderJobs,
  );

  // ✅ handle ?focus=<workOrderLineId>
  const focusParam = searchParams?.get("focus") ?? null;
  const inspectionTemplateId = searchParams?.get("templateId")?.trim() || null;
  const returnHref = resolveMobileWorkOrderReturnHref(
    searchParams?.get("returnTo"),
  );
  const handledFocusRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);

  // 🔥 IMPORTANT: scope tab-state keys by routeId so different work orders don’t bleed state
  const keyBase = useMemo(() => `m:wo:${routeId}`, [routeId]);

  const [wo, setWo] = useTabState<WorkOrder | null>(`${keyBase}:wo`, null);
  const hasRenderedDetailRef = useRef(Boolean(wo));
  const serverLoadCountRef = useRef(0);
  const backgroundRefreshTimerRef = useRef<number | null>(null);
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
  const [lineContext, setLineContext] =
    useTabState<CanonicalWorkOrderLineContext>(
      `${keyBase}:lineContext`,
      emptyCanonicalWorkOrderLineContext(),
    );
  const [shopLaborRate, setShopLaborRate] = useTabState<number | null>(
    `${keyBase}:shopLaborRate`,
    null,
  );
  const [financialAccess, setFinancialAccess] =
    useTabState<WorkOrderFinancialAccess>(
      `${keyBase}:financialAccess`,
      deniedWorkOrderFinancialAccess(),
    );
  const [productScope, setProductScope] = useTabState<
    MobileWorkOrderSnapshot["productScope"] | null
  >(`${keyBase}:productScope`, null);

  const [loading, setLoading] = useState<boolean>(true);
  const [actorReady, setActorReady] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [loadFailure, setLoadFailure] = useState<RouteLoadFailure | null>(null);

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
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [actorRoleVerified, setActorRoleVerified] = useState(false);

  const [shopId, setShopId] = useTabState<string | null>(
    `${keyBase}:shopId`,
    null,
  );

  const [showDetails, setShowDetails] = useTabState<boolean>(
    `${keyBase}:showDetails`,
    true,
  );
  const [offlineSummary, setOfflineSummary] = useState(() =>
    getOfflineSyncSummary(),
  );

  // mobile focused job view
  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);
  const [focusedOpen, setFocusedOpen] = useState(false);
  const partsQuoteOperationKeys = useRef(new Map<string, string>());
  const [attachingTemplateLineId, setAttachingTemplateLineId] = useState<
    string | null
  >(null);

  /* ---------------------- AUTH ---------------------- */
  useEffect(() => {
    let mounted = true;

    const waitForSession = async () => {
      setActorReady(false);
      setActorRoleVerified(false);
      setCurrentProfileId(null);
      setLoading(true);
      setLoadFailure(null);
      try {
        await runBoundedRouteLoad(
          {
            route: `/mobile/work-orders/${routeId}`,
            operation: "resolve mobile work order actor",
          },
          async ({ signal }) => {
            let {
              data: { session },
            } = await supabase.auth.getSession();

            if (!session) {
              for (let i = 0; i < 8; i++) {
                await new Promise((resolve) =>
                  setTimeout(resolve, 150 * (i + 1)),
                );
                if (signal.aborted) return;
                const result = await supabase.auth.getSession();
                session = result.data.session;
                if (session) break;
              }
            }

            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (!mounted || signal.aborted) return;

            const uid = user?.id ?? session?.user.id ?? null;
            if (!uid) {
              throw routeLoadFailureFromStatus(
                401,
                "Sign in to view this work order.",
              );
            }

            setCurrentUserId(uid);
            setUserId(uid);
            const cachedScope = getOfflineMutationScope();
            if (!navigator.onLine && cachedScope?.userId === uid) {
              const authorization = readWorkspaceAuthorizationSnapshot({
                userId: uid,
                shopId: cachedScope.shopId,
              });
              setCurrentUserRole(
                authorization?.actor.role ??
                  session?.user.user_metadata?.role ??
                  null,
              );
              setCurrentProfileId(authorization?.actor.profileId ?? null);
              setActorRoleVerified(Boolean(authorization));
              setShopId(cachedScope.shopId);
              setActorReady(true);
              return;
            }

            const { profile: prof, error: profErr } =
              await resolveCanonicalStaffProfile(supabase, uid, { signal });
            if (!mounted || signal.aborted) return;
            if (profErr) {
              if (cachedScope?.userId === uid) {
                const authorization = readWorkspaceAuthorizationSnapshot({
                  userId: uid,
                  shopId: cachedScope.shopId,
                });
                setCurrentUserRole(
                  authorization?.actor.role ??
                    session?.user.user_metadata?.role ??
                    null,
                );
                setCurrentProfileId(authorization?.actor.profileId ?? null);
                setActorRoleVerified(Boolean(authorization));
                setShopId(cachedScope.shopId);
                setActorReady(true);
                return;
              }
              throw new Error(profErr);
            }

            setCurrentUserRole(prof?.role ?? null);
            setCurrentProfileId(prof?.id ?? null);
            setActorRoleVerified(Boolean(prof));
            setShopId((prof?.shop_id as string | null) ?? null);
            if (prof?.shop_id) {
              setOfflineMutationScope({ userId: uid, shopId: prof.shop_id });
            }
            setActorReady(true);
          },
        );
      } catch (error) {
        if (!mounted) return;
        setActorReady(false);
        setCurrentUserId(null);
        setUserId(null);
        setCurrentUserRole(null);
        setCurrentProfileId(null);
        setActorRoleVerified(false);
        setShopId(null);
        setLoadFailure(
          asRouteLoadFailure(
            error,
            "The signed-in user could not be verified.",
          ),
        );
        setLoading(false);
      }
    };

    void waitForSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (s?.user) void waitForSession();
      else {
        clearWorkspaceAuthorizationSnapshot();
        setActorReady(false);
        setCurrentUserId(null);
        setUserId(null);
        setCurrentUserRole(null);
        setCurrentProfileId(null);
        setActorRoleVerified(false);
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
    async (options: { background?: boolean } = {}) => {
      if (!routeId) return;
      const loadGeneration = ++loadGenerationRef.current;
      const isLatestLoad = () => loadGenerationRef.current === loadGeneration;
      const preserveRenderedDetail =
        options.background === true && hasRenderedDetailRef.current;
      if (!preserveRenderedDetail) setLoading(true);
      setViewError(null);
      setLoadFailure(null);

      const scope =
        currentUserId && shopId ? { userId: currentUserId, shopId } : null;
      const loadCached = async (): Promise<boolean> => {
        if (!scope) return false;
        const cached = await loadProjectedWorkOrderSnapshot({
          scope,
          entityId: routeId,
        });
        if (!isLatestLoad() || !cached) return false;
        setWo(cached.workOrder);
        setLines(cached.lines);
        setQuoteLines(cached.quoteLines);
        setVehicle(cached.vehicle);
        setCustomer(cached.customer);
        setTechNamesById(cached.techNamesById);
        setLineContext(
          cached.lineContext ?? emptyCanonicalWorkOrderLineContext(),
        );
        setShopLaborRate(cached.shopLaborRate ?? null);
        setFinancialAccess(
          cached.financialAccess ?? deniedWorkOrderFinancialAccess(),
        );
        setProductScope(cached.productScope ?? null);
        hasRenderedDetailRef.current = true;
        setViewError("Offline copy · changes may be newer on the server.");
        return true;
      };

      if (!navigator.onLine) {
        if (!(await loadCached()))
          setViewError("No saved copy of this work order is available.");
        if (isLatestLoad()) setLoading(false);
        return;
      }

      try {
        serverLoadCountRef.current += 1;
        await runBoundedRouteLoad(
          {
            route: `/mobile/work-orders/${routeId}`,
            operation: "load mobile work order",
            tenantId: shopId,
            actorId: currentUserId,
            role: currentUserRole,
          },
          async ({ recordStatus, signal }) => {
            const response = await fetch(
              `/api/mobile/work-orders/${encodeURIComponent(routeId)}`,
              {
                credentials: "include",
                headers: { Accept: "application/json" },
                signal,
              },
            );
            recordStatus(response.status);
            const body = await response.json().catch(() => null);
            if (!response.ok) {
              const message =
                body &&
                typeof body === "object" &&
                "error" in body &&
                typeof body.error === "string"
                  ? body.error
                  : "The work order could not be loaded.";
              throw routeLoadFailureFromStatus(response.status, message);
            }

            const snapshot = parseMobileWorkOrderSnapshot(body);
            if (!isLatestLoad()) return;
            const freshCore = applyFetchedMobileDetailSnapshot({
              cachedWorkOrder: null,
              cachedLines: [],
              fetchedWorkOrder: snapshot.workOrder,
              fetchedLines: snapshot.lines,
            });
            setWo(freshCore.workOrder);
            setLines(freshCore.lines);
            setQuoteLines(snapshot.quoteLines);
            setVehicle(snapshot.vehicle);
            setCustomer(snapshot.customer);
            setTechNamesById(snapshot.techNamesById);
            setLineContext(
              snapshot.lineContext ?? emptyCanonicalWorkOrderLineContext(),
            );
            setShopLaborRate(snapshot.shopLaborRate ?? null);
            setFinancialAccess(snapshot.financialAccess);
            setProductScope(snapshot.productScope ?? null);
            hasRenderedDetailRef.current = true;

            const authorizedScope = currentUserId
              ? {
                  userId: currentUserId,
                  shopId: snapshot.workOrder.shop_id,
                }
              : null;
            if (authorizedScope) {
              setOfflineMutationScope(authorizedScope);
              try {
                await reconcileMobileProductScope({
                  scope: authorizedScope,
                  productScope: snapshot.productScope,
                });
                await Promise.all([
                  saveOfflineSnapshot({
                    scope: authorizedScope,
                    kind: "mobile-work-order-detail",
                    entityId: routeId,
                    data: snapshot,
                  }),
                  saveOfflineSnapshot({
                    scope: authorizedScope,
                    kind: "mobile-work-order-detail",
                    entityId: snapshot.workOrder.id,
                    data: snapshot,
                  }),
                ]);
              } catch (cacheError) {
                try {
                  await removeMobileProductScopedSnapshots(authorizedScope);
                } catch (purgeError) {
                  console.error(
                    "[Mobile WO id page] offline authority purge error:",
                    purgeError,
                  );
                }
                console.error(
                  "[Mobile WO id page] offline detail cache error:",
                  cacheError,
                );
              }
            }
          },
        );
      } catch (e: unknown) {
        const failure = asRouteLoadFailure(
          e,
          "The work order could not be loaded.",
        );
        const mayUseCache = ![
          "unauthenticated",
          "forbidden",
          "not-found",
        ].includes(failure.kind);
        if (!mayUseCache && scope) {
          try {
            await removeMobileWorkOrderDetailSnapshots({
              scope,
              entityId: routeId,
            });
          } catch (cacheError) {
            console.error(
              "[Mobile WO id page] cache eviction error:",
              cacheError,
            );
          }
        }
        if (isLatestLoad() && preserveRenderedDetail && mayUseCache) {
          setViewError("Refresh failed · showing the last loaded work order.");
          console.error("[Mobile WO id page] refresh error:", e);
          return;
        }
        const usedCache = mayUseCache ? await loadCached() : false;
        if (isLatestLoad() && !usedCache) {
          setWo(null);
          setLines([]);
          setQuoteLines([]);
          setVehicle(null);
          setCustomer(null);
          setTechNamesById({});
          setLineContext(emptyCanonicalWorkOrderLineContext());
          setShopLaborRate(null);
          setFinancialAccess(deniedWorkOrderFinancialAccess());
          setProductScope(null);
          hasRenderedDetailRef.current = false;
          setLoadFailure(failure);
        }
        console.error("[Mobile WO id page] load error:", e);
      } finally {
        serverLoadCountRef.current = Math.max(
          0,
          serverLoadCountRef.current - 1,
        );
        if (isLatestLoad()) setLoading(false);
      }
    },
    [
      routeId,
      shopId,
      currentUserId,
      currentUserRole,
      setWo,
      setLines,
      setQuoteLines,
      setVehicle,
      setCustomer,
      setLineContext,
      setShopLaborRate,
      setFinancialAccess,
      setProductScope,
    ],
  );

  const scheduleBackgroundRefresh = useCallback(() => {
    if (!navigator.onLine) return;
    if (backgroundRefreshTimerRef.current !== null) return;
    const runWhenIdle = () => {
      backgroundRefreshTimerRef.current = null;
      if (!navigator.onLine) return;
      if (serverLoadCountRef.current > 0) {
        backgroundRefreshTimerRef.current = window.setTimeout(runWhenIdle, 75);
        return;
      }
      void fetchAll({ background: true });
    };
    backgroundRefreshTimerRef.current = window.setTimeout(runWhenIdle, 75);
  }, [fetchAll]);

  useEffect(() => {
    if (!routeId || !currentUserId || !actorReady) return;
    void fetchAll();
  }, [actorReady, fetchAll, routeId, currentUserId]);

  useEffect(() => {
    if (!routeId || !currentUserId || !actorReady) return;
    return subscribeOfflineMutations(scheduleBackgroundRefresh);
  }, [actorReady, currentUserId, routeId, scheduleBackgroundRefresh]);

  useEffect(() => {
    if (!routeId || !currentUserId || !actorReady) return;
    const refreshIfOnline = () => {
      if (navigator.onLine) scheduleBackgroundRefresh();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshIfOnline();
    };

    window.addEventListener("online", refreshIfOnline);
    window.addEventListener("focus", refreshIfOnline);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("online", refreshIfOnline);
      window.removeEventListener("focus", refreshIfOnline);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (backgroundRefreshTimerRef.current !== null) {
        window.clearTimeout(backgroundRefreshTimerRef.current);
        backgroundRefreshTimerRef.current = null;
      }
    };
  }, [actorReady, currentUserId, routeId, scheduleBackgroundRefresh]);

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
        scheduleBackgroundRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_lines",
          filter: `work_order_id=eq.${wo.id}`,
        },
        scheduleBackgroundRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_quote_lines",
          filter: `work_order_id=eq.${wo.id}`,
        },
        scheduleBackgroundRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_parts",
          filter: `work_order_id=eq.${wo.id}`,
        },
        scheduleBackgroundRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_part_allocations",
          filter: `work_order_id=eq.${wo.id}`,
        },
        scheduleBackgroundRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "part_requests",
          filter: `work_order_id=eq.${wo.id}`,
        },
        scheduleBackgroundRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_line_technicians",
        },
        scheduleBackgroundRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_line_labor_segments",
          filter: `work_order_id=eq.${wo.id}`,
        },
        scheduleBackgroundRefresh,
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        //
      }
    };
  }, [wo?.id, scheduleBackgroundRefresh]);

  // 🔁 refresh when a parts request or inspection completes
  useEffect(() => {
    const handleParts = () => {
      scheduleBackgroundRefresh();
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
  }, [scheduleBackgroundRefresh]);

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

  const pricingByLine = useMemo(() => {
    const result: Record<
      string,
      ReturnType<typeof resolveWorkOrderLinePricing>
    > = {};
    if (!financialAccess.canViewSellPricing) return result;
    for (const line of lines) {
      const canonicalParts = lineContext.canonicalPartsByLine[line.id] ?? [];
      const allocations = filterAllocationsNotBackedByCanonicalParts(
        lineContext.allocationsByLine[line.id] ?? [],
        canonicalParts,
      );
      const quotes = activeQuotesByLine[line.id] ?? [];
      result[line.id] = resolveWorkOrderLinePricing({
        line,
        quote: quotes[quotes.length - 1],
        shopLaborRate,
        stagedParts: canonicalParts,
        allocatedParts: allocations,
      });
    }
    return result;
  }, [
    activeQuotesByLine,
    financialAccess.canViewSellPricing,
    lineContext,
    lines,
    shopLaborRate,
  ]);

  const mobileOperationalState = useMemo(
    () =>
      deriveMobileDetailOperationalState(wo, lines, {
        activeTechnicianIdsByLine: lineContext.activeTechnicianIdsByLine,
      }),
    [lineContext.activeTechnicianIdsByLine, lines, wo],
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
    (line: WorkOrderLine) =>
      mobileOperationalState.lineStates.get(line) ?? "awaiting",
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

  const displayNumberByLine = useMemo(
    () => resolveMobileLineDisplayNumbers(lines),
    [lines],
  );

  const createdAtText = formatOptionalDateTime(wo?.created_at);
  const expectedCompletionText = formatOptionalDateTime(
    wo?.expected_completion_at,
  );

  const canAssign = false; // assignments handled in focused view / desktop
  const currentActor = getActorCapabilities({ role: currentUserRole });
  const canRunInspectionForLine = useCallback(
    (line: WorkOrderLine): boolean =>
      canRunWorkOrderLineInspection({
        canRunInspections,
        requiresAssignedTechnician: currentActor.canonicalRole === "mechanic",
        actorTechnicianIds: [currentProfileId, currentUserId],
        assignedTechnicianIds: [
          line.assigned_tech_id,
          line.assigned_to,
          ...(lineContext.technicianIdsByLine[line.id] ?? []),
        ],
      }),
    [
      canRunInspections,
      currentActor.canonicalRole,
      currentProfileId,
      currentUserId,
      lineContext.technicianIdsByLine,
    ],
  );
  const actorIds = useMemo(
    () =>
      new Set(
        [currentProfileId, currentUserId].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    [currentProfileId, currentUserId],
  );
  const actorAssignedToLine = useCallback(
    (line: WorkOrderLine): boolean => {
      return [
        line.assigned_tech_id,
        line.assigned_to,
        ...(lineContext.technicianIdsByLine[line.id] ?? []),
      ].some((id) => Boolean(id) && actorIds.has(id as string));
    },
    [actorIds, lineContext.technicianIdsByLine],
  );
  const inspectionAccessError =
    canRunInspections && currentActor.canonicalRole === "mechanic"
      ? "Inspection access requires this job assignment."
      : "You do not have permission to run inspections.";
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

  const isWaiter = !!(
    waiterFlagSource &&
    (waiterFlagSource.is_waiter ||
      waiterFlagSource.waiter ||
      waiterFlagSource.customer_waiting)
  );

  const canonicalHeaderStatus = mobileOperationalState.headerStatus;

  const hasAnyPending = approvalPending.length > 0 || quotePending.length > 0;
  const inProgressCount = mobileOperationalState.counters.in_progress;
  const unassignedCount =
    mobileOperationalState.counters.awaiting +
    mobileOperationalState.counters.assigned;
  const awaitingPartsCount = mobileOperationalState.counters.waiting_parts;
  const nextActionText = useMemo(() => {
    if (inProgressCount > 0) return "Continue active job punches.";
    if (approvalPending.length > 0) return "Review pending approvals.";
    if (awaitingPartsCount > 0) return "Release parts-blocked jobs.";
    if (mobileOperationalState.counters.on_hold > 0)
      return "Resolve held jobs.";
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

  const firstInProgressLineId =
    mobileOperationalState.visibleLines.find(
      (line) => visibleLineState(line) === "in_progress",
    )?.id ?? null;
  const firstOnHoldLineId =
    mobileOperationalState.visibleLines.find(
      (line) => visibleLineState(line) === "on_hold",
    )?.id ?? null;
  const firstPartsWaitingLineId =
    mobileOperationalState.visibleLines.find(
      (line) =>
        visibleLineState(line) === "waiting_parts" ||
        Boolean(line.hold_reason?.toLowerCase().includes("part")),
    )?.id ?? null;
  const firstUnassignedLineId =
    mobileOperationalState.visibleLines.find(
      (line) =>
        visibleLineState(line) === "awaiting" ||
        visibleLineState(line) === "assigned",
    )?.id ?? null;

  const primaryActionLine = selectMobileDetailPrimaryActionLine(
    actionableLines,
    mobileOperationalState.lineStates,
  );

  useEffect(() => {
    if (!focusedJobId) return;
    const stillActionable = actionableLines.some(
      (line) => line.id === focusedJobId,
    );
    if (stillActionable) return;

    const nextLineId = primaryActionLine?.id ?? null;
    setFocusedJobId(nextLineId);
    if (!nextLineId) {
      setFocusedOpen(false);
    }
  }, [actionableLines, focusedJobId, primaryActionLine]);

  const operationalPills = useMemo(
    () => [
      {
        title: "In progress",
        count: inProgressCount,
        targetLineId: firstInProgressLineId,
      },
      {
        title: "On hold",
        count: mobileOperationalState.counters.on_hold,
        targetLineId: firstOnHoldLineId,
      },
      {
        title: "Parts waiting",
        count: awaitingPartsCount,
        targetLineId: firstPartsWaitingLineId,
      },
      {
        title: "Unassigned",
        count: unassignedCount,
        targetLineId: firstUnassignedLineId,
      },
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
      const res = await fetch(
        `/api/work-orders/lines/${lineId}/approval-decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "approve",
            workOrderId: wo?.id ?? null,
          }),
        },
      );
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok)
        return toast.error(json?.error ?? "Failed to approve line");
      toast.success("Line approved");
      void fetchAll();
    },
    [fetchAll, wo?.id],
  );

  const declineLine = useCallback(
    async (lineId: string) => {
      if (!lineId) return;
      const res = await fetch(
        `/api/work-orders/lines/${lineId}/approval-decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "decline",
            workOrderId: wo?.id ?? null,
          }),
        },
      );
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok)
        return toast.error(json?.error ?? "Failed to decline line");
      toast.success("Line declined");
      void fetchAll();
    },
    [fetchAll, wo?.id],
  );

  const sendToParts = useCallback(
    async (lineId: string, notify = true) => {
      if (!lineId || !wo?.id) return false;
      const operationKey =
        partsQuoteOperationKeys.current.get(lineId) ?? crypto.randomUUID();
      partsQuoteOperationKeys.current.set(lineId, operationKey);
      try {
        const response = await fetch(
          `/api/work-orders/${wo.id}/lines/${lineId}/parts-request`,
          { method: "POST", headers: { "Idempotency-Key": operationKey } },
        );
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? "Failed to send line to parts");
        }
        partsQuoteOperationKeys.current.delete(lineId);
        if (notify) toast.success("Sent to parts for quoting");
        void fetchAll();
        return true;
      } catch (error) {
        if (notify) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to send line to parts",
          );
        }
        return false;
      }
    },
    [fetchAll, wo?.id],
  );

  const sendAllPendingToParts = useCallback(async () => {
    if (!approvalPending.length) return;
    const ids = approvalPending.map((l) => l.id).filter(Boolean) as string[];
    try {
      for (const lineId of ids) {
        if (!(await sendToParts(lineId, false))) {
          throw new Error(
            "Failed to queue one or more pending lines for parts",
          );
        }
      }
      toast.success("Queued all pending lines for parts quoting");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to queue pending lines for parts",
      );
    }
  }, [approvalPending, sendToParts]);

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
          e instanceof Error ? e.message : "Failed to authorize quote line",
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
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
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

      if (!canRunInspectionForLine(ln)) {
        toast.error(inspectionAccessError);
        return;
      }

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
    [canRunInspectionForLine, inspectionAccessError, router, wo?.id],
  );

  const attachAndOpenInspection = useCallback(
    async (ln: WorkOrderLine) => {
      if (!inspectionTemplateId || !ln.id || !wo?.id) return;
      if (!canRunInspectionForLine(ln)) {
        toast.error(inspectionAccessError);
        return;
      }
      if (!navigator.onLine) {
        toast.error("Connect to attach an inspection template to this job.");
        return;
      }

      setAttachingTemplateLineId(ln.id);
      try {
        const response = await fetch(
          "/api/mobile/service/work-order-lines/inspection-template",
          {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workOrderLineId: ln.id,
              templateId: inspectionTemplateId,
            }),
          },
        );
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          workOrderId?: string;
          workOrderLineId?: string;
          templateId?: string;
        } | null;
        if (!response.ok) {
          throw new Error(
            body?.error || "Unable to attach the inspection template.",
          );
        }
        if (
          body?.workOrderId !== wo.id ||
          body.workOrderLineId !== ln.id ||
          body.templateId !== inspectionTemplateId
        ) {
          throw new Error("The inspection assignment response was incomplete.");
        }

        const query = new URLSearchParams({
          workOrderId: body.workOrderId,
          workOrderLineId: body.workOrderLineId,
          templateId: body.templateId,
          view: "mobile",
        });
        toast.success("Inspection template attached.");
        router.push(
          `/mobile/inspections/${encodeURIComponent(body.workOrderLineId)}?${query.toString()}`,
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to attach the inspection template.",
        );
      } finally {
        setAttachingTemplateLineId(null);
      }
    },
    [
      canRunInspectionForLine,
      inspectionAccessError,
      inspectionTemplateId,
      router,
      wo?.id,
    ],
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

  useEffect(() => {
    if (!focusedOpen || !focusedJobId) return;
    return registerMobileWorkflowDock("work-order");
  }, [focusedJobId, focusedOpen]);

  /* ----------------------- mobile focused job view ----------------------- */

  const focusedLine = focusedJobId
    ? (lines.find((line) => line.id === focusedJobId) ?? null)
    : null;

  if (focusedOpen && focusedJobId) {
    return (
      <MobileFocusedJob
        workOrderLineId={focusedJobId}
        canExecuteJob={canExecuteJobs}
        actorAssignedToLine={
          focusedLine ? actorAssignedToLine(focusedLine) : false
        }
        onBack={() => setFocusedOpen(false)}
        onChanged={fetchAll}
        mode="tech"
        canAddJob={
          actorRoleVerified &&
          (currentActor.canManageWorkOrders ||
            currentActor.canPerformAssignedWork)
        }
      />
    );
  }

  /* -------------------------- UI -------------------------- */
  if (!routeId)
    return <div className="p-6 text-red-400">Missing work order id.</div>;

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
        <PreviousPageButton to={returnHref ?? undefined} />
        {wo?.custom_id && (
          <span className="rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-page)] px-2.5 py-1 text-[10px] text-[color:var(--theme-text-secondary)]">
            ID{" "}
            <span className="font-mono text-[color:var(--theme-text-primary)]">
              {wo.id.slice(0, 8)}
            </span>
          </span>
        )}
      </div>

      {!loading && !loadFailure && !currentUserId && (
        <div className="metal-panel metal-panel--card rounded-2xl border border-amber-500/40 px-3 py-3 text-xs text-amber-100 shadow-[var(--theme-shadow-medium)]">
          You appear signed out on this tab. If actions fail, open{" "}
          <Link
            href="/mobile/sign-in"
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
      {loadFailure ? (
        <RouteLoadPanel failure={loadFailure} onRetry={() => void fetchAll()} />
      ) : null}
      {(offlineSummary.queued > 0 ||
        offlineSummary.syncing > 0 ||
        offlineSummary.failed > 0 ||
        offlineSummary.conflicted > 0) && (
        <div className="metal-panel metal-panel--card rounded-2xl border border-amber-500/35 px-3 py-2 text-xs text-amber-100">
          Sync queue: pending {offlineSummary.queued + offlineSummary.syncing} •
          failed {offlineSummary.failed} • conflicted{" "}
          {offlineSummary.conflicted}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4" role="status" aria-live="polite">
          <p className="text-sm text-[color:var(--theme-text-secondary)]">
            Loading work order…
          </p>
          <MobileWorkOrderDetailSkeleton className="h-20" />
          <MobileWorkOrderDetailSkeleton className="h-32" />
          <MobileWorkOrderDetailSkeleton className="h-40" />
        </div>
      ) : loadFailure && !wo ? null : !wo ? (
        <div className="text-sm text-red-300">Work order not found.</div>
      ) : (
        <div className="space-y-5">
          <div className="metal-panel metal-panel--card rounded-2xl border border-[var(--metal-border-soft)] px-3 py-3 shadow-[var(--theme-shadow-medium)]">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-semibold sm:text-lg">
                    Work Order{" "}
                    <span className="text-sky-200">
                      {wo.custom_id || `#${wo.id.slice(0, 8)}`}
                    </span>
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
                <p className="text-[11px] text-[color:var(--theme-text-secondary)]">
                  Created {createdAtText}
                </p>
                <p className="text-[11px] text-[color:var(--theme-text-secondary)]">
                  Expected {expectedCompletionText}
                </p>
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
                      jumpToElement(
                        lineRefs.current[pill.targetLineId] ?? null,
                      );
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
                        <span className="font-mono">{vehicle.vin ?? "—"}</span>
                        <br />
                        Plate:{" "}
                        {vehicle.license_plate ?? (
                          <span className="text-[color:var(--theme-text-muted)]">
                            —
                          </span>
                        )}
                        <br />
                        Mileage:{" "}
                        {vehicle.mileage ??
                          (wo.odometer_km != null ? (
                            `${wo.odometer_km} km`
                          ) : (
                            <span className="text-[color:var(--theme-text-muted)]">
                              —
                            </span>
                          ))}
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
                        {[customer.first_name ?? "", customer.last_name ?? ""]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </p>
                      <p className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                        {customer.phone ?? "—"}{" "}
                        {customer.email ? (
                          <>
                            <span className="mx-1 text-[color:var(--theme-text-muted)]">
                              •
                            </span>
                            {customer.email}
                          </>
                        ) : null}
                      </p>
                      {customer.id &&
                        canOpenMobileCustomerProfile(productScope) && (
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
                        (ln.hold_reason ?? "").toLowerCase().includes("quote");

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
                                {displayNumberByLine[ln.id] ?? idx + 1}.{" "}
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
                                {(ln.status ?? "awaiting").replaceAll("_", " ")}{" "}
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
                              {String(q.job_type ?? "job").replaceAll("_", " ")}{" "}
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

          {inspectionTemplateId ? (
            <section className="metal-panel metal-panel--card rounded-2xl border border-sky-400/35 px-4 py-4 shadow-[var(--theme-shadow-medium)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200">
                    Inspection setup
                  </div>
                  <h2 className="mt-1 text-sm font-semibold sm:text-base">
                    Choose the job line for this template
                  </h2>
                  <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                    The template stays attached to the selected line, and that
                    line remains the inspection runtime identity.
                  </p>
                </div>
                <Link
                  href="/mobile/service/inspection-builder"
                  className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-primary)]"
                >
                  Cancel
                </Link>
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
              <p className="text-sm text-[color:var(--theme-text-secondary)]">
                No lines yet.
              </p>
            ) : (
              <div className="space-y-2">
                {displayLines.map((ln, idx) => {
                  const attachedTemplateId = extractInspectionTemplateId(
                    ln as WorkOrderLineWithInspectionMeta,
                  );
                  const lineLocked =
                    Boolean(ln.voided_at) ||
                    [ln.status, ln.line_status].some((status) =>
                      FIELD_INSPECTION_LOCKED_LINE_STATUSES.has(
                        normalizeFieldInspectionStatus(status),
                      ),
                    ) ||
                    FIELD_INSPECTION_LOCKED_PARENT_STATUSES.has(
                      normalizeFieldInspectionStatus(wo.status),
                    );
                  const hasDifferentTemplate = Boolean(
                    inspectionTemplateId &&
                    attachedTemplateId &&
                    attachedTemplateId !== inspectionTemplateId,
                  );
                  const activeTechnicianIds =
                    lineContext.activeTechnicianIdsByLine?.[ln.id] ?? [];
                  const punchedIn = visibleLineState(ln) === "in_progress";

                  const openFocused = () => {
                    setFocusedJobId(ln.id);
                    setFocusedOpen(true);
                  };

                  const technicianIds = [
                    ln.assigned_tech_id,
                    ...(lineContext.technicianIdsByLine[ln.id] ?? []),
                  ].filter(
                    (id, index, ids): id is string =>
                      Boolean(id) && ids.indexOf(id) === index,
                  );
                  const lineTechnicians = technicianIds.map((id) => ({
                    id,
                    full_name: techNamesById[id] ?? "Assigned tech",
                  }));
                  const pricing = pricingByLine[ln.id];
                  const partRequests =
                    lineContext.partRequestsByLine[ln.id] ?? [];
                  const activeTechnicianNames = activeTechnicianIds
                    .map((id) => techNamesById[id])
                    .filter((name): name is string => Boolean(name));
                  const canRunLineInspection = canRunInspectionForLine(ln);

                  return (
                    <div
                      key={ln.id}
                      ref={setLineRef(ln.id)}
                      className="scroll-mt-24"
                    >
                      <JobCard
                        index={idx}
                        displayNumber={displayNumberByLine[ln.id]}
                        line={ln}
                        parts={lineContext.allocationsByLine[ln.id] ?? []}
                        partsCount={pricing?.partsCount ?? 0}
                        partsStatusLabel={getPartsRequestStatusLabel(
                          partRequests,
                        )}
                        pricing={pricing}
                        technicians={lineTechnicians}
                        canAssign={canAssign}
                        isPunchedIn={punchedIn}
                        isCurrentUserWorkingThisLine={Boolean(
                          punchedIn &&
                          currentUserId &&
                          activeTechnicianIds.includes(currentUserId),
                        )}
                        activeTechnicianNames={activeTechnicianNames}
                        onOpen={openFocused}
                        onAssign={undefined}
                        onOpenInspection={
                          inspectionTemplateId
                            ? undefined
                            : canOpenWorkOrderInspectionModule({
                                  inspectionTemplateId: attachedTemplateId,
                                  canRunInspections: canRunLineInspection,
                                })
                              ? () => openInspection(ln)
                              : undefined
                        }
                        onAddPart={undefined}
                        compact
                        hideExecutionStageCompletenessPills
                      />
                      {inspectionTemplateId ? (
                        <div className="mt-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
                          {!canRunLineInspection ? (
                            <p className="text-xs text-[color:var(--theme-text-secondary)]">
                              {inspectionAccessError}
                            </p>
                          ) : lineLocked ? (
                            <p className="text-xs text-[color:var(--theme-text-secondary)]">
                              Inactive or completed job lines cannot receive a
                              new inspection template.
                            </p>
                          ) : hasDifferentTemplate ? (
                            <p className="text-xs text-amber-200">
                              This job already has a different inspection
                              template. Existing assignments are not replaced
                              from Field.
                            </p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void attachAndOpenInspection(ln)}
                              disabled={attachingTemplateLineId !== null}
                              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-sky-400/45 bg-sky-500/12 px-4 py-2 text-sm font-semibold text-sky-100 disabled:cursor-wait disabled:opacity-55"
                            >
                              {attachingTemplateLineId === ln.id
                                ? "Attaching..."
                                : attachedTemplateId === inspectionTemplateId
                                  ? "Open attached inspection"
                                  : "Attach and start inspection"}
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {quotePending.length > 0 && (
            <section
              id="pending-quote-items"
              className="metal-panel metal-panel--card scroll-mt-20 rounded-2xl border border-sky-400/25 px-4 py-4 shadow-[var(--theme-shadow-medium)]"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-sky-100 sm:text-base">
                    Pending quote items
                  </h2>
                  <p className="text-[11px] text-[color:var(--theme-text-muted)]">
                    Recommended repairs awaiting quote review or customer
                    decision.
                  </p>
                </div>
                <span className="rounded-full border border-sky-400/40 px-3 py-1.5 text-[11px] font-semibold text-sky-100">
                  Review here
                </span>
              </div>
              <div className="space-y-2">
                {quotePending.map((q) => {
                  const meta =
                    typeof q.metadata === "object" &&
                    q.metadata &&
                    !Array.isArray(q.metadata)
                      ? (q.metadata as Record<string, unknown>)
                      : {};
                  const parts = Array.isArray(meta.parts) ? meta.parts : [];
                  const inspectionStatus =
                    typeof meta.inspection_status === "string"
                      ? meta.inspection_status.toUpperCase()
                      : "RECOMMEND";
                  const sourceFinding =
                    typeof meta.source_finding_title === "string"
                      ? meta.source_finding_title
                      : (q.ai_complaint ?? "Inspection finding");
                  const pricingReviewRequired =
                    q.status === "pending_parts" ||
                    (typeof meta.menu_match === "object" &&
                      meta.menu_match !== null &&
                      (meta.menu_match as Record<string, unknown>)
                        .pricing_review_required === true);
                  return (
                    <article
                      key={q.id}
                      className="rounded-xl border border-sky-400/20 bg-sky-950/20 p-3"
                    >
                      <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                        {q.description || "Recommended repair"}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-sky-200">
                        {inspectionStatus} • {sourceFinding}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[color:var(--theme-text-secondary)]">
                        <div>
                          Labor:{" "}
                          {typeof q.labor_hours === "number"
                            ? `${q.labor_hours}h`
                            : typeof q.est_labor_hours === "number"
                              ? `${q.est_labor_hours}h`
                              : "—"}
                        </div>
                        <div>
                          Parts:{" "}
                          {parts.length > 0 ? `${parts.length} req.` : "None"}
                        </div>
                        <div>
                          Stage:{" "}
                          {String(
                            q.stage ?? q.status ?? "advisor_pending",
                          ).replaceAll("_", " ")}
                        </div>
                        <div
                          className={
                            pricingReviewRequired
                              ? "text-amber-200"
                              : "text-emerald-200"
                          }
                        >
                          {pricingReviewRequired
                            ? "Pricing review"
                            : "Pricing available"}
                        </div>
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
                <h2 className="text-sm font-semibold sm:text-base">
                  Focused job / actions
                </h2>
                <p className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                  {nextActionText}
                </p>
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
            <h2 className="text-sm font-semibold sm:text-base">
              Supporting utilities
            </h2>
            <div className="mt-2">
              <AskAssistantEntry mobile placement="dock" />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
