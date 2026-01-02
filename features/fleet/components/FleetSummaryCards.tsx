"use client";

import { FleetUnit, FleetIssue, DispatchAssignment } from "./FleetControlTower";

type Props = {
  units: FleetUnit[];
  issues: FleetIssue[];
  assignments: DispatchAssignment[];

  /** Optional: enables click-through from "Inspections in window" */
  onClickInspectionWindow?: () => void;
  inspectionWindowActive?: boolean;
};

export default function FleetSummaryCards({
  units,
  issues,
  assignments,
  onClickInspectionWindow,
  inspectionWindowActive = false,
}: Props) {
  const oosCount = units.filter((u) => u.status === "oos").length;
  const limitedCount = units.filter((u) => u.status === "limited").length;

  // --- Inspections due in next 30 days ---
  const upcomingInspections = (() => {
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const msPerDay = 1000 * 60 * 60 * 24;

    return units.filter((u) => {
      if (!u.nextInspectionDate) return false;

      const next = new Date(u.nextInspectionDate);
      const diffDays = Math.floor(
        (next.getTime() - startOfToday.getTime()) / msPerDay,
      );

      return diffDays >= 0 && diffDays <= 30;
    }).length;
  })();

  const safetyIssues = issues.filter((i) => i.severity === "safety").length;
  const complianceIssues = issues.filter(
    (i) => i.severity === "compliance",
  ).length;

  const pretripDue = assignments.filter(
    (a) => a.state === "pretrip_due",
  ).length;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {/* Out of service */}
      <div className="metal-card rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            Out of service
          </p>
          <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.9)]" />
        </div>
        <div className="mt-3 text-3xl font-bold text-red-400">
          {oosCount}
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          Units not available for dispatch.
        </p>
      </div>

      {/* Limited use */}
      <div className="metal-card rounded-2xl p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Limited use
        </p>
        <div className="mt-3 text-3xl font-bold text-amber-300">
          {limitedCount}
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          Units with restrictions or minor issues.
        </p>
      </div>

      {/* Inspections in window (clickable) */}
      <button
        type="button"
        onClick={onClickInspectionWindow}
        disabled={!onClickInspectionWindow}
        className={`metal-card rounded-2xl p-4 text-left transition
          ${onClickInspectionWindow ? "hover:ring-2 hover:ring-sky-400/40" : ""}
          ${inspectionWindowActive ? "ring-2 ring-sky-400/60" : ""}
        `}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Inspections in window
        </p>
        <div className="mt-3 text-3xl font-bold text-sky-300">
          {upcomingInspections}
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          Units with CVIP / safety due in the next 30 days.
        </p>
      </button>

      {/* Safety & pre-trip */}
      <div className="metal-card rounded-2xl p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Safety & pre-trip
        </p>

        <div className="mt-3 flex items-baseline gap-4">
          <div>
            <div className="text-xl font-semibold text-red-300">
              {safetyIssues}
            </div>
            <div className="text-[11px] text-neutral-400">
              Open safety items
            </div>
          </div>
          <div>
            <div className="text-xl font-semibold text-amber-200">
              {complianceIssues}
            </div>
            <div className="text-[11px] text-neutral-400">
              Compliance reminders
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px] text-neutral-400">
            Drivers with a pre-trip due:
          </p>
          <span className="accent-chip px-2 py-1 text-[10px] font-semibold">
            {pretripDue} due today
          </span>
        </div>
      </div>
    </div>
  );
}