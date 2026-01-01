// features/fleet/components/FleetUnitsPage.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { FleetUnitListItem } from "app/api/fleet/units/route";

type Props = {
  shopId?: string | null;
};

export default function FleetUnitsPage({ shopId }: Props) {
  const [units, setUnits] = useState<FleetUnitListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fleetFilter, setFleetFilter] = useState<string>("all");

  const card =
    "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] " +
    "bg-black/70 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl";

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/fleet/units", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId: shopId ?? null }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(
              (body && body.error) ||
                "Failed to load fleet units for this shop.",
            );
          }
          return;
        }

        const body = (await res.json()) as { units: FleetUnitListItem[] };
        if (!cancelled) {
          setUnits(Array.isArray(body.units) ? body.units : []);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[FleetUnitsPage] fetch error:", err);
        if (!cancelled) {
          setError("Failed to load fleet units.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const fleets = useMemo(() => {
    const set = new Set<string>();
    for (const u of units) {
      if (u.fleetName && u.fleetName.trim().length > 0) {
        set.add(u.fleetName.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [units]);

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return units.filter((u) => {
      if (fleetFilter !== "all") {
        if ((u.fleetName ?? "") !== fleetFilter) return false;
      }

      if (!q) return true;

      const haystack = [
        u.label,
        u.fleetName,
        u.plate,
        u.vin,
        u.location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [units, search, fleetFilter]);

  return (
    <div className="px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        {/* Copper wash */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
        />

        {/* Header */}
        <div className={card + " relative overflow-hidden px-4 py-4 md:px-6 md:py-5"}>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-10 h-24 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.22),transparent_65%)]"
          />
          <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1
                className="text-xl font-bold tracking-[0.22em] text-[rgba(248,113,22,0.9)] md:text-2xl uppercase"
                style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
              >
                Fleet Units
              </h1>
              <p className="mt-1 text-xs text-neutral-300">
                Master list of tractors, trailers, buses and other HD assets
                enrolled in fleet programs.
              </p>
            </div>

            <div className="flex flex-col gap-2 md:items-end">
              <label className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                Filter by fleet
              </label>
              <select
                value={fleetFilter}
                onChange={(e) => setFleetFilter(e.target.value)}
                className="min-w-[180px] rounded-xl border border-[color:var(--metal-border-soft,#374151)] bg-black/70 px-3 py-2 text-xs text-white"
              >
                <option value="all">All fleets</option>
                {fleets.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Search */}
          <div className="relative mt-4 flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative flex-1">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by unit, plate, VIN, location…"
                className="w-full rounded-xl border border-[color:var(--metal-border-soft,#374151)] bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[rgba(248,113,22,0.55)]"
              />
            </div>

            <div className="text-[11px] text-neutral-500 md:pl-3">
              Units shown are linked from your fleet programs and vehicle list.
            </div>
          </div>
        </div>

        {/* Content */}
        <div className={card + " px-4 py-4 md:px-6 md:py-5"}>
          {error && (
            <div className="rounded-xl border border-red-700 bg-red-900/30 px-4 py-3 text-xs text-red-200">
              {error}
            </div>
          )}

          {loading && !error && (
            <div className="rounded-xl border border-neutral-800 bg-black/60 px-4 py-4 text-sm text-neutral-300">
              Loading fleet units…
            </div>
          )}

          {!loading && !error && filteredUnits.length === 0 && (
            <div className="rounded-xl border border-neutral-800 bg-black/60 px-4 py-6 text-center text-sm text-neutral-300">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                No fleet units found
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                Add vehicles to a fleet program to see them here.
              </p>
            </div>
          )}

          {!loading && !error && filteredUnits.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-1 text-xs">
                <thead className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                  <tr>
                    <th className="px-3 py-1 text-left">Unit</th>
                    <th className="px-3 py-1 text-left">Fleet</th>
                    <th className="px-3 py-1 text-left">Plate</th>
                    <th className="px-3 py-1 text-left">VIN</th>
                    <th className="px-3 py-1 text-left">Status</th>
                    <th className="px-3 py-1 text-left">Next Inspection</th>
                    <th className="px-3 py-1 text-left">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnits.map((u) => (
                    <tr key={u.id} className="align-middle">
                      <td className="px-3 py-1.5 text-[11px] text-neutral-100">
                        {u.label}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {u.fleetName ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {u.plate ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {u.vin ? u.vin.slice(0, 11) + "…" : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <StatusPill status={u.status} />
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {u.nextInspectionDate
                          ? new Date(u.nextInspectionDate).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {u.location ?? "—"}
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

function StatusPill({
  status,
}: {
  status: "in_service" | "limited" | "oos";
}) {
  const map: Record<
    "in_service" | "limited" | "oos",
    { label: string; className: string }
  > = {
    in_service: {
      label: "In Service",
      className:
        "border-emerald-500/60 bg-emerald-500/10 text-emerald-200",
    },
    limited: {
      label: "Limited",
      className:
        "border-amber-400/60 bg-amber-500/10 text-amber-200",
    },
    oos: {
      label: "OOS",
      className: "border-red-500/60 bg-red-500/10 text-red-300",
    },
  };

  const item = map[status];

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.16em] ${item.className}`}
    >
      {item.label}
    </span>
  );
}