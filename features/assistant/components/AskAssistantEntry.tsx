"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import type { AssistantContext } from "../types/assistant";
import { buildAssistantHref } from "../lib/buildAssistantHref";
import { buildPlannerHref } from "../lib/buildPlannerHref";
import { useAssistant } from "../hooks/useAssistant";
import AssistantResponseCard from "./AssistantResponseCard";

import { Button } from "@shared/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@shared/components/ui/dialog";

type Props = {
  mobile?: boolean;
  placement?: "floating" | "header" | "dock";
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

function getDefaultPrompt(context: AssistantContext): string {
  switch (context.pageType) {
    case "work_order":
      return "What should I do next on this work order?";
    case "customer":
      return "What should I do next for this customer?";
    case "vehicle":
      return "What should I know about this vehicle?";
    case "booking":
      return "What should I do next for this booking?";
    default:
      return "";
  }
}

export default function AskAssistantEntry({
  mobile = false,
  placement = "floating",
}: Props) {
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

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { ask, loading, data } = useAssistant();

  const effectiveQuery = query.trim() || getDefaultPrompt(context);

  if (placement === "header") {
    return (
      <>
        <button
          type="button"
          title={assistantLabel}
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-400/20 bg-slate-950/70 px-2.5 text-xs font-medium text-slate-100 shadow-sm backdrop-blur-md transition hover:border-[color:var(--accent-copper-soft,#fdba74)]/60 hover:bg-slate-900/80 hover:text-white"
        >
          <span>Assistant</span>
        </button>

        <Link
          href={plannerHref}
          title={plannerLabel}
          className="inline-flex h-8 items-center justify-center rounded-md border border-slate-400/20 bg-slate-950/70 px-2.5 text-xs font-medium text-slate-100 shadow-sm backdrop-blur-md transition hover:border-[color:var(--accent-copper-soft,#fdba74)]/60 hover:bg-slate-900/80 hover:text-white"
        >
          <span>Planner</span>
        </Link>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl border-[color:var(--metal-border-soft,#1f2937)] bg-neutral-950/95 text-white shadow-[0_24px_80px_rgba(0,0,0,0.95)]">
            <DialogHeader>
              <DialogTitle
                className="text-[color:var(--accent-copper,#c1663b)]"
                style={{ fontFamily: "Black Ops One, var(--font-blackops), system-ui" }}
              >
                AI Assistant
              </DialogTitle>
              <DialogDescription>
                Ask about the current page context without opening a new tab.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={getDefaultPrompt(context) || "Ask anything about your shop..."}
                className="min-h-[140px] w-full rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-copper-soft,#fdba74)]"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-neutral-500">
                  {context.pageTitle ? `Context: ${context.pageTitle}` : "General shop context"}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setQuery("");
                    }}
                    disabled={loading}
                  >
                    Clear
                  </Button>

                  <Button
                    type="button"
                    onClick={() => ask(effectiveQuery, context)}
                    isLoading={loading}
                    disabled={!effectiveQuery.trim()}
                  >
                    Ask Assistant
                  </Button>
                </div>
              </div>

              <AssistantResponseCard data={data} />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (mobile) {
    return (
      <div className="mobile-tech-utility-dock" role="navigation" aria-label="Utility actions">
        <Link
          href={assistantHref}
          className="mobile-tech-btn-utility inline-flex items-center rounded-full px-3 py-2 text-[0.72rem] leading-none"
        >
          {assistantLabel}
        </Link>
        <Link
          href={plannerHref}
          className="mobile-tech-btn-ghost inline-flex items-center rounded-full px-3 py-2 text-[0.7rem] leading-none"
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
