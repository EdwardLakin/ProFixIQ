"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  MapPin,
  RefreshCw,
  Route,
  Truck,
  UserRound,
} from "lucide-react";
import type {
  DispatchBoardSnapshot,
  DispatchServiceVehicle,
  DispatchTechnician,
  DispatchVisit,
} from "@/features/dispatch/lib/contracts";
import type { ServiceVisitStatus } from "@/features/scheduling/lib/service-visit-contract";

const EMPTY_BOARD: DispatchBoardSnapshot = {
  generatedAt: new Date(0).toISOString(),
  visits: [],
  technicians: [],
  serviceVehicles: [],
};

const STATUS_LABEL: Record<ServiceVisitStatus, string> = {
  scheduled: "Scheduled",
  dispatched: "Dispatched",
  en_route: "En route",
  arrived: "Arrived",
  working: "Working",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

const NEXT_ACTION: Partial<Record<ServiceVisitStatus, { status: ServiceVisitStatus; label: string }>> = {
  scheduled: { status: "dispatched", label: "Dispatch" },
  dispatched: { status: "en_route", label: "Start travel" },
  en_route: { status: "arrived", label: "Mark arrived" },
  arrived: { status: "working", label: "Start work" },
  working: { status: "completed", label: "Complete" },
  paused: { status: "working", label: "Resume work" },
};

type LaneKey = "unassigned" | "scheduled" | "dispatched" | "en_route" | "on_site";

type Lane = {
  key: LaneKey;
  title: string;
  description: string;
  visits: DispatchVisit[];
};

function formatWhen(value?: string | null): string {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unscheduled";
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function serviceAddressLabel(visit: DispatchVisit): string {
  const address = visit.serviceAddress;
  if (!address) return visit.mode === "mobile" ? "Location not set" : "Shop service";
  return [address.addressLine1, address.city].filter(Boolean).join(", ");
}

function vehicleLabel(visit: DispatchVisit): string {
  return visit.vehicle?.label || visit.vehicle?.plate || "Vehicle";
}

function operationKey(action: string, visitId: string): string {
  return `dispatch-ui:${action}:${visitId}:${crypto.randomUUID()}`;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function visitMatchesLane(visit: DispatchVisit, lane: LaneKey): boolean {
  if (lane === "unassigned") return !visit.assignedTechnician;
  if (!visit.assignedTechnician) return false;
  if (lane === "scheduled") return visit.status === "scheduled";
  if (lane === "dispatched") return visit.status === "dispatched";
  if (lane === "en_route") return visit.status === "en_route";
  return ["arrived", "working", "paused"].includes(visit.status);
}

export default function DispatchBoardClient({
  surface = "shop",
}: {
  surface?: "shop" | "field";
}) {
  const [board, setBoard] = useState<DispatchBoardSnapshot>(EMPTY_BOARD);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyVisitId, setBusyVisitId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fieldSurface = surface === "field";
  const scheduleHref = fieldSurface
    ? "/mobile/appointments"
    : "/dashboard/appointments";

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dispatch/board", { cache: "no-store" });
      const payload = await readJson(response);
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error?: unknown }).error ?? "Dispatch board failed to load.")
            : "Dispatch board failed to load.";
        throw new Error(message);
      }
      setBoard(payload as DispatchBoardSnapshot);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Dispatch board failed to load.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const lanes = useMemo<Lane[]>(() => {
    const source: Array<Omit<Lane, "visits">> = [
      {
        key: "unassigned",
        title: "Unassigned",
        description: "Needs a technician",
      },
      {
        key: "scheduled",
        title: "Scheduled",
        description: "Ready for dispatch",
      },
      {
        key: "dispatched",
        title: "Dispatched",
        description: "Released to technician",
      },
      {
        key: "en_route",
        title: "En Route",
        description: "Travelling to customer",
      },
      {
        key: "on_site",
        title: "On Site",
        description: "Arrived or working",
      },
    ];
    return source.map((lane) => ({
      ...lane,
      visits: board.visits.filter((visit) => visitMatchesLane(visit, lane.key)),
    }));
  }, [board.visits]);

  const applyMutation = useCallback(
    async (visit: DispatchVisit, body: Record<string, unknown>, action: string) => {
      setBusyVisitId(visit.id);
      setError(null);
      try {
        const response = await fetch(`/api/dispatch/visits/${visit.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": operationKey(action, visit.id),
          },
          body: JSON.stringify({
            ...body,
            expectedVersion: visit.version,
          }),
        });
        const payload = await readJson(response);
        if (!response.ok) {
          const message =
            payload && typeof payload === "object" && "error" in payload
              ? String((payload as { error?: unknown }).error ?? "Dispatch update failed.")
              : "Dispatch update failed.";
          throw new Error(message);
        }
        await load(true);
      } catch (mutationError) {
        setError(
          mutationError instanceof Error ? mutationError.message : "Dispatch update failed.",
        );
      } finally {
        setBusyVisitId(null);
      }
    },
    [load],
  );

  const assignTechnician = useCallback(
    async (visit: DispatchVisit, technicianId: string) => {
      await applyMutation(
        visit,
        {
          action: "assign",
          assignedUserId: technicianId || null,
          serviceVehicleId: visit.serviceVehicle?.id ?? null,
        },
        "assign-tech",
      );
    },
    [applyMutation],
  );

  const assignVehicle = useCallback(
    async (visit: DispatchVisit, serviceVehicleId: string) => {
      await applyMutation(
        visit,
        {
          action: "assign",
          assignedUserId: visit.assignedTechnician?.id ?? null,
          serviceVehicleId: serviceVehicleId || null,
        },
        "assign-truck",
      );
    },
    [applyMutation],
  );

  const transition = useCallback(
    async (visit: DispatchVisit, status: ServiceVisitStatus) => {
      await applyMutation(
        visit,
        { action: "transition", toStatus: status },
        `transition-${status}`,
      );
    },
    [applyMutation],
  );

  return (
    <main
      className={`${
        fieldSurface
          ? "w-full px-3 py-4 sm:px-4 lg:px-5"
          : "min-h-screen px-4 py-5 sm:px-6 lg:px-8"
      } bg-[color:var(--theme-page-bg)] text-[color:var(--theme-text-primary)]`}
    >
      <div className="mx-auto max-w-[1800px] space-y-5">
        <header className="flex flex-col gap-4 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-5 shadow-[var(--theme-shadow-soft)] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
              <Route className="h-4 w-4" /> Field operations
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Dispatch</h1>
            <p className="mt-1 max-w-2xl text-sm text-[color:var(--theme-text-muted)]">
              Assign field work, release technicians, and follow each service visit from scheduled through completion.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fieldSurface ? (
              <Link
                href="/mobile/service/new"
                className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--theme-action-primary)] px-3 py-2 text-sm font-semibold text-[color:var(--theme-action-primary-text)] hover:opacity-90"
              >
                New service call
              </Link>
            ) : null}
            <Link
              href={scheduleHref}
              className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-sm font-medium hover:bg-[color:var(--theme-surface-subtle)]"
            >
              <CalendarClock className="h-4 w-4" /> Schedule
            </Link>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-sm font-medium hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {lanes.map((lane) => (
            <div
              key={lane.key}
              className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] px-4 py-3"
            >
              <div className="text-2xl font-semibold tabular-nums">{lane.visits.length}</div>
              <div className="text-sm font-medium">{lane.title}</div>
              <div className="mt-0.5 text-xs text-[color:var(--theme-text-muted)]">{lane.description}</div>
            </div>
          ))}
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-10 text-center text-sm text-[color:var(--theme-text-muted)]">
            Loading dispatch…
          </div>
        ) : (
          <section className="grid gap-4 xl:grid-cols-5">
            {lanes.map((lane) => (
              <div
                key={lane.key}
                className="min-w-0 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
              >
                <div className="mb-3 flex items-start justify-between gap-2 px-1">
                  <div>
                    <h2 className="font-semibold">{lane.title}</h2>
                    <p className="text-xs text-[color:var(--theme-text-muted)]">{lane.description}</p>
                  </div>
                  <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-xs tabular-nums text-[color:var(--theme-text-muted)]">
                    {lane.visits.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {lane.visits.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] px-3 py-8 text-center text-xs text-[color:var(--theme-text-muted)]">
                      Nothing here
                    </div>
                  ) : (
                    lane.visits.map((visit) => (
                      <DispatchCard
                        key={visit.id}
                        visit={visit}
                        technicians={board.technicians}
                        serviceVehicles={board.serviceVehicles}
                        busy={busyVisitId === visit.id}
                        onAssignTechnician={assignTechnician}
                        onAssignVehicle={assignVehicle}
                        onTransition={transition}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function DispatchCard({
  visit,
  technicians,
  serviceVehicles,
  busy,
  onAssignTechnician,
  onAssignVehicle,
  onTransition,
}: {
  visit: DispatchVisit;
  technicians: DispatchTechnician[];
  serviceVehicles: DispatchServiceVehicle[];
  busy: boolean;
  onAssignTechnician: (visit: DispatchVisit, technicianId: string) => Promise<void>;
  onAssignVehicle: (visit: DispatchVisit, serviceVehicleId: string) => Promise<void>;
  onTransition: (visit: DispatchVisit, status: ServiceVisitStatus) => Promise<void>;
}) {
  const next = NEXT_ACTION[visit.status];
  const canAdvance = Boolean(next && visit.allowedTransitions.includes(next.status));
  const requiresTech = next?.status === "dispatched" && !visit.assignedTechnician;

  return (
    <article className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] shadow-sm">
      <div className="border-b border-[color:var(--theme-border-soft)] px-3.5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {visit.workOrderNumber || visit.customer?.name || "Service visit"}
            </div>
            <div className="mt-0.5 truncate text-xs text-[color:var(--theme-text-muted)]">
              {visit.customer?.name || "Customer not linked"} · {vehicleLabel(visit)}
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-0.5 text-[11px] font-medium">
            {STATUS_LABEL[visit.status]}
          </span>
        </div>
      </div>

      <div className="space-y-2.5 px-3.5 py-3 text-xs">
        <div className="flex items-start gap-2 text-[color:var(--theme-text-muted)]">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{formatWhen(visit.scheduledStart)}</span>
        </div>
        <div className="flex items-start gap-2 text-[color:var(--theme-text-muted)]">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-2">{serviceAddressLabel(visit)}</span>
        </div>
        {visit.estimatedTravelMinutes != null ? (
          <div className="flex items-center gap-2 text-[color:var(--theme-text-muted)]">
            <Route className="h-3.5 w-3.5" />
            <span>{visit.estimatedTravelMinutes} min estimated travel</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-[color:var(--theme-border-soft)] px-3.5 py-3">
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--theme-text-muted)]">
            <UserRound className="h-3.5 w-3.5" /> Technician
          </span>
          <select
            value={visit.assignedTechnician?.id ?? ""}
            disabled={busy}
            onChange={(event) => void onAssignTechnician(visit, event.target.value)}
            className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-2 text-xs outline-none disabled:opacity-50"
          >
            <option value="">Unassigned</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.name}
              </option>
            ))}
          </select>
        </label>

        {visit.mode === "mobile" ? (
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--theme-text-muted)]">
              <Truck className="h-3.5 w-3.5" /> Service vehicle <span className="font-normal">(optional)</span>
            </span>
            <select
              value={visit.serviceVehicle?.id ?? ""}
              disabled={busy}
              onChange={(event) => void onAssignVehicle(visit, event.target.value)}
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-2 text-xs outline-none disabled:opacity-50"
            >
              <option value="">No tracked truck</option>
              {serviceVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name}{vehicle.unitNumber ? ` · ${vehicle.unitNumber}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {next && canAdvance ? (
        <div className="border-t border-[color:var(--theme-border-soft)] p-3">
          <button
            type="button"
            disabled={busy || requiresTech}
            onClick={() => void onTransition(visit, next.status)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--theme-action-primary)] px-3 py-2.5 text-xs font-semibold text-[color:var(--theme-action-primary-text)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {requiresTech ? "Assign technician first" : next.label}
            {!requiresTech ? <ArrowRight className="h-3.5 w-3.5" /> : null}
          </button>
          {visit.status === "working" && visit.allowedTransitions.includes("paused") ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onTransition(visit, "paused")}
              className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-medium hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-50"
            >
              Pause
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
