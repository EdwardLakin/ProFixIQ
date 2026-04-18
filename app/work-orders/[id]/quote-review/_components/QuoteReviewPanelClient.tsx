//app/work-orders/[id]/quote-review/_components/QuoteReviewPanelClient.tsx

"use client";

import { useRouter } from "next/navigation";
import QuoteReviewView from "@/features/work-orders/quote-review/QuoteReviewView";
import { PANEL_VARIANTS } from "@/features/shared/components/ui/panelHierarchy";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";
import { cn } from "@shared/lib/utils";

export default function QuoteReviewPanelClient(props: {
  workOrderId: string; // UUID
  workOrderLabel?: string; // T0000007
}): JSX.Element {
  const router = useRouter();

  return (
    <div className={cn(PANEL_VARIANTS.secondary, "flex h-full min-h-0 flex-col rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-2")}>
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          Quote Review
          <StatusBadge variant="info">
            (WO {props.workOrderLabel ?? props.workOrderId.slice(0, 8)}…)
          </StatusBadge>
        </div>

        <button
          type="button"
          className="rounded-md border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-2 py-1 text-xs text-neutral-200 hover:bg-white/5"
          onClick={() =>
            router.push(`/work-orders/${props.workOrderLabel ?? props.workOrderId}`)
          }
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* ✅ THIS is the key: allow scrolling in the panel */}
      <div className={cn(PANEL_VARIANTS.passive, "mt-2 min-h-0 flex-1 overflow-auto rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]")}>
        <div className="p-2">
          <QuoteReviewView workOrderId={props.workOrderId} embedded />
        </div>
      </div>
    </div>
  );
}
