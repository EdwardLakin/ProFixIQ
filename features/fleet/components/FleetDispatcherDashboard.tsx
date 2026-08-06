"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Route,
  Truck,
  UsersRound,
} from "lucide-react";

import type {
  DispatchAssignment,
  FleetUnit,
} from "@/features/fleet/components/FleetControlTower";
import FleetDefectQueue from "@/features/fleet/components/FleetDefectQueue";

type TowerPayload = {
  units?: FleetUnit[];
  assignments?: DispatchAssignment[];
};

export default function FleetDispatcherDashboard({
  fleetId,
  actorLabel,
}: {
  fleetId: string | null;
  actorLabel: string;
}) {
  const [payload, setPayload] = useState<TowerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/fleet/tower", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fleetId }),
          cache: "no-store",
        });
        const body = (await response
          .json()
          .catch(() => ({}))) as TowerPayload & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error || "Unable to load dispatch");
        if (active) setPayload(body);
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Unable to load dispatch",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [fleetId]);

  const assignments = useMemo(
    () => payload?.assignments ?? [],
    [payload?.assignments],
  );
  const due = assignments.filter((item) => item.state === "pretrip_due").length;
  const enRoute = assignments.filter(
    (item) => item.state === "en_route",
  ).length;
  const inShop = assignments.filter((item) => item.state === "in_shop").length;

  return (
    <main className="space-y-5">
      <header className="overflow-hidden rounded-3xl border border-sky-400/20 bg-gradient-to-br from-sky-400/[0.15] via-[color:var(--theme-surface-inset)] to-[color:var(--theme-surface-inset)] p-5 shadow-[var(--theme-shadow-medium)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-500 dark:text-sky-300">
              Fleet dispatch
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Dispatch Control
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
              Keep drivers moving, review raw defect reports, and send only
              approved maintenance needs to the Shop.
            </p>
          </div>
          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]/75 px-4 py-3">
            <div className="text-[9px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
              Workspace role
            </div>
            <div className="mt-1 text-sm font-semibold">{actorLabel}</div>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Active assignments",
            value: assignments.length,
            icon: UsersRound,
            tone: "text-sky-500 dark:text-sky-300",
          },
          {
            label: "Pre-trips due",
            value: due,
            icon: Clock3,
            tone: "text-amber-600 dark:text-amber-200",
          },
          {
            label: "En route",
            value: enRoute,
            icon: Route,
            tone: "text-blue-500 dark:text-blue-300",
          },
          {
            label: "Currently in Shop",
            value: inShop,
            icon: Truck,
            tone: "text-emerald-600 dark:text-emerald-300",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4"
            >
              <Icon className={`h-4 w-4 ${card.tone}`} aria-hidden="true" />
              <div className="mt-3 text-2xl font-semibold">
                {loading ? "—" : card.value}
              </div>
              <div className="text-xs text-[color:var(--theme-text-muted)]">
                {card.label}
              </div>
            </div>
          );
        })}
      </section>

      {error ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-800 dark:text-amber-100">
          <AlertTriangle className="mr-2 inline h-4 w-4" /> {error}
        </div>
      ) : null}

      <FleetDefectQueue fleetId={fleetId} mode="dispatcher" />

      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-sky-500 dark:text-sky-300" />
          <div>
            <h2 className="font-semibold">Live assignments</h2>
            <p className="text-xs text-[color:var(--theme-text-muted)]">
              Driver, unit, route, and today’s inspection state
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {assignments.map((assignment) => (
            <article
              key={assignment.id}
              className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {assignment.driverName}
                  </div>
                  <div className="mt-1 truncate text-xs text-[color:var(--theme-text-secondary)]">
                    {assignment.unitLabel}
                    {assignment.routeLabel ? ` · ${assignment.routeLabel}` : ""}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase ${
                    assignment.state === "pretrip_due"
                      ? "bg-amber-300/15 text-amber-700 dark:text-amber-100"
                      : assignment.state === "in_shop"
                        ? "bg-emerald-400/10 text-emerald-700 dark:text-emerald-200"
                        : "bg-sky-400/10 text-sky-700 dark:text-sky-200"
                  }`}
                >
                  {assignment.state === "pretrip_due"
                    ? "Pre-trip due"
                    : assignment.state === "in_shop"
                      ? "In Shop"
                      : "En route"}
                </span>
              </div>
            </article>
          ))}
          {!loading && !assignments.length ? (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-400/10 p-3 text-sm text-emerald-700 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4" /> No active dispatch
              assignments.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
