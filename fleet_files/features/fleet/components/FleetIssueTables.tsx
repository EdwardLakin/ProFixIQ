// features/fleet/components/FleetIssueTables.tsx
"use client";

import { FleetUnit, FleetIssue, DispatchAssignment } from "./FleetControlTower";
import Link from "next/link";

type Props = {
  units: FleetUnit[];
  issues: FleetIssue[];
  assignments: DispatchAssignment[];
};

export default function FleetIssueTables({
  units: _units, // reserved for future use; avoids unused-param error
  issues,
  assignments,
}: Props) {
  const openIssues = issues.filter((i) => i.status !== "completed");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* Left: Issues & service requests */}
      <section className="metal-card rounded-3xl p-4">
        <header className="flex items-center justify-between gap-3 border-b border-[color:var(--metal-border-soft)] pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Open fleet issues
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Pre-trip failures, portal requests, and inspection findings that
              still need a plan.
            </p>
          </div>
          <Link
            href="/work-orders/create"
            className="rounded-xl bg-[color:var(--accent-copper)] px-3 py-1.5 text-xs font-semibold text-black shadow-[0_0_18px_rgba(193,102,59,0.7)] hover:opacity-95"
          >
            New service request
          </Link>
        </header>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-1 text-xs">
            <thead className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
              <tr>
                <th className="px-3 py-1 text-left">Unit</th>
                <th className="px-3 py-1 text-left">Issue</th>
                <th className="px-3 py-1 text-left">Severity</th>
                <th className="px-3 py-1 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {openIssues.map((issue) => (
                <tr key={issue.id} className="align-middle">
                  <td className="px-3 py-1.5 text-[11px] text-neutral-200">
                    <Link
                      href={`/fleet/assets/${issue.unitId}`}
                      className="hover:underline"
                    >
                      {issue.unitLabel}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-[11px] text-neutral-300">
                    {issue.summary}
                  </td>
                  <td className="px-3 py-1.5">
                    <SeverityPill severity={issue.severity} />
                  </td>
                  <td className="px-3 py-1.5">
                    <StatusPill status={issue.status} />
                  </td>
                </tr>
              ))}

              {openIssues.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-[12px] text-neutral-500"
                  >
                    No open issues. Fleet is all clear.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Right: Dispatch / drivers / pre-trips */}
      <section className="metal-card rounded-3xl p-4">
        <header className="flex items-center justify-between gap-3 border-b border-[color:var(--metal-border-soft)] pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Dispatch & pre-trip
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Who is in which truck, pre-trip status, and quick links back into
              the portal.
            </p>
          </div>
          <span className="rounded-full border border-[color:var(--metal-border-soft)] bg-black/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-neutral-300">
            Syncs with portal
          </span>
        </header>

        <div className="mt-3 space-y-2 text-xs">
          {assignments.map((a) => (
            <div
              key={a.id}
              className="flex flex-col gap-2 rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[12px] font-semibold text-neutral-100">
                    {a.driverName}
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    Assigned to{" "}
                    <Link
                      href={`/fleet/assets/${a.unitId}`}
                      className="font-medium text-neutral-100 hover:underline"
                    >
                      {a.unitLabel}
                    </Link>
                  </div>
                </div>
                <DispatchStateBadge state={a.state} />
              </div>

              {a.routeLabel && (
                <div className="text-[11px] text-neutral-400">
                  Route: {a.routeLabel}
                </div>
              )}

              {a.nextPreTripDue && (
                <div className="flex items-center justify-between text-[11px] text-neutral-400">
                  <span>Next pre-trip</span>
                  <span className="accent-chip px-2 py-[2px] text-[10px]">
                    {new Date(a.nextPreTripDue).toLocaleString()}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  href={`/mobile/fleet/pretrip/${a.unitId}`}
                  className="rounded-full bg-[color:var(--accent-copper)] px-3 py-1 text-[10px] font-semibold text-black shadow-[0_0_16px_rgba(193,102,59,0.7)] hover:opacity-95"
                >
                  Send pre-trip link
                </Link>
                <Link
                  href={`/portal/fleet/units/${a.unitId}`}
                  className="rounded-full border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-1 text-[10px] font-semibold text-neutral-200 hover:bg-neutral-900/50"
                >
                  Open in fleet portal
                </Link>
              </div>
            </div>
          ))}

          {assignments.length === 0 && (
            <p className="py-4 text-center text-xs text-neutral-500">
              No active dispatch assignments yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function SeverityPill({ severity }: { severity: FleetIssue["severity"] }) {
  const map: Record<
    FleetIssue["severity"],
    { label: string; className: string }
  > = {
    safety: {
      label: "Safety",
      className:
        "border-red-500/60 bg-red-500/10 text-red-300 shadow-[0_0_14px_rgba(239,68,68,0.6)]",
    },
    compliance: {
      label: "Compliance",
      className:
        "border-amber-400/60 bg-amber-500/10 text-amber-200 shadow-[0_0_14px_rgba(251,191,36,0.55)]",
    },
    recommend: {
      label: "Recommend",
      className:
        "border-sky-400/60 bg-sky-500/10 text-sky-200 shadow-[0_0_14px_rgba(56,189,248,0.55)]",
    },
  };

  const item = map[severity];

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.16em] ${item.className}`}
    >
      {item.label}
    </span>
  );
}

function StatusPill({ status }: { status: FleetIssue["status"] }) {
  const map: Record<
    FleetIssue["status"],
    { label: string; className: string }
  > = {
    open: {
      label: "Open",
      className: "border-red-400/60 bg-red-500/10 text-red-200",
    },
    scheduled: {
      label: "Scheduled",
      className: "border-sky-400/60 bg-sky-500/10 text-sky-100",
    },
    completed: {
      label: "Completed",
      className:
        "border-emerald-500/60 bg-emerald-500/10 text-emerald-200",
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

function DispatchStateBadge({
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
      className: "bg-amber-500/15 text-amber-200 border-amber-400/70",
    },
    en_route: {
      label: "En route",
      className: "bg-sky-500/15 text-sky-100 border-sky-400/70",
    },
    in_shop: {
      label: "In shop",
      className: "bg-purple-500/15 text-purple-100 border-purple-400/70",
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