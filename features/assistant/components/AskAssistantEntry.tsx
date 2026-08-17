"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { resolveMobileHref } from "@/features/mobile/navigation/mobile-route-continuity";
import ShopAssistantConversation from "@/features/shop-assistant/components/ShopAssistantConversation";
import { useShopAssistant } from "@/features/shop-assistant/hooks/useShopAssistant";
import type { ShopAssistantContext } from "@/features/shop-assistant/types";
import { Button } from "@shared/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@shared/components/ui/dialog";
import { buildAssistantHref } from "../lib/buildAssistantHref";
import { buildPlannerHref } from "../lib/buildPlannerHref";
import { deriveAssistantContext } from "../lib/deriveAssistantContext";

type Props = {
  mobile?: boolean;
  placement?: "floating" | "header" | "dock";
};

function getAssistantLabel(context: ShopAssistantContext): string {
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

function getPlannerLabel(context: ShopAssistantContext): string {
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

function getPlannerGoal(context: ShopAssistantContext): string {
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

function getDefaultPrompt(context: ShopAssistantContext): string {
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
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const context = useMemo(
    () => deriveAssistantContext(pathname, new URLSearchParams(searchKey)),
    [pathname, searchKey],
  );
  const mobileSurface = mobile || pathname.startsWith("/mobile");

  const assistantHref = useMemo(() => {
    const built = buildAssistantHref(context);
    return mobileSurface
      ? (resolveMobileHref(built) ?? "/mobile/assistant")
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
      ? (resolveMobileHref(built) ?? "/mobile/planner")
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
    context.invoiceId,
  ]
    .filter(Boolean)
    .join(":");
  const {
    messages,
    loading,
    sending,
    actionInFlightId,
    error,
    canRetry,
    send,
    retry,
    confirmAction,
    cancelAction,
    clearConversation,
  } = useShopAssistant(contextKey, placement === "header" && open);
  const effectiveQuery = query.trim() || getDefaultPrompt(context);

  const submit = async () => {
    if (!effectiveQuery.trim() || sending) return;
    setQuery("");
    await send(effectiveQuery, context);
  };

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
                  fontFamily: "Black Ops One, var(--font-blackops), system-ui",
                }}
              >
                AI Assistant
              </DialogTitle>
              <DialogDescription>
                Ask or act across the shop with the data and permissions
                available to your role. Changes require confirmation.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <ShopAssistantConversation
                messages={messages}
                loading={loading}
                error={error}
                canRetry={canRetry}
                onRetry={() => void retry()}
                actionInFlightId={actionInFlightId}
                onConfirmAction={(actionId) => void confirmAction(actionId)}
                onCancelAction={(actionId) => void cancelAction(actionId)}
                onSubmitPrompt={(prompt) => void send(prompt, context)}
                promptDisabled={loading || sending || Boolean(actionInFlightId)}
                className="max-h-[22rem]"
              />

              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    (event.ctrlKey || event.metaKey) &&
                    event.key === "Enter"
                  ) {
                    event.preventDefault();
                    void submit();
                  }
                }}
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
                      void clearConversation(context);
                    }}
                    disabled={loading || sending || Boolean(actionInFlightId)}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void submit()}
                    isLoading={sending}
                    disabled={
                      loading ||
                      sending ||
                      Boolean(actionInFlightId) ||
                      !effectiveQuery.trim()
                    }
                  >
                    Send
                  </Button>
                </div>
              </div>

              <div className="flex justify-end">
                <Link
                  href={assistantHref}
                  onClick={() => setOpen(false)}
                  className="text-xs font-semibold text-[color:var(--accent-copper,#c1663b)] hover:underline"
                >
                  Open full assistant workspace
                </Link>
              </div>
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
