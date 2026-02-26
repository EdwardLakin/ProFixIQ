"use client";

import { useRouter } from "next/navigation";

export default function QuoteReviewPanelClient(props: {
  workOrderId: string; // can be UUID or custom_id (e.g. TO000007)
}): JSX.Element {
  const router = useRouter();

  const id = props.workOrderId;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-2 shadow-[0_18px_45px_rgba(0,0,0,0.75)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <div className="text-sm font-semibold text-white">
          Quote Review
          <span className="ml-2 text-xs font-normal text-neutral-400">
            (WO {id.slice(0, 8)}…)
          </span>
        </div>

        <button
          type="button"
          className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs text-neutral-200 hover:bg-white/5"
          onClick={() => router.push(`/work-orders/${id}`)}
          title="Close"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/30">
        <iframe
          title="Quote Review"
          // ✅ IMPORTANT: load the *work-order-scoped* quote review route,
          // not the root-level /quote-review/[id] route that expects UUID.
          src={`/work-orders/${id}/quote-review`}
          className="h-[78vh] w-full"
        />
      </div>
    </div>
  );
}