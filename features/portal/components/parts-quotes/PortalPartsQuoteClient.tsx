"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatPartsQuoteMoney,
  partsQuoteCanPay,
  partsQuoteNeedsDecision,
  partsQuoteStatusLabel,
  type PortalPartsQuote,
} from "@/features/portal/lib/partsQuotePresentation";

const card =
  "rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card sm:p-6";
const primaryButton =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--accent-copper)] px-4 py-3 text-sm font-semibold text-[color:var(--theme-text-on-accent)] disabled:opacity-60 sm:w-auto";
const secondaryButton =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-3 text-sm font-semibold text-[color:var(--theme-text-primary)] disabled:opacity-60 sm:w-auto";

type Busy = null | "approve_order" | "approve_book" | "decline" | "pay";

export default function PortalPartsQuoteClient({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paymentSession = searchParams.get("payment_session");
  const confirmedSession = useRef<string | null>(null);

  const [quote, setQuote] = useState<PortalPartsQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/portal/parts-quotes/${quoteId}`, { cache: "no-store" });
      const json = (await response.json().catch(() => null)) as
        | { quote?: PortalPartsQuote; error?: string }
        | null;
      if (!response.ok || !json?.quote) {
        setError(json?.error ?? "This quote could not be loaded.");
        return;
      }
      setError(null);
      setQuote(json.quote);
    } catch {
      setError("This quote could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Returning from Stripe Checkout: verify the session so the quote shows as
  // paid even if the webhook has not landed yet.
  useEffect(() => {
    if (!paymentSession || confirmedSession.current === paymentSession) return;
    confirmedSession.current = paymentSession;
    void (async () => {
      try {
        const response = await fetch(`/api/portal/parts-quotes/${quoteId}/confirm-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: paymentSession }),
        });
        const json = (await response.json().catch(() => null)) as
          | { recorded?: boolean; quote?: PortalPartsQuote | null; error?: string }
          | null;
        if (json?.quote) setQuote(json.quote);
        if (json?.recorded) setNotice("Payment received. Thank you!");
        else if (!response.ok) setError(json?.error ?? "We could not confirm your payment yet.");
        else setNotice("Your payment is processing. This page will update shortly.");
      } catch {
        setNotice("Your payment is processing. This page will update shortly.");
      } finally {
        router.replace(`/portal/parts-quotes/${quoteId}`);
      }
    })();
  }, [paymentSession, quoteId, router]);

  async function decide(decision: "approve" | "decline", choice: "order_parts" | "book_install") {
    if (busy) return;
    setBusy(decision === "decline" ? "decline" : choice === "book_install" ? "approve_book" : "approve_order");
    setError(null);
    try {
      const response = await fetch(`/api/portal/parts-quotes/${quoteId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, choice }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(json?.error ?? "We could not record your decision.");
        return;
      }
      await load();
      if (decision === "approve" && choice === "book_install") {
        router.push("/portal/request/when");
        return;
      }
      setNotice(
        decision === "approve"
          ? "Approved. The shop will order your parts."
          : "Quote declined.",
      );
    } catch {
      // The request may have reached the shop before the connection dropped, so
      // show the current state before allowing another attempt.
      setError("We could not confirm your decision. Please check your connection; the quote below shows its current status.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    if (busy) return;
    setBusy("pay");
    setError(null);
    try {
      const response = await fetch(`/api/portal/parts-quotes/${quoteId}/checkout`, {
        method: "POST",
      });
      const json = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !json?.url) {
        setError(json?.error ?? "We could not start your payment.");
        return;
      }
      window.location.assign(json.url);
    } catch {
      setError("We could not start your payment. Please check your connection and try again.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="text-sm text-[color:var(--theme-text-secondary)]">Loading your parts quote…</div>;
  }

  if (!quote) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div role="alert" className={card}>
          {error ?? "This quote is unavailable."}
        </div>
        <Link href="/portal/quotes" className="text-sm font-semibold text-[var(--accent-copper-light)]">
          ← My quotes
        </Link>
      </div>
    );
  }

  const needsDecision = partsQuoteNeedsDecision(quote.status);
  const canPay = partsQuoteCanPay(quote.status, quote.paid, quote.total);
  const preparing = quote.status === "requested" || quote.status === "quoted";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 text-[color:var(--theme-text-primary)]">
      <header className="space-y-2">
        <Link href="/portal/quotes" className="text-xs font-semibold text-[var(--accent-copper-light)]">
          ← My quotes
        </Link>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper-light)]">
          Parts quote
        </div>
        <h1 className="text-2xl font-semibold">{quote.description}</h1>
        <p className="text-sm text-[color:var(--theme-text-secondary)]">
          {[quote.vehicleLabel, `Qty ${quote.qty}`].filter(Boolean).join(" • ")}
        </p>
        <span className="inline-flex rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 text-xs font-semibold">
          {partsQuoteStatusLabel(quote.status, quote.paid)}
        </span>
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      {preparing ? (
        <section className={card}>
          <p className="text-sm text-[color:var(--theme-text-secondary)]">
            The shop&apos;s Parts team is pricing this request. We&apos;ll email you a link as soon as your quote is ready.
          </p>
          {quote.notes ? (
            <p className="mt-3 text-sm">
              <span className="font-semibold">Your notes: </span>
              {quote.notes}
            </p>
          ) : null}
        </section>
      ) : null}

      {quote.items.length > 0 ? (
        <section className={card} aria-label="Quote details">
          <ul className="divide-y divide-[color:var(--theme-border-soft)]">
            {quote.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-semibold">{item.description}</div>
                  <div className="text-xs text-[color:var(--theme-text-secondary)]">
                    {[item.partNumber, `Qty ${item.qty}`].filter(Boolean).join(" • ")}
                  </div>
                </div>
                <div className="text-right">
                  <div>{formatPartsQuoteMoney(item.lineTotal, quote.currency)}</div>
                  <div className="text-xs text-[color:var(--theme-text-secondary)]">
                    {formatPartsQuoteMoney(item.unitPrice, quote.currency)} each
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-[color:var(--theme-border-soft)] pt-3 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatPartsQuoteMoney(quote.subtotal, quote.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Tax</dt>
              <dd>{formatPartsQuoteMoney(quote.taxTotal, quote.currency)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd>{formatPartsQuoteMoney(quote.total, quote.currency)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {needsDecision ? (
        <section className={`${card} space-y-3`} aria-label="Your decision">
          <h2 className="text-sm font-semibold">What would you like to do?</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className={primaryButton}
              disabled={busy !== null}
              onClick={() => void decide("approve", "order_parts")}
            >
              {busy === "approve_order" ? "Approving…" : "Approve — order the parts"}
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={busy !== null}
              onClick={() => void decide("approve", "book_install")}
            >
              {busy === "approve_book" ? "Approving…" : "Approve and book an install appointment"}
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={busy !== null}
              onClick={() => void decide("decline", "order_parts")}
            >
              {busy === "decline" ? "Declining…" : "Decline"}
            </button>
          </div>
        </section>
      ) : null}

      {quote.status === "approved" ? (
        <section className={`${card} space-y-3`} aria-label="Next steps">
          {quote.paid ? (
            <p className="text-sm">
              Paid{quote.paidAt ? ` on ${new Date(quote.paidAt).toLocaleDateString("en-CA")}` : ""}. The shop is
              ordering your parts and will let you know when they are ready.
            </p>
          ) : (
            <p className="text-sm text-[color:var(--theme-text-secondary)]">
              Approved. The shop is ordering your parts. You can pay now to settle this quote.
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            {canPay ? (
              <button type="button" className={primaryButton} disabled={busy !== null} onClick={() => void pay()}>
                {busy === "pay" ? "Opening checkout…" : `Pay ${formatPartsQuoteMoney(quote.total, quote.currency)}`}
              </button>
            ) : null}
            <Link href="/portal/request/when" className={secondaryButton}>
              Book an install appointment
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
