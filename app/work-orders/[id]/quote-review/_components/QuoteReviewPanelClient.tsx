"use client";

import { useRouter } from "next/navigation";
import QuoteReviewView from "features/work-orders/quote-review/QuoteReviewView";

export default function QuoteReviewPanelClient(props: {
  /** MUST be the real work_orders.id UUID */
  workOrderId: string;
  /** Optional display label like T0000007 */
  workOrderLabel?: string;
}): JSX.Element {
  const router = useRouter();

  const display = props.workOrderLabel ?? props.workOrderId.slice(0, 8);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-2 shadow-[0_18px_45px_rgba(0,0,0,0.75)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <div className="text-sm font-semibold text-white">
          Quote Review
          <span className="ml-2 text-xs font-normal text-neutral-400">
            (WO {display}…)
          </span>
        </div>

        <button
          type="button"
          className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs text-neutral-200 hover:bg-white/5"
          onClick={() => router.push(`/work-orders/${props.workOrderId}`)}
          title="Close"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/30 p-2">
        <QuoteReviewView workOrderId={props.workOrderId} embedded />
      </div>
    </div>
  );
}