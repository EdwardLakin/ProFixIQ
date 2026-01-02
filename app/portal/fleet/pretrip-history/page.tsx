"use client";

import FleetShell from "app/portal/fleet/FleetShell";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const COPPER = "#C57A4A";

const shell = "space-y-5 text-white";
const glassCard =
  "rounded-2xl border border-white/12 bg-black/25 p-4 backdrop-blur-md shadow-card " +
  "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]";

const softInput =
  "w-full rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-sm text-white " +
  "placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[rgba(197,122,74,0.55)]";

const softPill =
  "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition";

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

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function Chip({
  tone,
  children,
}: {
  tone: "red" | "green" | "slate";
  children: React.ReactNode;
}) {
  const map: Record<typeof tone, string> = {
    red: "border-red-600/60 bg-red-600/10 text-red-200",
    green: "border-emerald-600/60 bg-emerald-600/10 text-emerald-200",
    slate: "border-white/10 bg-black/20 text-neutral-300",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.16em] ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export default function PortalFleetPretripHistoryPage() {
  const [reports, setReports] = useState<PretripReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<PretripStatus>("all");
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
        console.error("[PortalFleetPretripHistoryPage] fetch error:", errorFetch);
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
        const statusValue = (report.status ?? "open") as PretripStatus | string;
        if (statusValue !== statusFilter) return false;
      }

      if (defectFilter === "defects" && !report.has_defects) return false;
      if (defectFilter === "clear" && report.has_defects) return false;

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
    <FleetShell>
      <div className="px-4 py-6 text-white">
        <div className="mx-auto w-full max-w-6xl">
          {/* Portal wash */}
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(197,122,74,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
          />

          <div className={shell}>
            {/* Header */}
            <div className={glassCard}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                Fleet Portal
              </p>
              <h1 className="mt-2 text-2xl font-blackops" style={{ color: COPPER }}>
                My pre-trip history
              </h1>
              <p className="mt-1 text-sm text-neutral-400">
                View your submitted pre-trips, defects, and audit trail for your
                units.
              </p>

              {/* Search */}
              <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by unit, plate, driver, status…"
                  className={softInput}
                />
                <div className="text-[11px] text-neutral-500 md:pl-3">
                  Submissions from your mobile links show up here.
                </div>
              </div>
            </div>

            {/* Filters + table */}
            <div className={glassCard}>
              {/* Filters */}
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2">
                  {(["all", "open", "reviewed", "archived"] as const).map(
                    (statusOption) => {
                      const active = statusFilter === statusOption;
                      return (
                        <button
                          key={statusOption}
                          type="button"
                          onClick={() => setStatusFilter(statusOption)}
                          className={`${softPill} ${
                            active
                              ? "text-black shadow-[0_0_16px_rgba(197,122,74,0.55)]"
                              : "border border-white/12 bg-black/20 text-neutral-300 hover:bg-black/35"
                          }`}
                          style={active ? { backgroundColor: COPPER } : undefined}
                        >
                          {statusOption === "all"
                            ? "All"
                            : statusOption === "open"
                              ? "Open"
                              : statusOption === "reviewed"
                                ? "Reviewed"
                                : "Archived"}
                        </button>
                      );
                    },
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {(["all", "defects", "clear"] as const).map((opt) => {
                    const active = defectFilter === opt;

                    const activeStyle =
                      opt === "defects"
                        ? "bg-red-600/85 text-white shadow-[0_0_16px_rgba(239,68,68,0.35)]"
                        : opt === "clear"
                          ? "bg-emerald-600/85 text-white shadow-[0_0_16px_rgba(16,185,129,0.25)]"
                          : "bg-black/40 text-neutral-100 border border-white/12";

                    const idleStyle =
                      opt === "defects"
                        ? "border border-red-700/50 bg-red-900/10 text-red-200 hover:bg-red-900/20"
                        : opt === "clear"
                          ? "border border-emerald-700/50 bg-emerald-900/10 text-emerald-200 hover:bg-emerald-900/20"
                          : "border border-white/12 bg-black/20 text-neutral-300 hover:bg-black/35";

                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setDefectFilter(opt)}
                        className={`${softPill} ${active ? activeStyle : idleStyle}`}
                      >
                        {opt === "all"
                          ? "All"
                          : opt === "defects"
                            ? "With defects"
                            : "Clear"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Error / loading */}
              {error && (
                <div className="mb-3 rounded-xl border border-red-700/60 bg-red-900/20 px-4 py-3 text-xs text-red-200">
                  {error}
                </div>
              )}

              {loading && !error && (
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-neutral-300">
                  Loading pre-trip reports…
                </div>
              )}

              {/* Empty */}
              {!loading && !error && filteredReports.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-neutral-300">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    No pre-trip reports
                  </div>
                  <p className="mt-2 text-xs text-neutral-400">
                    Once you start submitting pre-trips, they will show up here for
                    review and audits.
                  </p>
                </div>
              )}

              {/* Table */}
              {!loading && !error && filteredReports.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-1 text-xs">
                    <thead className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Unit</th>
                        <th className="px-3 py-2 text-left">Plate</th>
                        <th className="px-3 py-2 text-left">Driver</th>
                        <th className="px-3 py-2 text-left">Defects</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReports.map((report) => {
                        const dateIso = report.inspection_date ?? report.created_at;
                        const status = titleCase(
                          (report.status ?? "open").toLowerCase(),
                        );

                        return (
                          <tr
                            key={report.id}
                            className="align-middle rounded-xl border border-white/10 bg-black/20"
                          >
                            <td className="px-3 py-2 text-[11px] text-neutral-300">
                              {new Date(dateIso).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-neutral-100">
                              {report.unit_label ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-neutral-300">
                              {report.plate ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-neutral-300">
                              {report.driver_name ?? "—"}
                            </td>
                            <td className="px-3 py-2">
                              {report.has_defects ? (
                                <Chip tone="red">Defects</Chip>
                              ) : (
                                <Chip tone="green">Clear</Chip>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Chip tone="slate">{status}</Chip>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4">
                <Link
                  href="/portal/fleet"
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-black/25 px-4 py-2 text-xs font-semibold text-neutral-100 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition hover:bg-black/35"
                >
                  Back to fleet portal
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </FleetShell>
  );
}