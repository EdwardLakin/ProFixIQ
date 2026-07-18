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

  const attention = [
    ...(jobsBlocked > 0 ? [{ title: "blocked jobs", detail: "Review holds, parts and technician constraints.", href: "/mobile/work-orders", action: "Resolve", count: jobsBlocked }] : []),
    ...(techsOnShift > jobsInProgress ? [{ title: "technicians may need work", detail: "Balance assignments across the active team.", href: "/work-orders/board", action: "Dispatch", count: techsOnShift - jobsInProgress }] : []),
  ];

  return (
    <MobileDashboardPage>
      <MobileDashboardHero eyebrow="Lead-hand workspace" title={`Shop floor, ${firstName}`} subtitle="Technician capacity, active work and blockers without dashboard clutter." action={{ href: "/work-orders/board", label: "Open dispatch" }} />
      <MobileMetricGrid items={[
        { label: "Technicians on shift", value: techsOnShift, href: "/dashboard/workforce/attendance", tone: techsOnShift > 0 ? "positive" : "warning" },
        { label: "Jobs in progress", value: jobsInProgress, href: "/mobile/work-orders" },
        { label: "Blocked jobs", value: jobsBlocked, href: "/mobile/work-orders", tone: jobsBlocked > 0 ? "warning" : "default" },
        { label: "Available capacity", value: Math.max(0, techsOnShift - jobsInProgress), href: "/work-orders/board" },
      ]} />
      <MobileAttentionList subtitle="Floor conditions that need intervention." items={attention} />
      <MobileActionGrid items={[
        { title: "Dispatch board", detail: "Balance jobs and technicians.", href: "/work-orders/board" },
        { title: "Work orders", detail: "Review active and blocked jobs.", href: "/mobile/work-orders" },
        { title: "Inspections", detail: "Open inspection progress.", href: "/mobile/inspections" },
        { title: "Team chat", detail: "Coordinate with advisors and parts.", href: "/mobile/messages" },
      ]} />
    </MobileDashboardPage>
  );
}
