//app/work-orders/[id]/quote-review/_components/QuoteReviewPanelClient.tsx

"use client";

import { useRouter } from "next/navigation";
import QuoteReviewView from "@/features/work-orders/quote-review/QuoteReviewView";
import { useActiveBrand } from "@/features/branding/hooks/useActiveBrand";

export default function QuoteReviewPanelClient(props: {
  workOrderId: string; // UUID
  workOrderLabel?: string; // T0000007
}): JSX.Element {
  const router = useRouter();
  const { data: brand } = useActiveBrand();

  return (
    <div
      className="flex h-full min-h-0 flex-col rounded-2xl border border-white/10 p-2 shadow-[0_18px_45px_rgba(0,0,0,0.75)] backdrop-blur-xl"
      style={{
        background:
          "radial-gradient(circle at top, color-mix(in srgb, var(--brand-primary, #C57A4A) 10%, transparent), transparent 45%), linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0.35))",
      }}
    >
      <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/25 px-2 py-2">
        <div className="text-sm font-semibold text-white">
          <span style={{ color: brand?.profile?.primary_color ?? "var(--brand-primary, #C57A4A)" }}>
            Quote Review
          </span>
          <span className="ml-2 text-xs font-normal text-neutral-400">
            (WO {props.workOrderLabel ?? props.workOrderId.slice(0, 8)}…)
          </span>
        </div>

        <button
          type="button"
          className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs text-neutral-200 hover:bg-white/5"
          onClick={() =>
            router.push(`/work-orders/${props.workOrderLabel ?? props.workOrderId}`)
          }
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* ✅ THIS is the key: allow scrolling in the panel */}
      <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-xl border border-white/10 bg-black/30">
        <div className="p-2">
          <QuoteReviewView workOrderId={props.workOrderId} embedded />
        </div>
      </div>
    </div>
  );
}