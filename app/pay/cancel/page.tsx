// app/pay/cancel/page.tsx
import Link from "next/link";

export default function PayCancelPage() {
  return (
    <div className="min-h-screen bg-[var(--theme-gradient-panel)] px-4 py-10 text-[color:var(--theme-text-primary)]">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 shadow-[var(--theme-shadow-medium)] backdrop-blur">
        <div className="mb-2 font-blackops text-[0.85rem] tracking-[0.26em] text-[color:var(--theme-text-secondary)]">
          PROFixIQ Payments
        </div>

        <h1 className="text-2xl font-semibold text-[color:var(--theme-text-primary)]">Payment cancelled</h1>
        <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
          No charge was completed. If you meant to pay, please try again from the invoice.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-on-accent)] shadow-[0_0_20px_rgba(212,118,49,0.55)] hover:brightness-110"
          >
            Back to app
          </Link>

          <Link
            href="/support"
            className="rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
          >
            Contact support
          </Link>
        </div>
      </div>
    </div>
  );
}