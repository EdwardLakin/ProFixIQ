"use client";

import { ArrowLeft, CheckCircle2, CreditCard, FileText, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import RecordManualPayment from "@/features/invoices/components/RecordManualPayment";

type CloseoutState = {
  workOrder: { id: string; custom_id: string | null; status: string; payment_status: string; outstanding_balance: number };
  invoiceVersion: null | { id: string; invoiceId: string | null; lifecycleStatus: string; currency: "CAD" | "USD"; total: number; paidTotal: number; outstandingTotal: number };
  receipt: null | { id: string; receipt_number: string; amount: number; currency: string; payment_method: string | null; received_at: string; remaining_balance: number };
};

function money(value: number, currency: string) { return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(Number(value || 0)); }

export default function MobileServiceCloseout({ workOrderId }: { workOrderId: string }) {
  const search = useSearchParams();
  const paymentReturn = search.get("payment");
  const [state, setState] = useState<CloseoutState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/mobile/service/closeout/${encodeURIComponent(workOrderId)}`, { credentials: "include", cache: "no-store" });
      const body = (await response.json().catch(() => null)) as CloseoutState & { error?: string };
      if (!response.ok) throw new Error(body?.error || "Closeout could not be loaded.");
      setState(body);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Closeout could not be loaded."); }
    finally { setLoading(false); }
  }, [workOrderId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (paymentReturn !== "success") return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1; void load();
      if (attempts >= 8) window.clearInterval(timer);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [load, paymentReturn]);

  async function finalize() {
    setBusy(true); setError(null);
    try {
      const idempotencyKey = `mobile-closeout-finalize:${workOrderId}`;
      const response = await fetch("/api/invoices/finalize", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ workOrderId }) });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Invoice could not be finalized.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invoice could not be finalized."); }
    finally { setBusy(false); }
  }

  async function takeCard() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/mobile/service/closeout/${encodeURIComponent(workOrderId)}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "checkout" }) });
      const body = (await response.json().catch(() => null)) as { error?: string; url?: string; paid?: boolean } | null;
      if (!response.ok) throw new Error(body?.error || "Card payment could not start.");
      if (body?.paid) { await load(); return; }
      if (!body?.url) throw new Error("Payment link was not returned.");
      window.location.assign(body.url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Card payment could not start."); setBusy(false); }
  }

  const invoice = state?.invoiceVersion;
  const paid = invoice ? invoice.outstandingTotal <= 0.005 : state?.workOrder.payment_status === "paid";

  return <main className="mx-auto w-full max-w-xl space-y-4 px-3 pb-8 pt-3 text-[color:var(--theme-text-primary)] sm:px-4">
    <header className="flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950 p-4 text-white shadow-card"><Link href="/mobile/service" className="inline-grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-white/[0.07]"><ArrowLeft className="h-5 w-5" /></Link><div><div className="text-[0.62rem] font-extrabold uppercase tracking-[0.2em] text-sky-300">Field closeout</div><h1 className="text-xl font-extrabold">{state?.workOrder.custom_id ? `WO ${state.workOrder.custom_id}` : "Repair complete"}</h1><p className="text-xs text-slate-300">Invoice → payment → receipt → gone.</p></div></header>
    {loading ? <div className="h-40 animate-pulse rounded-3xl bg-[color:var(--theme-surface-panel)]" /> : null}
    {!loading && state ? <>
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 shadow-card">
        {paid ? <div className="text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" /><h2 className="mt-2 text-2xl font-extrabold">Paid & done</h2><p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">{invoice ? money(invoice.total, invoice.currency) : "Payment complete"}</p></div> : invoice ? <div><div className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Amount due</div><div className="mt-1 text-4xl font-black">{money(invoice.outstandingTotal, invoice.currency)}</div><div className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">Invoice is ready. Collect payment without leaving the field workflow.</div></div> : <div><div className="flex items-center gap-2"><FileText className="h-5 w-5" /><h2 className="text-lg font-extrabold">Finalize invoice</h2></div><p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Uses the same protected ProFixIQ invoice lifecycle as the shop.</p></div>}
      </section>

      {!invoice ? <button disabled={busy} onClick={() => void finalize()} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 text-base font-extrabold text-white disabled:opacity-40"><FileText className="h-5 w-5" />{busy ? "Finalizing…" : "Finalize invoice"}</button> : null}
      {invoice && !paid ? <section className="space-y-2"><button disabled={busy} onClick={() => void takeCard()} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-base font-extrabold text-white disabled:opacity-40"><CreditCard className="h-5 w-5" />{busy ? "Opening payment…" : "Take card payment"}</button><div className="flex items-center justify-center"><RecordManualPayment workOrderId={workOrderId} currency={invoice.currency} outstandingTotal={invoice.outstandingTotal} onPosted={() => void load()} /></div></section> : null}

      <Link href={`/mobile/service/followup/${encodeURIComponent(workOrderId)}`} className="flex min-h-12 items-center justify-between rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-4 font-bold"><span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-sky-400" /> Add recommendation for later</span><span>+</span></Link>

      {state.receipt ? <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4"><div className="text-xs font-extrabold uppercase tracking-[0.15em] text-emerald-300">Receipt</div><div className="mt-1 font-extrabold">{state.receipt.receipt_number}</div><div className="text-sm text-emerald-100">{money(state.receipt.amount, state.receipt.currency)} · {state.receipt.payment_method || "payment"}</div></section> : null}
      {paid ? <Link href="/mobile/service" className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 text-base font-extrabold text-white"><CheckCircle2 className="h-5 w-5" /> Done — next call</Link> : null}
    </> : null}
    {error ? <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}<button type="button" onClick={() => void load()} className="ml-2 inline-flex items-center gap-1 font-bold"><RefreshCw className="h-3.5 w-3.5" />Retry</button></div> : null}
  </main>;
}
