// app/pay/success/page.tsx
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import Link from "next/link";

type SearchParams = Record<string, string | string[] | undefined>;

const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY ?? "");

function getStr(searchParams: SearchParams, key: string): string | null {
  const v = searchParams[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
}

function fmtMoney(amountCents: number, currency: string): string {
  const cur = currency.toUpperCase();
  const dollars = (amountCents / 100).toFixed(2);
  return `${cur} $${dollars}`;
}

export default async function PaySuccessPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const sessionId = getStr(sp, "session_id");

  let title = "Payment complete";
  let subtitle = "Thanks — the payment was received.";
  let amountText: string | null = null;
  let shopId: string | null = null;
  let workOrderId: string | null = null;

  if (!process.env.STRIPE_SECRET_KEY) {
    title = "Payment status";
    subtitle = "Server is missing STRIPE_SECRET_KEY.";
  } else if (!sessionId) {
    title = "Payment status";
    subtitle = "Missing session_id.";
  } else {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      shopId = session.metadata?.shop_id ?? null;
      workOrderId = session.metadata?.work_order_id ?? null;

      const amountTotal =
        typeof session.amount_total === "number" ? session.amount_total : null;
      const currency =
        typeof session.currency === "string" ? session.currency : null;

      if (amountTotal !== null && currency) {
        amountText = fmtMoney(amountTotal, currency);
      }

      if (session.payment_status && session.payment_status !== "paid") {
        title = "Payment pending";
        subtitle =
          "We received the checkout session, but it is not marked paid yet.";
      }
    } catch {
      title = "Payment status";
      subtitle = "Could not verify the payment session.";
    }
  }

  return (
    <div className="min-h-screen bg-[var(--theme-gradient-panel)] px-4 py-10 text-[color:var(--theme-text-primary)]">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 shadow-[var(--theme-shadow-medium)] backdrop-blur">
        <div className="mb-2 font-blackops text-[0.85rem] tracking-[0.26em] text-[color:var(--theme-text-secondary)]">
          PROFIXIQ PAYMENTS
        </div>

        <h1 className="text-2xl font-semibold text-[color:var(--theme-text-primary)]">{title}</h1>
        <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">{subtitle}</p>

        <div className="mt-5 space-y-2 rounded-xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
          {amountText ? (
            <div className="text-sm text-[color:var(--theme-text-primary)]">
              Amount:{" "}
              <span className="font-semibold text-[color:var(--theme-text-primary)]">
                {amountText}
              </span>
            </div>
          ) : null}

          {workOrderId ? (
            <div className="text-sm text-[color:var(--theme-text-primary)]">
              Work Order:{" "}
              <span className="font-mono text-[color:var(--theme-text-primary)]">{workOrderId}</span>
            </div>
          ) : null}

          {shopId ? (
            <div className="text-sm text-[color:var(--theme-text-primary)]">
              Shop: <span className="font-mono text-[color:var(--theme-text-primary)]">{shopId}</span>
            </div>
          ) : null}

          {sessionId ? (
            <div className="text-[11px] text-[color:var(--theme-text-secondary)]">
              Session: <span className="font-mono">{sessionId}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={workOrderId ? `/work-orders/${workOrderId}` : "/"}
            className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-on-accent)] shadow-[0_0_20px_rgba(212,118,49,0.55)] hover:brightness-110"
          >
            Return to app
          </Link>

          <Link
            href="/pay/cancel"
            className="rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
          >
            Need help
          </Link>
        </div>
      </div>
    </div>
  );
}