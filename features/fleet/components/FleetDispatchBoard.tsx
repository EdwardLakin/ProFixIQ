// features/fleet/components/FleetDispatchBoard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DispatchAssignment, FleetUnit } from "./FleetControlTower";

type TowerPayload = {
  units?: FleetUnit[];
  assignments?: DispatchAssignment[];
};

type DispatchFilter = "all" | DispatchAssignment["state"];

const card =
  "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] " +
  "bg-black/70 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl";

export default function FleetDispatchBoard() {
  const [data, setData] = useState<TowerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<DispatchFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/fleet/tower", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId: null }), // server will resolve from auth
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(
              (body && (body.error as string)) ||
                "Failed to load dispatch data for this shop.",
            );
          }
          return;
        }

        const body = (await res.json()) as TowerPayload;
        if (!cancelled) {
          setData({
            units: Array.isArray(body.units) ? body.units : [],
            assignments: Array.isArray(body.assignments)
              ? body.assignments
              : [],
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[FleetDispatchBoard] fetch error:", err);
        if (!cancelled) {
          setError("Failed to load dispatch data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const assignments = data?.assignments ?? [];

  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assignments.filter((a) => {
      if (stateFilter !== "all" && a.state !== stateFilter) return false;

      if (!q) return true;

      const haystack = [
        a.driverName,
        a.unitLabel,
        a.routeLabel ?? "",
        a.state,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [assignments, stateFilter, search]);

  const total = assignments.length;
  const pretripDue = assignments.filter((a) => a.state === "pretrip_due").length;
  const enRoute = assignments.filter((a) => a.state === "en_route").length;
  const inShop = assignments.filter((a) => a.state === "in_shop").length;

  return (
    <div className="px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
        />

        {/* Header card */}
        <div
          className={
            card + " relative overflow-hidden px-4 py-4 md:px-6 md:py-5"
          }
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-10 h-24 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.22),transparent_65%)]"
          />
          <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1
                className="text-xl font-bold tracking-[0.22em] text-[rgba(248,113,22,0.9)] md:text-2xl uppercase"
                style={{
                  fontFamily: "Black Ops One, system-ui, sans-serif",
                }}
              >
                Dispatch Board
              </h1>
              <p className="mt-1 text-xs text-neutral-300">
                Assign units, drivers and routes. Dispatch, shop and drivers
                stay in sync from one screen.
              </p>
            </div>

            <div className="flex flex-col gap-2 text-right text-[11px] text-neutral-400 md:items-end">
              <span>
                Total assignments:{" "}
                <span className="font-semibold text-neutral-100">
                  {total}
                </span>
              </span>
              <span>
                Pre-trip due:{" "}
                <span className="font-semibold text-amber-300">
                  {pretripDue}
                </span>
              </span>
              <span>
                En route:{" "}
                <span className="font-semibold text-sky-300">
                  {enRoute}
                </span>
              </span>
              <span>
                In shop:{" "}
                <span className="font-semibold text-emerald-300">
                  {inShop}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Controls + table */}
        <div className={card + " px-4 py-4 md:px-6 md:py-5"}>
          {/* Filters */}
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2 text-[11px]">
              {(["all", "pretrip_due", "en_route", "in_shop"] as const).map(
                (f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStateFilter(f)}
                    className={`rounded-full px-3 py-1.5 font-semibold uppercase tracking-[0.16em] transition ${
                      stateFilter === f
                        ? "bg-[color:var(--accent-copper)] text-black shadow-[0_0_16px_rgba(193,102,59,0.7)]"
                        : "border border-neutral-700 bg-black/60 text-neutral-300 hover:bg-neutral-900"
                    }`}
                  >
                    {f === "all"
                      ? "All"
                      : f === "pretrip_due"
                        ? "Pre-trip due"
                        : f === "en_route"
                          ? "En route"
                          : "In shop"}
                  </button>
                ),
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search driver, unit, route…"
                className="w-52 rounded-xl border border-[color:var(--metal-border-soft,#374151)] bg-black/70 px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[rgba(248,113,22,0.55)]"
              />
            </div>
          </div>

          {/* Error / loading */}
          {error && (
            <div className="mb-3 rounded-xl border border-red-700 bg-red-900/30 px-4 py-3 text-xs text-red-200">
              {error}
            </div>
          )}

          {loading && !error && (
            <div className="rounded-xl border border-neutral-800 bg-black/60 px-4 py-4 text-sm text-neutral-300">
              Loading dispatch board…
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && filteredAssignments.length === 0 && (
            <div className="rounded-xl border border-neutral-800 bg-black/60 px-4 py-6 text-center text-sm text-neutral-300">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                No dispatch assignments
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                Create fleet service requests or assign units from the Fleet
                Tower to see them here.
              </p>
            </div>
          )}

          {/* Table */}
          {!loading && !error && filteredAssignments.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-1 text-xs">
                <thead className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                  <tr>
                    <th className="px-3 py-1 text-left">Driver</th>
                    <th className="px-3 py-1 text-left">Unit</th>
                    <th className="px-3 py-1 text-left">Route</th>
                    <th className="px-3 py-1 text-left">State</th>
                    <th className="px-3 py-1 text-left">Next pre-trip</th>
                    <th className="px-3 py-1 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssignments.map((a) => (
                    <tr key={a.id} className="align-middle">
                      <td className="px-3 py-1.5 text-[11px] text-neutral-100">
                        {a.driverName}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {a.unitLabel}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {a.routeLabel ?? "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <DispatchStatePill state={a.state} />
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {a.nextPreTripDue
                          ? new Date(a.nextPreTripDue).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right text-[11px]">
                        <Link
                          href={`/fleet/assets/${encodeURIComponent(a.unitId)}`}
                          className="mr-2 text-[color:var(--accent-copper)] underline-offset-4 hover:underline"
                        >
                          Open unit
                        </Link>
                        <Link
                          href={`/work-orders/create?unitId=${encodeURIComponent(
                            a.unitId,
                          )}`}
                          className="rounded-full border border-[color:var(--metal-border-soft)] bg-black/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-900"
                        >
                          New WO
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DispatchStatePill({
  state,
}: {
  state: DispatchAssignment["state"];
}) {
  const map: Record<
    DispatchAssignment["state"],
    { label: string; className: string }
  > = {
    pretrip_due: {
      label: "Pre-trip due",
      className:
        "border-amber-400/70 bg-amber-500/10 text-amber-200",
    },
    en_route: {
      label: "En route",
      className: "border-sky-400/70 bg-sky-500/10 text-sky-200",
    },
    in_shop: {
      label: "In shop",
      className:
        "border-emerald-400/70 bg-emerald-500/10 text-emerald-200",
    },
  };

  const item = map[state];

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.16em] ${item.className}`}
    >
      {item.label}
    </span>
  );
}