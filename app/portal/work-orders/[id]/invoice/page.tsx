//app/portal/work-orders/[id]/invoice/page.tsx

import Link from "next/link";

const COPPER = "#C57A4A";

type Params = {
  id: string;
};

export default function PortalInvoicePage({ params }: { params: Params }) {
  const workOrderId = params.id;

  return (
    <div
      className="
        min-h-screen px-4 text-foreground
        bg-background
        bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]
      "
    >
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center py-8">
        <div
          className="
            w-full rounded-3xl border
            border-[color:var(--metal-border-soft,#1f2937)]
            bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_82%)]
            shadow-[0_32px_80px_rgba(0,0,0,0.95)]
            px-6 py-7 sm:px-8 sm:py-9
          "
        >
          {/* Top bar: back + badge */}
          <div className="mb-5 flex items-center justify-between">
            <Link
              href="/portal"
              className="
                inline-flex items-center gap-2 rounded-full border
                border-[color:var(--metal-border-soft,#1f2937)]
                bg-black/60 px-3 py-1.5 text-[11px]
                uppercase tracking-[0.2em] text-neutral-200
                hover:bg-black/70 hover:text-white
              "
            >
              <span aria-hidden className="text-base leading-none">←</span>
              Back
            </Link>

            <div className="text-[10px] text-neutral-500">Customer portal</div>
          </div>

          <div className="mb-6 text-center">
            <div
              className="
                inline-flex items-center gap-1 rounded-full border
                border-[color:var(--metal-border-soft,#1f2937)]
                bg-black/70
                px-3 py-1 text-[11px]
                uppercase tracking-[0.22em]
                text-neutral-300
              "
              style={{ color: COPPER }}
            >
              Invoice
            </div>

            <h1
              className="mt-3 text-3xl sm:text-4xl font-semibold text-white"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              Work Order #{workOrderId}
            </h1>

            <p className="mt-2 text-xs text-neutral-400 sm:text-sm">
              Review your invoice details and save a copy for your records.
            </p>
          </div>

          {/* Placeholder content for now – wire to real data later */}
          <div
            className="
              space-y-4 rounded-2xl border
              border-[color:var(--metal-border-soft,#1f2937)]
              bg-black/60 px-4 py-4 sm:px-5 sm:py-5
            "
          >
            <div className="flex flex-col gap-2 text-sm text-neutral-200 sm:flex-row sm:items-baseline sm:justify-between">
              <div>
                <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
                  Status
                </div>
                <div className="mt-1 text-sm text-emerald-300">
                  Invoice sent
                </div>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
                  Total (estimated)
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {/* Replace with real total once wired */}
                  —
                </div>
              </div>
            </div>

            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <div className="space-y-2">
              <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
                Line items
              </div>
              <div className="rounded-xl border border-dashed border-white/10 bg-black/40 px-3 py-3 text-xs text-neutral-400">
                Invoice line details will appear here once this page is wired to
                your work order data.
              </div>
            </div>

            <div className="pt-3 text-xs text-neutral-500">
              Need a printed copy? Your shop can also provide a PDF or printed
              invoice on request.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
