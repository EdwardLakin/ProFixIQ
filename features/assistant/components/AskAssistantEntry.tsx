"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { resolveMobileHref } from "@/features/mobile/navigation/mobile-route-continuity";
import { Button } from "@shared/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@shared/components/ui/dialog";
import { useAssistant } from "../hooks/useAssistant";
import { buildAssistantHref } from "../lib/buildAssistantHref";
import { buildPlannerHref } from "../lib/buildPlannerHref";
import type { AssistantContext } from "../types/assistant";
import AssistantResponseCard from "./AssistantResponseCard";

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
      return "Plan next steps";
    case "customer":
    case "vehicle":
    case "booking":
      return "Open in Planner";
    default:
      return "Open Planner";
  }
}

function getPlannerGoal(context: AssistantContext): string {
  switch (context.pageType) {
    case "work_order":
      return "Build next steps for this work order";
    case "customer":
      return "Build next steps for this customer";
    case "vehicle":
      return "Build next steps for this vehicle";
    case "booking":
      return "Build next steps for this booking";
    default:
      return "Build next operational plan";
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
  const mobileSurface = mobile || pathname.startsWith("/mobile");

  const assistantHref = useMemo(() => {
    const built = buildAssistantHref(context);
    return mobileSurface
      ? resolveMobileHref(built) ?? "/mobile/assistant"
      : built;
  }, [context, mobileSurface]);
  const plannerHref = useMemo(() => {
    const built = buildPlannerHref({
      planner: "ops",
      allowCreate: false,
      goal: getPlannerGoal(context),
      workOrderId: context.workOrderId,
      bookingId: context.bookingId,
    });
    return mobileSurface
      ? resolveMobileHref(built) ?? "/mobile/planner"
      : built;
  }, [context, mobileSurface]);

  const assistantLabel = useMemo(() => getAssistantLabel(context), [context]);
  const plannerLabel = useMemo(() => getPlannerLabel(context), [context]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const contextKey = [
    context.pageType,
    context.workOrderId,
    context.customerId,
    context.vehicleId,
    context.bookingId,
  ]
    .filter(Boolean)
    .join(":");
  const { ask, loading, data, messages, clearConversation } =
    useAssistant(contextKey);
  const transcriptMessages =
    messages.at(-1)?.role === "assistant" ? messages.slice(0, -1) : messages;
  const effectiveQuery = query.trim() || getDefaultPrompt(context);

  if (placement === "header") {
    return (
      <>
        <button
          type="button"
          title={assistantLabel}
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center justify-center rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2.5 text-xs font-medium text-[color:var(--theme-text-primary)] shadow-sm backdrop-blur-md transition hover:border-[color:var(--accent-copper-soft,#fdba74)]/60 hover:bg-[color:var(--theme-surface-panel)]"
        >
          Assistant
        </button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)]">
            <DialogHeader>
              <DialogTitle
                className="text-[color:var(--accent-copper,#c1663b)]"
                style={{
                  fontFamily:
                    "Black Ops One, var(--font-blackops), system-ui",
                }}
              >
                AI Assistant
              </DialogTitle>
              <DialogDescription>
                Ask about the current page context without opening a new tab.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              {transcriptMessages.length > 0 ? (
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                  {transcriptMessages.slice(-8).map((message, index) => (
                    <div
                      key={`${message.role}-${index}-${message.content.slice(0, 24)}`}
                      className={
                        message.role === "user"
                          ? "ml-8 rounded-xl bg-[color:var(--theme-surface-overlay)] p-3 text-sm text-[color:var(--theme-text-primary)]"
                          : "mr-8 whitespace-pre-line rounded-xl border border-[color:var(--theme-border-soft)] p-3 text-sm text-[color:var(--theme-text-secondary)]"
                      }
                    >
                      {message.content}
                    </div>
                  ))}
                </div>
              ) : null}

              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  getDefaultPrompt(context) || "Ask anything about your shop..."
                }
                className="min-h-[140px] w-full rounded-2xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] p-3 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-copper-soft,#fdba74)]"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[color:var(--theme-text-muted)]">
                  {context.pageTitle
                    ? `Context: ${context.pageTitle}`
                    : "General shop context"}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setQuery("");
                      clearConversation();
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

  const utilityLinks = (
    <>
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
    </>
  );

  if (placement === "dock") {
    return (
      <div
        className="flex flex-wrap gap-2"
        role="navigation"
        aria-label="Utility actions"
      >
        {utilityLinks}
      </div>
    );
  }

  if (mobile) {
    return (
      <div
        className="mobile-tech-utility-dock"
        role="navigation"
        aria-label="Utility actions"
      >
        {utilityLinks}
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      <Link
        href={assistantHref}
        className="rounded-full border border-orange-400/50 bg-[color:var(--theme-surface-overlay)] px-5 py-3 text-sm font-semibold text-orange-300 shadow-[var(--theme-shadow-medium)] backdrop-blur-md"
      >
        {assistantLabel}
      </Link>
      <Link
        href={plannerHref}
        className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-4 py-2 text-xs text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)] backdrop-blur-md"
      >
        {plannerLabel}
      </Link>
    </div>
  );
}
