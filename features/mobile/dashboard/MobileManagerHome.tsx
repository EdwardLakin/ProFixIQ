"use client";

import type { MobileRole } from "@/features/mobile/config/mobile-tiles";
import {
  MobileActionGrid,
  MobileAttentionList,
  MobileDashboardHero,
  MobileDashboardPage,
  MobileMetricGrid,
} from "@/features/mobile/dashboard/MobileDashboardPrimitives";

type ManagerStats = {
  activeWos: number;
  waiters: number;
  techniciansOnShift: number;
  todayBilled?: string | null;
};

type Props = {
  managerName: string;
  role: MobileRole;
  stats?: ManagerStats;
};

const ROLE_COPY: Partial<Record<MobileRole, { eyebrow: string; subtitle: string; primary: string }>> = {
  owner: { eyebrow: "Owner overview", subtitle: "Shop health, staffing and operational exceptions.", primary: "Review shop priorities" },
  admin: { eyebrow: "Admin workspace", subtitle: "Attendance, workload and issues requiring action.", primary: "Review attendance" },
  manager: { eyebrow: "Manager workspace", subtitle: "Work flow, customer waiters and technician coverage.", primary: "Open dispatch" },
  foreman: { eyebrow: "Foreman workspace", subtitle: "Technician loading, blockers and work in motion.", primary: "Open dispatch" },
};

export default function MobileManagerHome({ managerName, role, stats }: Props) {
  const firstName = managerName?.split(" ")[0] || "Manager";
  const { activeWos, waiters, techniciansOnShift, todayBilled } = stats ?? {
    activeWos: 0,
    waiters: 0,
    techniciansOnShift: 0,
    todayBilled: null,
  };
  const copy = ROLE_COPY[role] ?? ROLE_COPY.manager!;
  const primaryHref = role === "admin" ? "/dashboard/workforce/attendance" : "/work-orders/board";

  const attention = [
    ...(waiters > 0 ? [{ title: "customers waiting", detail: "Front-counter work needs immediate follow-up.", href: "/mobile/work-orders", action: "Review", count: waiters }] : []),
    ...(techniciansOnShift === 0 ? [{ title: "No technicians clocked in", detail: "Confirm attendance before assigning work.", href: "/dashboard/workforce/attendance", action: "Attendance" }] : []),
    ...(activeWos > 0 ? [{ title: "active work orders", detail: "Review flow and identify blocked work.", href: "/mobile/work-orders", action: "Open", count: activeWos }] : []),
  ];

  return (
    <MobileDashboardPage>
      <MobileDashboardHero eyebrow={copy.eyebrow} title={`Shop overview, ${firstName}`} subtitle={copy.subtitle} action={{ href: primaryHref, label: copy.primary }} />
      <MobileMetricGrid items={[
        { label: "Active work orders", value: activeWos, href: "/mobile/work-orders" },
        { label: "Customers waiting", value: waiters, href: "/mobile/work-orders", tone: waiters > 0 ? "warning" : "default" },
        { label: "Technicians on shift", value: techniciansOnShift, href: "/dashboard/workforce/attendance", tone: techniciansOnShift > 0 ? "positive" : "warning" },
        { label: "Today billed", value: todayBilled ?? "—", href: "/mobile/reports" },
      ]} />
      <MobileAttentionList subtitle="Only the items most likely to slow the shop down." items={attention} />
      <MobileActionGrid items={[
        { title: "Work order board", detail: "Review live work and status flow.", href: "/work-orders/board" },
        { title: "Attendance", detail: "See who is clocked in and active.", href: "/dashboard/workforce/attendance" },
        { title: "Appointments", detail: "Review today’s arrivals.", href: "/mobile/appointments" },
        { title: "Reports", detail: "Open revenue and efficiency views.", href: "/mobile/reports" },
      ]} />
    </MobileDashboardPage>
  );
}
