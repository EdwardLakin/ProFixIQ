"use client";

import {
  MobileActionGrid,
  MobileAttentionList,
  MobileDashboardHero,
  MobileDashboardPage,
  MobileMetricGrid,
} from "@/features/mobile/dashboard/MobileDashboardPrimitives";
import type { MobileRole } from "@/features/mobile/config/mobile-tiles";

type Props = {
  name: string;
  role: Extract<MobileRole, "parts" | "dispatcher" | "fleet_manager" | "driver">;
};

type RoleConfig = {
  eyebrow: string;
  title: (firstName: string) => string;
  subtitle: string;
  action: { href: string; label: string };
  metrics: Array<{ label: string; value: string; href: string; tone?: "default" | "positive" | "warning" }>;
  attention: Array<{ title: string; detail: string; href: string; action: string }>;
  actions: Array<{ title: string; detail: string; href: string }>;
};

const CONFIG: Record<Props["role"], RoleConfig> = {
  parts: {
    eyebrow: "Parts desk",
    title: (name) => `Keep parts moving, ${name}`,
    subtitle: "Quote, order, receive, and release parts without losing the work-order context.",
    action: { href: "/parts/requests", label: "Review new requests" },
    metrics: [
      { label: "New requests", value: "Open", href: "/parts/requests", tone: "warning" },
      { label: "Awaiting quote", value: "Review", href: "/parts/requests" },
      { label: "On order", value: "Track", href: "/parts/orders" },
      { label: "Ready for tech", value: "Release", href: "/parts/requests", tone: "positive" },
    ],
    attention: [
      { title: "Requests needing a quote", detail: "Prioritize unquoted parts before they block approvals.", href: "/parts/requests", action: "Review" },
      { title: "Orders needing follow-up", detail: "Confirm ETA changes and backorders.", href: "/parts/orders", action: "Track" },
      { title: "Received parts not released", detail: "Notify the assigned technician and update the request.", href: "/parts/requests", action: "Release" },
    ],
    actions: [
      { title: "Parts requests", detail: "Open the live request board.", href: "/parts/requests" },
      { title: "Orders", detail: "Track ordered and partially received parts.", href: "/parts/orders" },
      { title: "Work orders", detail: "Review the repair context.", href: "/mobile/work-orders" },
      { title: "Team chat", detail: "Coordinate with advisors and technicians.", href: "/mobile/messages" },
    ],
  },
  dispatcher: {
    eyebrow: "Dispatch",
    title: (name) => `Balance today’s work, ${name}`,
    subtitle: "Keep technician assignments, bays, and incoming work aligned.",
    action: { href: "/work-orders/board", label: "Open dispatch board" },
    metrics: [
      { label: "Unassigned", value: "Review", href: "/work-orders/board", tone: "warning" },
      { label: "In progress", value: "Live", href: "/work-orders/board", tone: "positive" },
      { label: "Blocked", value: "Resolve", href: "/work-orders/board", tone: "warning" },
      { label: "Appointments", value: "Today", href: "/mobile/appointments" },
    ],
    attention: [
      { title: "Unassigned work", detail: "Match ready jobs to available technicians.", href: "/work-orders/board", action: "Assign" },
      { title: "Stalled jobs", detail: "Review jobs that are active without recent progress.", href: "/work-orders/board", action: "Review" },
      { title: "Incoming appointments", detail: "Prepare the next arrivals and bay plan.", href: "/mobile/appointments", action: "Plan" },
    ],
    actions: [
      { title: "Dispatch board", detail: "Balance technicians and bays.", href: "/work-orders/board" },
      { title: "Appointments", detail: "Review today’s arrivals.", href: "/mobile/appointments" },
      { title: "Work orders", detail: "Open active repair orders.", href: "/mobile/work-orders" },
      { title: "Team chat", detail: "Coordinate shop-floor changes.", href: "/mobile/messages" },
    ],
  },
  fleet_manager: {
    eyebrow: "Fleet operations",
    title: (name) => `Fleet status, ${name}`,
    subtitle: "Monitor units, service requests, and maintenance work from one mobile view.",
    action: { href: "/mobile/fleet", label: "Open fleet" },
    metrics: [
      { label: "Units", value: "Fleet", href: "/mobile/fleet" },
      { label: "Service requests", value: "Open", href: "/mobile/fleet/service-requests", tone: "warning" },
      { label: "In service", value: "Track", href: "/mobile/work-orders" },
      { label: "Ready", value: "Review", href: "/mobile/fleet", tone: "positive" },
    ],
    attention: [
      { title: "Open service requests", detail: "Review new driver and fleet-reported concerns.", href: "/mobile/fleet/service-requests", action: "Review" },
      { title: "Units currently in service", detail: "Check status, approvals, and expected completion.", href: "/mobile/work-orders", action: "Track" },
      { title: "Upcoming maintenance", detail: "Prepare units that are nearing scheduled service.", href: "/mobile/fleet", action: "Plan" },
    ],
    actions: [
      { title: "Fleet overview", detail: "Review units and service state.", href: "/mobile/fleet" },
      { title: "Service requests", detail: "Manage reported fleet issues.", href: "/mobile/fleet/service-requests" },
      { title: "Work orders", detail: "Track units currently in the shop.", href: "/mobile/work-orders" },
      { title: "Messages", detail: "Coordinate with drivers and the shop.", href: "/mobile/messages" },
    ],
  },
  driver: {
    eyebrow: "Driver workspace",
    title: (name) => `Ready for the road, ${name}`,
    subtitle: "Complete inspections and report service issues from your phone.",
    action: { href: "/mobile/fleet/pretrip", label: "Start pre-trip inspection" },
    metrics: [
      { label: "Pre-trip", value: "Start", href: "/mobile/fleet/pretrip", tone: "positive" },
      { label: "Reported issues", value: "View", href: "/mobile/fleet/service-requests" },
      { label: "Vehicle status", value: "Check", href: "/mobile/fleet" },
      { label: "Messages", value: "Open", href: "/mobile/messages" },
    ],
    attention: [
      { title: "Complete today’s pre-trip", detail: "Record the vehicle condition before departure.", href: "/mobile/fleet/pretrip", action: "Start" },
      { title: "Report a service issue", detail: "Send the concern and vehicle context to the fleet team.", href: "/mobile/fleet/service-requests", action: "Report" },
    ],
    actions: [
      { title: "Pre-trip inspection", detail: "Complete the daily vehicle check.", href: "/mobile/fleet/pretrip" },
      { title: "Service requests", detail: "Report or review vehicle concerns.", href: "/mobile/fleet/service-requests" },
      { title: "Fleet", detail: "Check assigned vehicle information.", href: "/mobile/fleet" },
      { title: "Messages", detail: "Contact dispatch or fleet management.", href: "/mobile/messages" },
    ],
  },
};

export default function MobileOperationalRoleHome({ name, role }: Props) {
  const firstName = name.trim().split(/\s+/)[0] || "there";
  const config = CONFIG[role];

  return (
    <MobileDashboardPage>
      <MobileDashboardHero
        eyebrow={config.eyebrow}
        title={config.title(firstName)}
        subtitle={config.subtitle}
        action={config.action}
      />
      <MobileMetricGrid items={config.metrics} />
      <MobileAttentionList subtitle="Highest-priority work for this role" items={config.attention} />
      <MobileActionGrid items={config.actions} />
    </MobileDashboardPage>
  );
}
