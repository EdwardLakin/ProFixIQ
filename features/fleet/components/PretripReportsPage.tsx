// features/fleet/components/PretripReportsPage.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const card =
  "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] " +
  "bg-black/70 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl";

type PretripStatus = "open" | "reviewed" | "archived" | "all";

/**
 * Mirror the likely DB / API shape (snake_case from Supabase):
 * public.fleet_pretrip_reports
 */
type PretripReport = {
  id: string;
  shop_id: string | null;
  unit_id: string | null;
  unit_label: string | null;
  plate: string | null;
  driver_name: string | null;
  has_defects: boolean | null;
  inspection_date: string | null;
  created_at: string;
  status: string | null;
};

export default function PretripReportsPage() {
  const [reports, setReports] = useState<PretripReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<PretripStatus>("open");
  const [defectFilter, setDefectFilter] = useState<"all" | "defects" | "clear">(
    "all",
  );
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/fleet/pretrip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId: null }), // server infers from auth
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(
              (body && (body.error as string)) ||
                "Failed to load pre-trip reports.",
            );
          }
          return;
        }

        const body = (await res.json()) as { reports: PretripReport[] };

        if (!cancelled) {
          setReports(Array.isArray(body.reports) ? body.reports : []);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[PretripReportsPage] fetch error:", err);
        if (!cancelled) setError("Failed to load pre-trip reports.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();

    return reports.filter((r) => {
      if (statusFilter !== "all") {
        const s = (r.status ?? "open") as PretripStatus | string;
        if (s !== statusFilter) return false;
      }

      if (defectFilter === "defects" && !r.has_defects) return false;
      if (defectFilter === "clear" && r.has_defects) return false;

      if (!q) return true;

      const haystack = [
        r.unit_label,
        r.plate,
        r.driver_name,
        r.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [reports, statusFilter, defectFilter, search]);

  return (
    <div className="px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        {/* Copper wash */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
        />

        {/* Header */}
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
                style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
              >
                Pre-trip Reports
              </h1>
              <p className="mt-1 text-xs text-neutral-300">
                View and audit daily DVIR / pre-trip reports coming in from
                drivers.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px] text-neutral-400">
              <span className="rounded-full border border-neutral-700 bg-black/50 px-3 py-1 uppercase tracking-[0.16em]">
                Fleet
              </span>
              <span className="rounded-full border border-neutral-700 bg-black/50 px-3 py-1 uppercase tracking-[0.16em]">
                Inspections
              </span>
            </div>
          </div>

          {/* Search + helper text */}
          <div className="relative mt-4 flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative flex-1">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by unit, plate, driver, status…"
                className="w-full rounded-xl border border-[color:var(--metal-border-soft,#374151)] bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[rgba(248,113,22,0.55)]"
              />
            </div>

            <div className="text-[11px] text-neutral-500 md:pl-3">
              Drivers submit pre-trips from the{" "}
              <Link
                href="/mobile/fleet/pretrip"
                className="underline decoration-dotted underline-offset-4"
              >
                mobile pre-trip screen
              </Link>
              .
            </div>
          </div>
        </div>

        {/* Filters + table */}
        <div className={card + " px-4 py-4 md:px-6 md:py-5"}>
          {/* Filter row */}
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2 text-[11px]">
              {(["all", "open", "reviewed", "archived"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-full px-3 py-1.5 font-semibold uppercase tracking-[0.16em] transition ${
                    statusFilter === st
                      ? "bg-[color:var(--accent-copper)] text-black shadow-[0_0_16px_rgba(193,102,59,0.7)]"
                      : "border border-neutral-700 bg-black/60 text-neutral-300 hover:bg-neutral-900"
                  }`}
                >
                  {st === "all"
                    ? "All"
                    : st === "open"
                      ? "Open"
                      : st === "reviewed"
                        ? "Reviewed"
                        : "Archived"}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setDefectFilter("all")}
                className={`rounded-full px-3 py-1.5 font-semibold uppercase tracking-[0.16em] transition ${
                  defectFilter === "all"
                    ? "bg-neutral-800 text-neutral-100"
                    : "border border-neutral-700 bg-black/60 text-neutral-300 hover:bg-neutral-900"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setDefectFilter("defects")}
                className={`rounded-full px-3 py-1.5 font-semibold uppercase tracking-[0.16em] transition ${
                  defectFilter === "defects"
                    ? "bg-red-600/80 text-white"
                    : "border border-red-700/60 bg-red-900/20 text-red-200 hover:bg-red-900/40"
                }`}
              >
                With defects
              </button>
              <button
                type="button"
                onClick={() => setDefectFilter("clear")}
                className={`rounded-full px-3 py-1.5 font-semibold uppercase tracking-[0.16em] transition ${
                  defectFilter === "clear"
                    ? "bg-emerald-600/80 text-white"
                    : "border border-emerald-700/60 bg-emerald-900/20 text-emerald-200 hover:bg-emerald-900/40"
                }`}
              >
                Clear
              </button>
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
              Loading pre-trip reports…
            </div>
          )}

          {/* Empty */}
          {!loading && !error && filteredReports.length === 0 && (
            <div className="rounded-xl border border-neutral-800 bg-black/60 px-4 py-6 text-center text-sm text-neutral-300">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                No pre-trip reports
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                Once drivers start submitting pre-trips from mobile, they will
                show up here for review.
              </p>
            </div>
          )}

          {/* Table */}
          {!loading && !error && filteredReports.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-1 text-xs">
                <thead className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                  <tr>
                    <th className="px-3 py-1 text-left">Date</th>
                    <th className="px-3 py-1 text-left">Unit</th>
                    <th className="px-3 py-1 text-left">Plate</th>
                    <th className="px-3 py-1 text-left">Driver</th>
                    <th className="px-3 py-1 text-left">Defects</th>
                    <th className="px-3 py-1 text-left">Status</th>
                    <th className="px-3 py-1 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map((r) => (
                    <tr key={r.id} className="align-middle">
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {r.inspection_date
                          ? new Date(r.inspection_date).toLocaleDateString()
                          : new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-100">
                        {r.unit_label ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {r.plate ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {r.driver_name ?? "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        {r.has_defects ? (
                          <span className="rounded-full border border-red-600/70 bg-red-600/15 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.16em] text-red-200">
                            Defects
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-600/70 bg-emerald-600/15 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                            Clear
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {(r.status ?? "open")
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())}
                      </td>
                      <td className="px-3 py-1.5 text-right text-[11px]">
                        {r.unit_id && (
                          <Link
                            href={`/fleet/assets/${encodeURIComponent(
                              r.unit_id,
                            )}`}
                            className="mr-2 text-[color:var(--accent-copper)] underline-offset-4 hover:underline"
                          >
                            Open unit
                          </Link>
                        )}

                        <Link
                          href={`/fleet/service-requests?pretripId=${encodeURIComponent(
                            r.id,
                          )}`}
                          className="rounded-full border border-[color:var(--metal-border-soft)] bg-black/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-900"
                        >
                          New request
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