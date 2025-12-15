// app/pay/success/page.tsx
import Stripe from "stripe";
import Link from "next/link";

type SearchParams = Record<string, string | string[] | undefined>;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

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
  searchParams: SearchParams;
}) {
  const sessionId = getStr(searchParams, "session_id");

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

      const amountTotal = typeof session.amount_total === "number" ? session.amount_total : null;
      const currency = typeof session.currency === "string" ? session.currency : null;

      if (amountTotal !== null && currency) {
        amountText = fmtMoney(amountTotal, currency);
      }

      if (session.payment_status && session.payment_status !== "paid") {
        title = "Payment pending";
        subtitle = "We received the checkout session, but it is not marked paid yet.";
      }
    } catch {
      title = "Payment status";
      subtitle = "Could not verify the payment session.";
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#050910,_#020308_60%,_#000)] px-4 py-10 text-neutral-100">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-[var(--metal-border-soft)] bg-black/35 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur">
        <div className="mb-2 font-blackops text-[0.85rem] tracking-[0.26em] text-neutral-300">
          PROFixIQ Payments
        </div>

        <h1 className="text-2xl font-semibold text-neutral-100">{title}</h1>
        <p className="mt-2 text-sm text-neutral-300">{subtitle}</p>

        <div className="mt-5 space-y-2 rounded-xl border border-[var(--metal-border-soft)] bg-black/40 p-4">
          {amountText ? (
            <div className="text-sm text-neutral-200">
              Amount: <span className="font-semibold text-neutral-50">{amountText}</span>
            </div>
          ) : null}

          {workOrderId ? (
            <div className="text-sm text-neutral-200">
              Work Order: <span className="font-mono text-neutral-50">{workOrderId}</span>
            </div>
          ) : null}

          {shopId ? (
            <div className="text-sm text-neutral-200">
              Shop: <span className="font-mono text-neutral-50">{shopId}</span>
            </div>
          ) : null}

          {sessionId ? (
            <div className="text-[11px] text-neutral-400">
              Session: <span className="font-mono">{sessionId}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={workOrderId ? `/work-orders/${workOrderId}` : "/"}
            className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-black shadow-[0_0_20px_rgba(212,118,49,0.55)] hover:brightness-110"
          >
            Return to app
          </Link>

          <Link
            href="/pay/cancel"
            className="rounded-full border border-[var(--metal-border-soft)] bg-black/60 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-neutral-200 hover:bg-white/5"
          >
            Need help
          </Link>
        </div>
      </div>
    </div>
  );
}