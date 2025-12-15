// app/pay/cancel/page.tsx
import Link from "next/link";

export default function PayCancelPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#050910,_#020308_60%,_#000)] px-4 py-10 text-neutral-100">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-[var(--metal-border-soft)] bg-black/35 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur">
        <div className="mb-2 font-blackops text-[0.85rem] tracking-[0.26em] text-neutral-300">
          PROFixIQ Payments
        </div>

        <h1 className="text-2xl font-semibold text-neutral-100">Payment cancelled</h1>
        <p className="mt-2 text-sm text-neutral-300">
          No charge was completed. If you meant to pay, please try again from the invoice.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-black shadow-[0_0_20px_rgba(212,118,49,0.55)] hover:brightness-110"
          >
            Back to app
          </Link>

          <Link
            href="/support"
            className="rounded-full border border-[var(--metal-border-soft)] bg-black/60 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-neutral-200 hover:bg-white/5"
          >
            Contact support
          </Link>
        </div>
      </div>
    </div>
  );
}