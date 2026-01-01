"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PortalServiceRequest } from "app/api/fleet/service-requests/route";

const card =
  "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] " +
  "bg-black/70 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl";

type StatusFilter =
  | "all"
  | "open"
  | "scheduled"
  | "completed"
  | "cancelled";

type SeverityFilter =
  | "all"
  | "safety"
  | "compliance"
  | "maintenance"
  | "recommend";

export default function PortalFleetServiceRequestsPage() {
  const [requests, setRequests] = useState<PortalServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [severityFilter, setSeverityFilter] =
    useState<SeverityFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/fleet/service-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId: null }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(
              (body && (body.error as string)) ||
                "Failed to load service requests.",
            );
          }
          return;
        }

        const body = (await res.json()) as {
          requests?: PortalServiceRequest[];
        };

        if (!cancelled) {
          setRequests(Array.isArray(body.requests) ? body.requests : []);
        }
      } catch (errorFetch) {
        // eslint-disable-next-line no-console
        console.error(
          "[PortalFleetServiceRequestsPage] fetch error:",
          errorFetch,
        );
        if (!cancelled) setError("Failed to load service requests.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();

    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) {
        return false;
      }

      if (severityFilter !== "all" && r.severity !== severityFilter) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        r.title,
        r.summary,
        r.unitLabel,
        r.plate,
        r.status,
        r.severity,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [requests, statusFilter, severityFilter, search]);

  return (
    <div className="px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-4xl space-y-5">
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
          <div className="relative space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Fleet Portal
            </p>
            <h1
              className="text-2xl text-neutral-100 md:text-3xl"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              My service requests
            </h1>
            <p className="text-xs text-neutral-400">
              Defects from your pre-trips become service requests and work
              orders in the shop. Track their status here.
            </p>
          </div>

          {/* Search */}
          <div className="relative mt-4 flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative flex-1">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by unit, plate, title, status…"
                className="w-full rounded-xl border border-[color:var(--metal-border-soft,#374151)] bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[rgba(248,113,22,0.55)]"
              />
            </div>
            <div className="text-[11px] text-neutral-500 md:pl-3">
              Service requests are created by the shop from your reported
              defects.
            </div>
          </div>
        </div>

        {/* Filters + table */}
        <div className={card + " px-4 py-4 md:px-6 md:py-5"}>
          {/* Filters */}
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2 text-[11px]">
              {(["all", "open", "scheduled", "completed", "cancelled"] as const)
                .map((st) => (
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
                      : st === "scheduled"
                      ? "Scheduled"
                      : st === "completed"
                      ? "Completed"
                      : "Cancelled"}
                  </button>
                ))}
            </div>

            <div className="flex flex-wrap gap-2 text-[11px]">
              {(["all", "safety", "compliance", "maintenance", "recommend"] as const)
                .map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverityFilter(sev)}
                    className={`rounded-full px-3 py-1.5 font-semibold uppercase tracking-[0.16em] transition ${
                      severityFilter === sev
                        ? "bg-neutral-800 text-neutral-100"
                        : "border border-neutral-700 bg-black/60 text-neutral-300 hover:bg-neutral-900"
                    }`}
                  >
                    {sev === "all"
                      ? "All"
                      : sev === "safety"
                      ? "Safety"
                      : sev === "compliance"
                      ? "Compliance"
                      : sev === "maintenance"
                      ? "Maintenance"
                      : "Recommend"}
                  </button>
                ))}
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
              Loading service requests…
            </div>
          )}

          {/* Empty */}
          {!loading && !error && filteredRequests.length === 0 && (
            <div className="rounded-xl border border-neutral-800 bg-black/60 px-4 py-6 text-center text-sm text-neutral-300">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                No service requests yet
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                When the shop converts your pre-trip defects into work, those
                items will appear here.
              </p>
            </div>
          )}

          {/* Table */}
          {!loading && !error && filteredRequests.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-1 text-xs">
                <thead className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                  <tr>
                    <th className="px-3 py-1 text-left">Date</th>
                    <th className="px-3 py-1 text-left">Unit</th>
                    <th className="px-3 py-1 text-left">Plate</th>
                    <th className="px-3 py-1 text-left">Title</th>
                    <th className="px-3 py-1 text-left">Severity</th>
                    <th className="px-3 py-1 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((r) => (
                    <tr key={r.id} className="align-middle">
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-100">
                        {r.unitLabel ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {r.plate ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {r.title}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {r.severity
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (char) => char.toUpperCase())}
                      </td>
                      <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                        {r.status
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
