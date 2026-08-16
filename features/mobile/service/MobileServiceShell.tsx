"use client";

import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  MapPin,
  Navigation,
  Pause,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Route,
  Settings2,
  Sparkles,
  Truck,
  UserRound,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DispatchMutationResult,
  DispatchVisit,
  MobileActiveJobContract,
} from "@/features/dispatch/lib/contracts";
import type { ServiceVisitStatus } from "@/features/scheduling/lib/service-visit-contract";
import {
  getOfflineMutationScope,
  hydrateOfflineMutationQueue,
  listPendingMutations,
  runMutationWithOfflineQueue,
} from "@/features/shared/lib/offline/mutations";
import { replayAndReconcileOfflineMutations } from "@/features/shared/lib/offline/replay";

const SNAPSHOT_CACHE_KEY = "profixiq:mobile-service:active:v1";
const PENDING_CLOSEOUT_CACHE_KEY =
  "profixiq:mobile-service:pending-closeout:v1";
const REFRESH_INTERVAL_MS = 30_000;

type PendingCloseout = {
  workOrderId: string;
  visitId: string;
  mutationId: string;
};

function pendingCloseoutKey(userId: string, shopId: string): string {
  return `${PENDING_CLOSEOUT_CACHE_KEY}:${userId}:${shopId}`;
}

type VisitAction = {
  label: string;
  icon: typeof Navigation;
  toStatus: ServiceVisitStatus;
  confirm?: string;
};

type TransitionOutcome = {
  visit: DispatchVisit;
  queued: boolean;
  mutationId: string;
};

function statusLabel(status: ServiceVisitStatus): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "dispatched":
      return "Dispatched";
    case "en_route":
      return "En route";
    case "arrived":
      return "Arrived";
    case "working":
      return "Working";
    case "paused":
      return "Paused";
    case "completed":
      return "Complete";
    case "cancelled":
      return "Cancelled";
  }
}

function primaryAction(visit: DispatchVisit): VisitAction | null {
  switch (visit.status) {
    case "scheduled":
    case "dispatched":
      return { label: "Start travel", icon: Navigation, toStatus: "en_route" };
    case "en_route":
      return { label: "I've arrived", icon: MapPin, toStatus: "arrived" };
    case "arrived":
      return { label: "Start work", icon: Wrench, toStatus: "working" };
    case "paused":
      return { label: "Resume work", icon: Play, toStatus: "working" };
    case "working":
      return {
        label: "Complete visit",
        icon: CheckCircle2,
        toStatus: "completed",
        confirm:
          "Mark this service visit complete? The repair work order remains the repair and billing record.",
      };
    default:
      return null;
  }
}

