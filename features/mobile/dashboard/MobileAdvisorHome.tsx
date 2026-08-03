"use client";

import type { MobileRole } from "@/features/mobile/config/mobile-tiles";
import {
  MobileActionGrid,
  MobileAttentionList,
  MobileDashboardHero,
  MobileDashboardPage,
  MobileMetricGrid,
} from "@/features/mobile/dashboard/MobileDashboardPrimitives";

type AdvisorStats = {
  awaitingApprovals: number;
  waiters: number;
  callbacks: number;
};

type Props = {
  advisorName: string;
  role: MobileRole;
  stats?: AdvisorStats;
};

export default function MobileAdvisorHome({ advisorName, stats }: Props) {
  const firstName = advisorName?.split(" ")[0] || "Advisor";
  const { awaitingApprovals, waiters: activeWos, callbacks: todaysAppts } = stats ?? {
    awaitingApprovals: 0,
    waiters: 0,
    callbacks: 0,
  };

  const attention = [
    ...(awaitingApprovals > 0 ? [{ title: "approvals waiting", detail: "Quotes need customer or shop approval.", href: "/mobile/work-orders", action: "Review", count: awaitingApprovals }] : []),
    ...(activeWos > 0 ? [{ title: "active work orders", detail: "Keep customers updated and work moving.", href: "/mobile/work-orders", action: "Open", count: activeWos }] : []),
  ];

  return (
    <MobileDashboardPage>
      <MobileDashboardHero eyebrow="Advisor workspace" title={`Good day, ${firstName}`} subtitle="Customer communication, approvals and today’s arrivals in one place." action={{ href: "/mobile/work-orders/create", label: "+ Create work order" }} />
      <MobileMetricGrid items={[
        { label: "Awaiting approval", value: awaitingApprovals, href: "/mobile/work-orders", tone: awaitingApprovals > 0 ? "warning" : "default" },
        { label: "Active work orders", value: activeWos, href: "/mobile/work-orders" },
        { label: "Appointments today", value: todaysAppts, href: "/mobile/appointments", tone: "positive" },
        { label: "Customers waiting", value: activeWos, href: "/mobile/work-orders" },
      ]} />
      <MobileAttentionList subtitle="The highest-priority customer-facing work." items={attention} />
      <MobileActionGrid items={[
        { title: "Appointments", detail: "Review arrivals and add bookings.", href: "/mobile/appointments" },
        { title: "Work orders", detail: "Open the live work-order queue.", href: "/mobile/work-orders" },
        { title: "Inspections", detail: "Review inspection progress.", href: "/mobile/inspections" },
        { title: "Import customer form", detail: "Photograph a customer checklist for a reusable template.", href: "/mobile/inspections/import" },
        { title: "Team chat", detail: "Coordinate with the shop.", href: "/mobile/messages" },
      ]} />
    </MobileDashboardPage>
  );
}
