"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";

import type { AssistantContext } from "../types/assistant";
import { buildAssistantHref } from "../lib/buildAssistantHref";
import { buildPlannerHref } from "../lib/buildPlannerHref";

type Props = {
  mobile?: boolean;
};

function deriveContextFromPath(pathname: string): AssistantContext {
  const context: AssistantContext = {};

  const workOrderMatch =
    pathname.match(/^\/work-orders\/([^/]+)$/i) ??
    pathname.match(/^\/work-orders\/([^/]+)\/quote-review$/i) ??
    pathname.match(/^\/work-orders\/([^/]+)\/approve$/i) ??
    pathname.match(/^\/work-orders\/([^/]+)\/intake$/i) ??
    pathname.match(/^\/mobile\/work-orders\/([^/]+)$/i);

  if (workOrderMatch?.[1]) {
    context.workOrderId = workOrderMatch[1];
    context.pageType = "work_order";
    context.pageTitle = "Work Order";
    return context;
  }

  const customerMatch =
    pathname.match(/^\/customers\/([^/]+)$/i) ??
    pathname.match(/^\/mobile\/customers\/([^/]+)$/i);

  if (customerMatch?.[1]) {
    context.customerId = customerMatch[1];
    context.pageType = "customer";
    context.pageTitle = "Customer";
    return context;
  }

  const bookingMatch =
    pathname.match(/^\/portal\/bookings\/([^/]+)$/i) ??
    pathname.match(/^\/dashboard\/appointments\/([^/]+)$/i);

  if (bookingMatch?.[1]) {
    context.bookingId = bookingMatch[1];
    context.pageType = "booking";
    context.pageTitle = "Booking";
    return context;
  }

  const vehicleMatch =
    pathname.match(/^\/fleet\/assets\/([^/]+)$/i) ??
    pathname.match(/^\/portal\/fleet\/units\/([^/]+)$/i);

  if (vehicleMatch?.[1]) {
    context.vehicleId = vehicleMatch[1];
    context.pageType = "vehicle";
    context.pageTitle = "Vehicle";
    return context;
  }

  if (pathname.startsWith("/dashboard")) {
    context.pageType = "dashboard";
    context.pageTitle = "Dashboard";
    return context;
  }

  if (pathname.startsWith("/mobile")) {
    context.pageType = "mobile";
    context.pageTitle = "Mobile";
    return context;
  }

  return context;
}

function getAssistantLabel(context: AssistantContext): string {
  switch (context.pageType) {
    case "work_order":
      return "Ask about this WO";
    case "customer":
      return "Ask about this customer";
    case "vehicle":
      return "Ask about this vehicle";
    case "booking":
      return "Ask about this booking";
    default:
      return "Ask Assistant";
  }
}

function getPlannerLabel(context: AssistantContext): string {
  switch (context.pageType) {
    case "work_order":
      return "Fix this WO";
    case "customer":
      return "Plan for this customer";
    case "vehicle":
      return "Plan for this vehicle";
    case "booking":
      return "Plan this booking";
    default:
      return "Open Planner";
  }
}

function getPlannerGoal(context: AssistantContext): string {
  switch (context.pageType) {
    case "work_order":
      return "Help me review and take action on this work order";
    case "customer":
      return "Help me take action for this customer";
    case "vehicle":
      return "Help me take action for this vehicle";
    case "booking":
      return "Help me review and reschedule or act on this booking";
    default:
      return "Help me take action";
  }
}

export default function AskAssistantEntry({ mobile = false }: Props) {
  const pathname = usePathname();

  const context = useMemo(() => deriveContextFromPath(pathname), [pathname]);
  const assistantHref = useMemo(() => buildAssistantHref(context), [context]);

  const plannerHref = useMemo(
    () =>
      buildPlannerHref({
        planner: "ops",
        allowCreate: false,
        goal: getPlannerGoal(context),
        workOrderId: context.workOrderId,
        bookingId: context.bookingId,
      }),
    [context],
  );

  const assistantLabel = useMemo(() => getAssistantLabel(context), [context]);
  const plannerLabel = useMemo(() => getPlannerLabel(context), [context]);

  if (mobile) {
    return (
      <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2">
        <Link
          href={assistantHref}
          className="rounded-full border border-orange-400/50 bg-black/85 px-4 py-3 text-sm font-semibold text-orange-300 shadow-[0_16px_40px_rgba(0,0,0,0.55)] backdrop-blur-md"
        >
          {assistantLabel}
        </Link>
        <Link
          href={plannerHref}
          className="rounded-full border border-white/10 bg-black/80 px-4 py-2 text-xs text-neutral-200 shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-md"
        >
          {plannerLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      <Link
        href={assistantHref}
        className="rounded-full border border-orange-400/50 bg-black/85 px-5 py-3 text-sm font-semibold text-orange-300 shadow-[0_18px_45px_rgba(0,0,0,0.6)] backdrop-blur-md"
      >
        {assistantLabel}
      </Link>
      <Link
        href={plannerHref}
        className="rounded-full border border-white/10 bg-black/80 px-4 py-2 text-xs text-neutral-200 shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-md"
      >
        {plannerLabel}
      </Link>
    </div>
  );
}