function formatClock(value?: string | null): string {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unscheduled";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDay(value?: string | null): string {
  if (!value) return "Today";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Today";
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function addressText(visit: DispatchVisit): string | null {
  const address = visit.serviceAddress;
  if (!address) return null;
  return [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.provinceState,
    address.postalCode,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

function directionsHref(visit: DispatchVisit): string | null {
  const address = visit.serviceAddress;
  if (!address) return null;
  const lat = Number(address.latitude);
  const lng = Number(address.longitude);
  const destination =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat},${lng}`
      : addressText(visit);
  return destination
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
    : null;
}

function vehicleText(visit: DispatchVisit): string {
  return visit.vehicle?.label?.trim() || visit.vehicle?.plate?.trim() || "Vehicle";
}

function customerText(visit: DispatchVisit): string {
  return visit.customer?.name?.trim() || "Customer";
}

function operationKey(visitId: string, action: string): string {
  const entropy =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `mobile-service:${visitId}:${action}:${entropy}`.slice(0, 280);
}

function optimisticTransition(
  visit: DispatchVisit,
  toStatus: ServiceVisitStatus,
): DispatchVisit {
  const now = new Date().toISOString();
  return {
    ...visit,
    status: toStatus,
    version: Number(visit.version ?? 0) + 1,
    lastStatusAt: now,
    dispatchedAt:
      toStatus === "dispatched" ? visit.dispatchedAt ?? now : visit.dispatchedAt,
    travelStartedAt:
      toStatus === "en_route" ? visit.travelStartedAt ?? now : visit.travelStartedAt,
    arrivedAt: toStatus === "arrived" ? visit.arrivedAt ?? now : visit.arrivedAt,
    workStartedAt:
      toStatus === "working" ? visit.workStartedAt ?? now : visit.workStartedAt,
    pausedAt: toStatus === "paused" ? now : visit.pausedAt,
    completedAt:
      toStatus === "completed" ? visit.completedAt ?? now : visit.completedAt,
  };
}

async function transitionVisit(
  visit: DispatchVisit,
  toStatus: ServiceVisitStatus,
  dependsOn?: string[],
): Promise<TransitionOutcome> {
  const mutationId = operationKey(visit.id, toStatus);
  const serverState: { result: DispatchMutationResult | null } = { result: null };

  let resolvedDependencies = dependsOn;
  if (resolvedDependencies === undefined) {
    await hydrateOfflineMutationQueue();
    const orderKey = `service-visit:${visit.id}`;
    const previous = listPendingMutations()
      .filter(
        (mutation) =>
          mutation.actionType === "service-visit:transition" &&
          mutation.orderKey === orderKey,
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      .at(-1);
    resolvedDependencies = previous ? [previous.clientMutationId] : [];
  }

  const payload = {
    visitId: visit.id,
    fromStatus: visit.status,
    toStatus,
    expectedVersion: Number(visit.version ?? 0),
    operationKey: mutationId,
  };

  // The original online-only shell PATCHed `/api/dispatch/visits/${visit.id}`.
  // Mobile V1 now queues the same canonical transition through a replay-safe
  // adapter so Dispatch remains the only Service Visit state machine.
  const result = await runMutationWithOfflineQueue({
    clientMutationId: mutationId,
    actionType: "service-visit:transition",
    payload,
    queueOnOffline: true,
    dependsOn:
      resolvedDependencies.length > 0 ? resolvedDependencies : undefined,
    orderKey: `service-visit:${visit.id}`,
    runner: async () => {
      const response = await fetch(
        `/api/mobile/service-visits/${visit.id}/transition`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": mutationId,
          },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | DispatchMutationResult
        | { error?: string }
        | null;
      if (!response.ok || !body || !("visit" in body)) {
        const error = new Error(
          body && "error" in body && body.error
            ? body.error
            : "Unable to update the service visit.",
        ) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      serverState.result = body;
    },
  });

  return {
    visit: serverState.result?.visit ?? optimisticTransition(visit, toStatus),
    queued: result.queued,
    mutationId,
  };
}

function persistSnapshot(snapshot: MobileActiveJobContract): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot));
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2.5">
      <div className="text-[0.62rem] font-bold uppercase tracking-[0.15em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-sm font-extrabold text-[color:var(--theme-text-primary)]">
        {value}
      </div>
    </div>
  );
}

function VisitCard({
  visit,
  active,
  online,
  busy,
  onPrimary,
  onPause,
  onCreateWorkOrder,
}: {
  visit: DispatchVisit;
  active: boolean;
  online: boolean;
  busy: boolean;
  onPrimary: (visit: DispatchVisit) => void;
  onPause: (visit: DispatchVisit) => void;
  onCreateWorkOrder: (visit: DispatchVisit) => void;
}) {
  const action = primaryAction(visit);
  const address = addressText(visit);
  const directions = directionsHref(visit);
  const phone = visit.customer?.phone?.trim() || null;
  const ActionIcon = action?.icon ?? ArrowRight;
  const workOrderRequired =
    !visit.workOrderId &&
    (action?.toStatus === "working" || action?.toStatus === "completed");

  return (
    <article className="overflow-hidden rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] shadow-card">
      <header className="border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
              {active ? "Active service call" : "Next service call"}
            </div>
            <h2 className="mt-1 truncate text-lg font-extrabold text-[color:var(--theme-text-primary)]">
              {vehicleText(visit)}
            </h2>
            <p className="mt-0.5 truncate text-sm text-[color:var(--theme-text-secondary)]">
              {customerText(visit)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="shrink-0 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2.5 py-1 text-[0.68rem] font-bold text-[color:var(--theme-text-primary)]">
              {statusLabel(visit.status)}
            </span>
            {!online ? (
              <span className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-amber-300">
                Queues offline
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <Metric
            label="Time"
            value={`${formatDay(visit.scheduledStart)} · ${formatClock(visit.scheduledStart)}`}
          />
          <Metric
            label="Travel"
            value={
              visit.actualTravelMinutes != null
                ? `${visit.actualTravelMinutes} min actual`
                : visit.estimatedTravelMinutes != null
                  ? `${visit.estimatedTravelMinutes} min est.`
                  : "Not estimated"
            }
          />
        </div>

        <div className="space-y-2.5 text-sm">
          {address ? (
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--accent-copper)]" />
              <span className="min-w-0 text-[color:var(--theme-text-secondary)]">
                {address}
              </span>
            </div>
          ) : null}
          {visit.assignedTechnician ? (
            <div className="flex items-center gap-2.5">
              <UserRound className="h-4 w-4 shrink-0 text-[color:var(--theme-text-muted)]" />
              <span className="text-[color:var(--theme-text-secondary)]">
                {visit.assignedTechnician.name}
              </span>
            </div>
          ) : null}
          {visit.serviceVehicle ? (
            <div className="flex items-center gap-2.5">
              <Truck className="h-4 w-4 shrink-0 text-[color:var(--theme-text-muted)]" />
              <span className="text-[color:var(--theme-text-secondary)]">
                {visit.serviceVehicle.name}
                {visit.serviceVehicle.unitNumber
                  ? ` · ${visit.serviceVehicle.unitNumber}`
                  : ""}
              </span>
            </div>
          ) : null}
          {visit.dispatchNotes ? (
            <div className="rounded-2xl bg-[color:var(--theme-surface-subtle)] px-3 py-2.5 text-[color:var(--theme-text-secondary)]">
              {visit.dispatchNotes}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {directions ? (
            <a
              href={directions}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 text-sm font-bold text-[color:var(--theme-text-primary)]"
            >
              <Route className="h-4 w-4" /> Directions
            </a>
          ) : (
            <div className="inline-flex min-h-11 items-center justify-center rounded-xl border border-dashed border-[color:var(--theme-border-soft)] px-3 text-xs text-[color:var(--theme-text-muted)]">
              No address
            </div>
          )}
          {phone ? (
            <a
              href={`tel:${phone}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 text-sm font-bold text-[color:var(--theme-text-primary)]"
            >
              <Phone className="h-4 w-4" /> Call
            </a>
          ) : (
            <div className="inline-flex min-h-11 items-center justify-center rounded-xl border border-dashed border-[color:var(--theme-border-soft)] px-3 text-xs text-[color:var(--theme-text-muted)]">
              No phone
            </div>
          )}
        </div>

        {visit.workOrderId ? (
          <div className="grid gap-2">
            <Link
              href={`/mobile/work-orders/${visit.workOrderId}`}
              className="flex min-h-12 items-center justify-between rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3.5 text-sm font-bold text-[color:var(--theme-text-primary)]"
            >
              <span className="flex min-w-0 items-center gap-2">
                <BriefcaseBusiness className="h-4.5 w-4.5 shrink-0 text-[color:var(--accent-copper)]" />
                <span className="truncate">
                  Open {visit.workOrderNumber ? `WO ${visit.workOrderNumber}` : "work order"}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
            <Link
              href={`/mobile/service/followup/${visit.workOrderId}?visitId=${encodeURIComponent(visit.id)}`}
              className="flex min-h-11 items-center justify-between rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 text-sm font-bold text-[color:var(--theme-text-secondary)]"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-sky-400" /> Recommendation for later
              </span>
              <Plus className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-2 rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] px-3.5 py-3">
            <p className="text-xs text-[color:var(--theme-text-muted)]">
              This call is scheduled, but repair intake has not started yet.
            </p>
            {visit.bookingId ? (
              <button
                type="button"
                disabled={!online || busy}
                onClick={() => onCreateWorkOrder(visit)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-3 text-sm font-extrabold text-white disabled:opacity-40"
              >
                <BriefcaseBusiness className="h-4 w-4" />
                {online ? "Create work order & start repair" : "Reconnect to start repair"}
              </button>
            ) : (
              <p className="text-xs text-[color:var(--theme-text-muted)]">
                This visit has no booking identity. Use full work-order intake.
              </p>
            )}
          </div>
        )}

        {action ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled={busy || workOrderRequired}
              onClick={() => onPrimary(visit)}
              className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--accent-copper)] px-4 text-base font-extrabold text-white shadow-card disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <ActionIcon className="h-5 w-5" />
              )}
              {busy
                ? "Updating…"
                : workOrderRequired
                  ? "Create work order first"
                  : action.label}
            </button>
            {workOrderRequired ? (
              <p className="text-center text-xs text-[color:var(--theme-text-muted)]">
                Create the work order before starting or completing repair.
              </p>
            ) : null}
            {visit.status === "working" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onPause(visit)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 text-sm font-bold text-[color:var(--theme-text-secondary)] disabled:opacity-50"
              >
                <Pause className="h-4 w-4" /> Pause visit
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function MobileServiceShell({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<MobileActiveJobContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busyVisitId, setBusyVisitId] = useState<string | null>(null);
  const [queuedNotice, setQueuedNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  const applyVisit = useCallback((updated: DispatchVisit) => {
    setSnapshot((previous) => {
      if (!previous) return previous;
      const replace = (item: DispatchVisit | null) =>
        item?.id === updated.id ? updated : item;
      const next = {
        ...previous,
        serverNow: new Date().toISOString(),
        activeJob: replace(previous.activeJob),
        nextJob: replace(previous.nextJob),
      };
      persistSnapshot(next);
      return next;
    });
  }, []);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/service-visits/active", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | MobileActiveJobContract
        | { error?: string }
        | null;
      if (!response.ok || !body || !("serverNow" in body)) {
        throw new Error(
          body && "error" in body && body.error
            ? body.error
            : "Unable to load Field Service calls.",
        );
      }
      setSnapshot(body);
      setStale(false);
      persistSnapshot(body);
    } catch (cause) {
      const cached =
        typeof window !== "undefined"
          ? window.localStorage.getItem(SNAPSHOT_CACHE_KEY)
          : null;
      if (cached) {
        try {
          setSnapshot(JSON.parse(cached) as MobileActiveJobContract);
          setStale(true);
        } catch {
          setSnapshot(null);
        }
      }
      setError(
        cause instanceof Error ? cause.message : "Unable to load service calls.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const resumePendingCloseout = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !navigator.onLine) return false;
    await hydrateOfflineMutationQueue();
    const scope = getOfflineMutationScope();
    if (!scope) return false;
    const key = pendingCloseoutKey(scope.userId, scope.shopId);
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;

    let pendingCloseout: PendingCloseout;
    try {
      pendingCloseout = JSON.parse(raw) as PendingCloseout;
    } catch {
      window.localStorage.removeItem(key);
      return false;
    }

    if (!pendingCloseout.workOrderId || !pendingCloseout.visitId || !pendingCloseout.mutationId) {
      window.localStorage.removeItem(key);
      return false;
    }

    const mutation = listPendingMutations().find(
      (item) => item.clientMutationId === pendingCloseout.mutationId,
    );
    if (mutation) {
      if (mutation.status === "conflicted") {
        setQueuedNotice(
          "Visit completion needs review before payment. Refresh the service call and resolve the sync conflict.",
        );
      }
      return false;
    }

    window.localStorage.removeItem(key);
    router.push(
      `/mobile/service/closeout/${encodeURIComponent(pendingCloseout.workOrderId)}`,
    );
    return true;
  }, [router]);

  useEffect(() => {
    void (async () => {
      if (navigator.onLine) {
        try {
          await replayAndReconcileOfflineMutations();
          if (await resumePendingCloseout()) return;
        } catch {
          // Fall through to the normal service-call refresh.
        }
      }
      await load();
    })();
  }, [load, resumePendingCloseout]);

  useEffect(() => {
    const updateOnline = () => {
      const connected = navigator.onLine;
      setOnline(connected);
      if (connected) {
        void replayAndReconcileOfflineMutations()
          .then(async () => {
            if (!(await resumePendingCloseout())) await load(true);
          })
          .catch(() => load(true));
      }
    };
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void replayAndReconcileOfflineMutations()
          .then(async () => {
            if (!(await resumePendingCloseout())) await load(true);
          })
          .catch(() => load(true));
      }
    };
    const timer = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") {
        void load(true);
      }
    }, REFRESH_INTERVAL_MS);
    setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [load, resumePendingCloseout]);

  const activeJob = snapshot?.activeJob ?? null;
  const nextJob = snapshot?.nextJob ?? null;
  const primaryVisit = activeJob ?? nextJob;

  const headline = useMemo(() => {
    if (loading && !snapshot) return "Loading field work…";
    if (activeJob)
      return `${statusLabel(activeJob.status)} · ${vehicleText(activeJob)}`;
    if (nextJob) return `Next at ${formatClock(nextJob.scheduledStart)}`;
    return "No assigned service calls";
  }, [activeJob, loading, nextJob, snapshot]);

  const runTransition = useCallback(
    async (visit: DispatchVisit, toStatus: ServiceVisitStatus) => {
      if (busyVisitId) return null;
      setBusyVisitId(visit.id);
      setError(null);
      setQueuedNotice(null);
      try {
        let current = visit;
        let queued = false;
        let result: TransitionOutcome;

        if (toStatus === "en_route" && current.status === "scheduled") {
          const dispatch = await transitionVisit(current, "dispatched");
          current = dispatch.visit;
          queued ||= dispatch.queued;
          applyVisit(current);
          result = await transitionVisit(current, toStatus, [dispatch.mutationId]);
        } else {
          result = await transitionVisit(current, toStatus);
        }
        queued ||= result.queued;
        applyVisit(result.visit);

        if (queued) {
          setStale(true);
          setQueuedNotice(
            `${statusLabel(result.visit.status)} saved on this device. It will sync automatically when you're online.`,
          );
        } else {
          await load(true);
        }
        return {
          visit: result.visit,
          queued,
          mutationId: result.mutationId,
        };
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Service visit update failed.",
        );
        if (navigator.onLine) await load(true);
        return null;
      } finally {
        setBusyVisitId(null);
      }
    },
    [applyVisit, busyVisitId, load],
  );

  const createWorkOrder = useCallback(
    async (visit: DispatchVisit) => {
      if (busyVisitId || !navigator.onLine) return;
      setBusyVisitId(visit.id);
      setError(null);
      setQueuedNotice(null);
      const opKey = operationKey(visit.id, "create-work-order");
      try {
        const response = await fetch(
          `/api/mobile/service-visits/${visit.id}/work-order`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": opKey,
            },
            body: JSON.stringify({ operationKey: opKey }),
          },
        );
        const body = (await response.json().catch(() => null)) as
          | { workOrderId?: string; visit?: DispatchVisit; error?: string }
          | null;
        if (!response.ok || !body?.workOrderId) {
          throw new Error(body?.error || "Work order could not be created.");
        }
        if (body.visit) applyVisit(body.visit);
        await load(true);
        router.push(
          `/mobile/work-orders/${encodeURIComponent(body.workOrderId)}`,
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Work order could not be created.",
        );
      } finally {
        setBusyVisitId(null);
      }
    },
    [applyVisit, busyVisitId, load, router],
  );

  const handlePrimary = useCallback(
    async (visit: DispatchVisit) => {
      const action = primaryAction(visit);
      if (!action) return;
      if (action.confirm && !window.confirm(action.confirm)) return;
      const result = await runTransition(visit, action.toStatus);
      if (
        result?.visit.status === "completed" &&
        result.visit.workOrderId &&
        !result.queued
      ) {
        router.push(
          `/mobile/service/closeout/${encodeURIComponent(result.visit.workOrderId)}`,
        );
      } else if (
        result?.visit.status === "completed" &&
        result.visit.workOrderId &&
        result.queued
      ) {
        await hydrateOfflineMutationQueue();
        const scope = getOfflineMutationScope();
        if (scope) {
          window.localStorage.setItem(
            pendingCloseoutKey(scope.userId, scope.shopId),
            JSON.stringify({
              workOrderId: result.visit.workOrderId,
              visitId: result.visit.id,
              mutationId: result.mutationId,
            } satisfies PendingCloseout),
          );
        }
        setQueuedNotice(
          "Visit completion is saved offline. Reconnect to collect payment and issue the receipt.",
        );
      }
    },
    [router, runTransition],
  );

  return (
    <main
      className={`${
        embedded
          ? "w-full space-y-4 text-[color:var(--theme-text-primary)]"
          : "mx-auto w-full max-w-3xl space-y-4 px-3 pb-8 pt-3 text-[color:var(--theme-text-primary)] sm:px-4"
      }`}
    >
      {!embedded ? (
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950 px-4 py-4 text-white shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.2em] text-sky-300">
              ProFixIQ Field Service
            </div>
            <h1 className="mt-1.5 text-2xl font-extrabold leading-tight">
              {headline}
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Call → ETA → travel → repair → payment, without leaving the field flow.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing || !online}
            aria-label="Refresh service calls"
            className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/[0.07] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Link
            href="/mobile/service/new"
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-2 text-center text-sm font-extrabold"
          >
            <Plus className="h-4 w-4" /> New call
          </Link>
          <Link
            href="/mobile/work-orders"
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.07] px-2 text-center text-sm font-bold"
          >
            <BriefcaseBusiness className="h-4 w-4" /> Work
          </Link>
          <Link
            href="/mobile/service/setup"
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.07] px-2 text-center text-sm font-bold"
          >
            <Settings2 className="h-4 w-4" /> Setup
          </Link>
        </div>
        </section>
      ) : null}

      {!online || stale ? (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-100">
          <strong>{online ? "Saved device view" : "Offline"}.</strong>{" "}
          {stale
            ? "Showing the last service-call snapshot saved on this device. Field status changes are queued in order and sync automatically; the linked work order still uses the existing offline mobile workflow."
            : "Field status changes can be queued offline; linked work orders can still use the existing offline mobile workflow."}
        </section>
      ) : null}

      {queuedNotice ? (
        <section className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-3.5 py-3 text-sm text-sky-100">
          {queuedNotice}
        </section>
      ) : null}

      {error && !loading ? (
        <section className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-100">
          {error}
        </section>
      ) : null}

      {loading && !snapshot ? (
        <section className="space-y-3 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4">
          <div className="h-5 w-36 animate-pulse rounded bg-[color:var(--theme-surface-subtle)]" />
          <div className="h-20 animate-pulse rounded-2xl bg-[color:var(--theme-surface-subtle)]" />
          <div className="h-12 animate-pulse rounded-2xl bg-[color:var(--theme-surface-subtle)]" />
        </section>
      ) : primaryVisit ? (
        <>
          <VisitCard
            visit={primaryVisit}
            active={Boolean(activeJob)}
            online={online && !stale}
            busy={busyVisitId === primaryVisit.id}
            onPrimary={(visit) => void handlePrimary(visit)}
            onPause={(visit) => void runTransition(visit, "paused")}
            onCreateWorkOrder={(visit) => void createWorkOrder(visit)}
          />

          {activeJob && nextJob && activeJob.id !== nextJob.id ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <div>
                  <h2 className="text-[0.65rem] font-extrabold uppercase tracking-[0.17em] text-[color:var(--theme-text-muted)]">
                    Up next
                  </h2>
                  <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                    Your next assigned service call.
                  </p>
                </div>
                <Clock3 className="h-4 w-4 text-[color:var(--theme-text-muted)]" />
              </div>
              <VisitCard
                visit={nextJob}
                active={false}
                online={online && !stale}
                busy={busyVisitId === nextJob.id}
                onPrimary={(visit) => void handlePrimary(visit)}
                onPause={(visit) => void runTransition(visit, "paused")}
                onCreateWorkOrder={(visit) => void createWorkOrder(visit)}
              />
            </section>
          ) : null}
        </>
      ) : (
        <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 text-center shadow-card">
          <div className="mx-auto inline-grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--theme-surface-subtle)] text-[color:var(--accent-copper)]">
            <Truck className="h-6 w-6" />
          </div>
          <h2 className="mt-3 text-lg font-extrabold">No assigned service calls</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-[color:var(--theme-text-secondary)]">
            Take the next call in seconds or keep working from the normal mobile work-order queue.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link
              href="/mobile/service/new"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 text-sm font-extrabold text-white"
            >
              <Plus className="h-4 w-4" /> New service call
            </Link>
            <Link
              href="/mobile/work-orders/create"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 text-sm font-bold"
            >
              Full work-order intake
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
