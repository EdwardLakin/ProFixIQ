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
  RefreshCw,
  Route,
  Truck,
  UserRound,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DispatchMutationResult,
  DispatchVisit,
  MobileActiveJobContract,
} from "@/features/dispatch/lib/contracts";
import type { ServiceVisitStatus } from "@/features/scheduling/lib/service-visit-contract";

const SNAPSHOT_CACHE_KEY = "profixiq:mobile-service:active:v1";
const REFRESH_INTERVAL_MS = 30_000;

type VisitAction = {
  label: string;
  icon: typeof Navigation;
  toStatus: ServiceVisitStatus;
  confirm?: string;
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
        confirm: "Mark this service visit complete? The repair work order remains the repair and billing record.",
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
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
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

async function transitionVisit(
  visit: DispatchVisit,
  toStatus: ServiceVisitStatus,
): Promise<DispatchMutationResult> {
  const key = operationKey(visit.id, toStatus);
  const response = await fetch(`/api/dispatch/visits/${visit.id}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({
      action: "transition",
      toStatus,
      expectedVersion: visit.version,
      operationKey: key,
    }),
  });
  const body = (await response.json().catch(() => null)) as
    | DispatchMutationResult
    | { error?: string }
    | null;
  if (!response.ok || !body || !("visit" in body)) {
    throw new Error(
      body && "error" in body && body.error
        ? body.error
        : "Unable to update the service visit.",
    );
  }
  return body;
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
}: {
  visit: DispatchVisit;
  active: boolean;
  online: boolean;
  busy: boolean;
  onPrimary: (visit: DispatchVisit) => void;
  onPause: (visit: DispatchVisit) => void;
}) {
  const action = primaryAction(visit);
  const address = addressText(visit);
  const directions = directionsHref(visit);
  const phone = visit.customer?.phone?.trim() || null;
  const ActionIcon = action?.icon ?? ArrowRight;

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
          <span className="shrink-0 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2.5 py-1 text-[0.68rem] font-bold text-[color:var(--theme-text-primary)]">
            {statusLabel(visit.status)}
          </span>
        </div>
      </header>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Time" value={`${formatDay(visit.scheduledStart)} · ${formatClock(visit.scheduledStart)}`} />
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
              <span className="min-w-0 text-[color:var(--theme-text-secondary)]">{address}</span>
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
                {visit.serviceVehicle.unitNumber ? ` · ${visit.serviceVehicle.unitNumber}` : ""}
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
        ) : (
          <div className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] px-3.5 py-3 text-xs text-[color:var(--theme-text-muted)]">
            No work order is linked yet. Dispatch can exist before repair intake; the work order will appear here once linked.
          </div>
        )}

        {action ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled={!online || busy}
              onClick={() => onPrimary(visit)}
              className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--accent-copper)] px-4 text-base font-extrabold text-white shadow-card disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <RefreshCw className="h-5 w-5 animate-spin" /> : <ActionIcon className="h-5 w-5" />}
              {busy ? "Updating…" : action.label}
            </button>
            {visit.status === "working" ? (
              <button
                type="button"
                disabled={!online || busy}
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

export default function MobileServiceShell() {
  const [snapshot, setSnapshot] = useState<MobileActiveJobContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busyVisitId, setBusyVisitId] = useState<string | null>(null);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );

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
            : "Unable to load mobile service calls.",
        );
      }
      setSnapshot(body);
      setStale(false);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(body));
      }
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
      setError(cause instanceof Error ? cause.message : "Unable to load service calls.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const updateOnline = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void load(true);
    };
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void load(true);
    };
    const timer = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") void load(true);
    }, REFRESH_INTERVAL_MS);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [load]);

  const activeJob = snapshot?.activeJob ?? null;
  const nextJob = snapshot?.nextJob ?? null;
  const primaryVisit = activeJob ?? nextJob;

  const headline = useMemo(() => {
    if (loading && !snapshot) return "Loading field work…";
    if (activeJob) return `${statusLabel(activeJob.status)} · ${vehicleText(activeJob)}`;
    if (nextJob) return `Next at ${formatClock(nextJob.scheduledStart)}`;
    return "No assigned service calls";
  }, [activeJob, loading, nextJob, snapshot]);

  const runTransition = useCallback(
    async (visit: DispatchVisit, toStatus: ServiceVisitStatus) => {
      if (!online || busyVisitId) return;
      setBusyVisitId(visit.id);
      setError(null);
      try {
        let current = visit;
        if (toStatus === "en_route" && current.status === "scheduled") {
          current = (await transitionVisit(current, "dispatched")).visit;
        }
        const result = await transitionVisit(current, toStatus);
        setSnapshot((previous) => {
          if (!previous) return previous;
          const replace = (item: DispatchVisit | null) =>
            item?.id === result.visit.id ? result.visit : item;
          return {
            ...previous,
            serverNow: new Date().toISOString(),
            activeJob: replace(previous.activeJob),
            nextJob: replace(previous.nextJob),
          };
        });
        await load(true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Service visit update failed.");
        await load(true);
      } finally {
        setBusyVisitId(null);
      }
    },
    [busyVisitId, load, online],
  );

  const handlePrimary = useCallback(
    (visit: DispatchVisit) => {
      const action = primaryAction(visit);
      if (!action) return;
      if (action.confirm && !window.confirm(action.confirm)) return;
      void runTransition(visit, action.toStatus);
    },
    [runTransition],
  );

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-8 pt-3 text-[color:var(--theme-text-primary)] sm:px-4">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950 px-4 py-4 text-white shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.2em] text-sky-300">
              ProFixIQ Mobile Service
            </div>
            <h1 className="mt-1.5 text-2xl font-extrabold leading-tight">{headline}</h1>
            <p className="mt-1 text-sm text-slate-300">
              Travel, arrival and field work in one fast service-truck flow.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label="Refresh service calls"
            className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/[0.07] disabled:opacity-50"
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            href="/mobile/work-orders/create"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3 text-sm font-bold"
          >
            <Wrench className="h-4 w-4" /> New work
          </Link>
          <Link
            href="/mobile/work-orders"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3 text-sm font-bold"
          >
            <BriefcaseBusiness className="h-4 w-4" /> Work orders
          </Link>
        </div>
      </section>

      {!online || stale ? (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-100">
          <strong>{online ? "Saved device view" : "Offline"}.</strong>{" "}
          {stale
            ? "Showing the last service-call snapshot saved on this device."
            : "Travel/dispatch state changes require a connection; linked work orders can still use the existing offline mobile workflow."}
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
            onPrimary={handlePrimary}
            onPause={(visit) => void runTransition(visit, "paused")}
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
                onPrimary={handlePrimary}
                onPause={(visit) => void runTransition(visit, "paused")}
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
            Assigned mobile visits will appear here automatically. You can keep working from the normal mobile work-order queue in the meantime.
          </p>
          <Link
            href="/mobile/work-orders"
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 text-sm font-bold"
          >
            Open work orders <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      )}
    </main>
  );
}
