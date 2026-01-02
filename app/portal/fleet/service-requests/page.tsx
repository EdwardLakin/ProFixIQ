"use client";

import FleetShell from "app/portal/fleet/FleetShell";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PortalServiceRequest } from "app/api/fleet/service-requests/route";

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

type StatusFilter = "all" | "open" | "scheduled" | "completed" | "cancelled";
type SeverityFilter =
  | "all"
  | "safety"
  | "compliance"
  | "maintenance"
  | "recommend";

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function Badge({
  tone,
  children,
}: {
  tone: "copper" | "red" | "amber" | "slate";
  children: React.ReactNode;
}) {
  const map: Record<typeof tone, string> = {
    copper:
      "border-white/12 bg-black/25 text-neutral-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]",
    red: "border-red-500/40 bg-red-500/10 text-red-200",
    amber: "border-amber-400/40 bg-amber-400/10 text-amber-200",
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

function SeverityBadge({ sev }: { sev: string }) {
  const s = (sev ?? "").toLowerCase();
  if (s === "safety") return <Badge tone="red">Safety</Badge>;
  if (s === "compliance") return <Badge tone="amber">Compliance</Badge>;
  if (s === "maintenance") return <Badge tone="slate">Maintenance</Badge>;
  return <Badge tone="slate">Recommend</Badge>;
}

function StatusBadge({ st }: { st: string }) {
  const s = (st ?? "").toLowerCase();
  if (s === "open") return <Badge tone="red">Open</Badge>;
  if (s === "scheduled") return <Badge tone="amber">Scheduled</Badge>;
  if (s === "completed") return <Badge tone="slate">Completed</Badge>;
  return <Badge tone="slate">{titleCase(s || "—")}</Badge>;
}

export default function PortalFleetServiceRequestsPage() {
  const [requests, setRequests] = useState<PortalServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
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

        const body = (await res.json()) as { requests?: PortalServiceRequest[] };

        if (!cancelled) {
          setRequests(Array.isArray(body.requests) ? body.requests : []);
        }
      } catch (errorFetch) {
        // eslint-disable-next-line no-console
        console.error("[PortalFleetServiceRequestsPage] fetch error:", errorFetch);
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
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (severityFilter !== "all" && r.severity !== severityFilter) return false;

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
    <FleetShell>
      <div className="px-4 py-6 text-white">
        <div className="mx-auto w-full max-w-4xl">
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
                My service requests
              </h1>
              <p className="mt-1 text-sm text-neutral-400">
                Defects from your pre-trips become service requests and work orders
                in the shop. Track their status here.
              </p>

              {/* Search */}
              <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by unit, plate, title, status…"
                  className={softInput}
                />
                <div className="text-[11px] text-neutral-500 md:pl-3">
                  Created by the shop from your reported defects.
                </div>
              </div>
            </div>

            {/* Filters + table */}
            <div className={glassCard}>
              {/* Filters */}
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2">
                  {(
                    ["all", "open", "scheduled", "completed", "cancelled"] as const
                  ).map((st) => {
                    const active = statusFilter === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        className={`${softPill} ${
                          active
                            ? "text-black shadow-[0_0_16px_rgba(197,122,74,0.55)]"
                            : "border border-white/12 bg-black/20 text-neutral-300 hover:bg-black/35"
                        }`}
                        style={active ? { backgroundColor: COPPER } : undefined}
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
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2">
                  {(
                    ["all", "safety", "compliance", "maintenance", "recommend"] as const
                  ).map((sev) => {
                    const active = severityFilter === sev;
                    return (
                      <button
                        key={sev}
                        type="button"
                        onClick={() => setSeverityFilter(sev)}
                        className={`${softPill} ${
                          active
                            ? "bg-black/40 text-neutral-100 border border-white/12"
                            : "border border-white/12 bg-black/20 text-neutral-300 hover:bg-black/35"
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
                  Loading service requests…
                </div>
              )}

              {/* Empty */}
              {!loading && !error && filteredRequests.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-neutral-300">
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
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Unit</th>
                        <th className="px-3 py-2 text-left">Plate</th>
                        <th className="px-3 py-2 text-left">Title</th>
                        <th className="px-3 py-2 text-left">Severity</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map((r) => (
                        <tr
                          key={r.id}
                          className="align-middle rounded-xl border border-white/10 bg-black/20"
                        >
                          <td className="px-3 py-2 text-[11px] text-neutral-300">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-neutral-100">
                            {r.unitLabel ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-neutral-300">
                            {r.plate ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-neutral-300">
                            {r.title}
                          </td>
                          <td className="px-3 py-2">
                            <SeverityBadge sev={r.severity} />
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge st={r.status} />
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