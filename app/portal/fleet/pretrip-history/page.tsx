"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const card =
  "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] " +
  "bg-black/70 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl";

type PretripStatus = "open" | "reviewed" | "archived" | "all";

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

export default function PortalFleetPretripHistoryPage() {
  const [reports, setReports] = useState<PretripReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] =
    useState<PretripStatus>("all");
  const [defectFilter, setDefectFilter] = useState<
    "all" | "defects" | "clear"
  >("all");
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
          body: JSON.stringify({ shopId: null }),
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

        const body = (await res.json()) as { reports?: PretripReport[] };
        if (!cancelled) {
          setReports(Array.isArray(body.reports) ? body.reports : []);
        }
      } catch (errorFetch) {
        // eslint-disable-next-line no-console
        console.error(
          "[PortalFleetPretripHistoryPage] fetch error:",
          errorFetch,
        );
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

    return reports.filter((report) => {
      if (statusFilter !== "all") {
        const statusValue =
          (report.status ?? "open") as PretripStatus | string;
        if (statusValue !== statusFilter) {
          return false;
        }
      }

      if (defectFilter === "defects" && !report.has_defects) {
        return false;
      }
      if (defectFilter === "clear" && report.has_defects) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        report.unit_label,
        report.plate,
        report.driver_name,
        report.status,
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
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                Fleet Portal
              </p>
              <h1
                className="mt-1 text-2xl text-neutral-100 md:text-3xl"
                style={{ fontFamily: "var(--font-blackops)" }}
              >
                My pre-trip history
              </h1>
              <p className="mt-1 text-xs text-neutral-400">
                View your submitted pre-trips, defects, and audit trail for
                your units.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px] text-neutral-400">
              <span className="rounded-full border border-neutral-700 bg-black/50 px-3 py-1 uppercase tracking-[0.16em]">
                Fleet
              </span>
              <span className="rounded-full border border-neutral-700 bg-black/50 px-3 py-1 uppercase tracking-[0.16em]">
                Pre-trips
              </span>
            </div>
          </div>

          {/* Search */}
          <div className="relative mt-4 flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative flex-1">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by unit, plate, driver, status…"
                className="w-full rounded-xl border border-[color:var(--metal-border-soft,#374151)] bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[rgba(248,113,22,0.55)]"
              />
            </div>

            <div className="text-[11px] text-neutral-500 md:pl-3">
              Pre-trips submitted from your mobile links show up here for
              history.
            </div>
          </div>
        </div>

        {/* Filters + table */}
        <div className={card + " px-4 py-4 md:px-6 md:py-5"}>
          {/* Filters */}
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2 text-[11px]">
              {(["all", "open", "reviewed", "archived"] as const).map(
                (statusOption) => (
                  <button
                    key={statusOption}
                    type="button"
                    onClick={() => setStatusFilter(statusOption)}
                    className={`rounded-full px-3 py-1.5 font-semibold uppercase tracking-[0.16em] transition ${
                      statusFilter === statusOption
                        ? "bg-[color:var(--accent-copper)] text-black shadow-[0_0_16px_rgba(193,102,59,0.7)]"
                        : "border border-neutral-700 bg-black/60 text-neutral-300 hover:bg-neutral-900"
                    }`}
                  >
                    {statusOption === "all"
                      ? "All"
                      : statusOption === "open"
                      ? "Open"
                      : statusOption === "reviewed"
                      ? "Reviewed"
                      : "Archived"}
                  </button>
                ),
              )}
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
                Once you start submitting pre-trips, they will show up here
                for review and audits.
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
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map((report) => (
                    <tr key={report.id} className="align-middle">
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {report.inspection_date
                          ? new Date(
                              report.inspection_date,
                            ).toLocaleDateString()
                          : new Date(
                              report.created_at,
                            ).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-100">
                        {report.unit_label ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {report.plate ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {report.driver_name ?? "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        {report.has_defects ? (
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
                        {(report.status ?? "open")
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (char) => char.toUpperCase())}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4">
            <Link
              href="/portal/fleet"
              className="inline-flex rounded-xl border border-[color:var(--metal-border-soft)] bg-black/70 px-4 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900/70"
            >
              Back to fleet portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
