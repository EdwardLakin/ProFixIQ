"use client";

import type { MobileRole } from "@/features/mobile/config/mobile-tiles";
import {
  MobileActionGrid,
  MobileAttentionList,
  MobileDashboardHero,
  MobileDashboardPage,
  MobileMetricGrid,
} from "@/features/mobile/dashboard/MobileDashboardPrimitives";

type LeadHandStats = {
  techsOnShift: number;
  jobsInProgress: number;
  jobsBlocked: number;
};

type Props = {
  leadName: string;
  role: MobileRole;
  stats?: LeadHandStats;
};

export default function MobileLeadHandHome({ leadName, stats }: Props) {
  const firstName = leadName?.split(" ")[0] || "Lead";
  const { techsOnShift, jobsInProgress, jobsBlocked } = stats ?? {
    techsOnShift: 0,
    jobsInProgress: 0,
    jobsBlocked: 0,
  };

  const availableCapacity = Math.max(0, techsOnShift - jobsInProgress);
  const attention = [
    ...(jobsBlocked > 0
      ? [
          {
            title: "blocked jobs",
            detail: "Review holds, parts, and technician constraints.",
            href: "/mobile/dispatch?view=blocked",
            action: "Resolve",
            count: jobsBlocked,
          },
        ]
      : []),
    ...(availableCapacity > 0
      ? [
          {
            title: "technicians may need work",
            detail: "Balance assignments across the active team.",
            href: "/mobile/dispatch?view=unassigned",
            action: "Dispatch",
            count: availableCapacity,
          },
        ]
      : []),
  ];

  return (
    <MobileDashboardPage>
      <MobileDashboardHero
        eyebrow="Lead-hand workspace"
        title={`Shop floor, ${firstName}`}
        subtitle="Technician capacity, active work, and blockers without dashboard clutter."
        action={{ href: "/mobile/dispatch", label: "Open dispatch" }}
      />
      <MobileMetricGrid
        items={[
          {
            label: "Technicians on shift",
            value: techsOnShift,
            href: "/mobile/workforce/attendance",
            tone: techsOnShift > 0 ? "positive" : "warning",
          },
          {
            label: "Jobs in progress",
            value: jobsInProgress,
            href: "/mobile/work-orders?view=active",
          },
          {
            label: "Blocked jobs",
            value: jobsBlocked,
            href: "/mobile/dispatch?view=blocked",
            tone: jobsBlocked > 0 ? "warning" : "default",
          },
          {
            label: "Available capacity",
            value: availableCapacity,
            href: "/mobile/dispatch?view=unassigned",
          },
        ]}
      />
      <MobileAttentionList
        subtitle="Floor conditions that need intervention."
        items={attention}
      />
      <MobileActionGrid
        items={[
          {
            title: "Dispatch board",
            detail: "Balance jobs and technicians.",
            href: "/mobile/dispatch",
          },
          {
            title: "Work orders",
            detail: "Review active and blocked jobs.",
            href: "/mobile/work-orders",
          },
          {
            title: "Inspections",
            detail: "Open inspection progress.",
            href: "/mobile/inspections",
          },
          {
            title: "Team chat",
            detail: "Coordinate with advisors and parts.",
            href: "/mobile/messages",
          },
        ]}
      />
    </MobileDashboardPage>
  );
}
