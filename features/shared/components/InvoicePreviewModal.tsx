"use client";

import { useEffect, useMemo, useState } from "react";
import { PDFViewer } from "@react-pdf/renderer";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import type { RepairLine } from "@ai/lib/parseRepairOutput";

import ModalShell from "@/features/shared/components/ModalShell";
import { WorkOrderInvoicePDF } from "@work-orders/components/WorkOrderInvoicePDF";
import CustomerPaymentButton from "@/features/stripe/components/CustomerPaymentButton";

type DB = Database;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workOrderId: string;
  vehicleInfo?: { year?: string; make?: string; model?: string; vin?: string };
  customerInfo?: { name?: string; phone?: string; email?: string };
  lines: RepairLine[];
  summary?: string;
  signatureImage?: string;
};

function normalizeCurrencyFromCountry(country: unknown): "usd" | "cad" {
  const c = String(country ?? "").trim().toUpperCase();
  return c === "CA" ? "cad" : "usd";
}

type ReviewIssue = { kind: string; lineId?: string; message: string };
type ReviewResponse = { ok: boolean; issues: ReviewIssue[] };

export default function InvoicePreviewModal({
  isOpen,
  onClose,
  workOrderId,
  vehicleInfo,
  customerInfo,
  lines,
  summary,
  signatureImage,
}: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"usd" | "cad">("usd");

  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewOk, setReviewOk] = useState<boolean>(false);
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);

    (async () => {
      // Work Order → shop_id
      const { data: wo, error: woErr } = await supabase
        .from("work_orders")
        .select("shop_id")
        .eq("id", workOrderId)
        .maybeSingle();

      if (woErr || !wo?.shop_id) {
        setShopId(null);
        setStripeAccountId(null);
        setCurrency("usd");
        setLoading(false);
        return;
      }

      setShopId(wo.shop_id);

      // Shop → stripe connect + country
      const { data: shop, error: sErr } = await supabase
        .from("shops")
        .select("stripe_account_id, country")
        .eq("id", wo.shop_id)
        .maybeSingle();

      if (sErr) {
        setStripeAccountId(null);
        setCurrency("usd");
        setLoading(false);
        return;
      }

      setStripeAccountId(shop?.stripe_account_id ?? null);
      setCurrency(normalizeCurrencyFromCountry(shop?.country));
      setLoading(false);
    })();
  }, [isOpen, supabase, workOrderId]);

  // 🔒 Invoice review gate (runs every time modal opens)
  useEffect(() => {
    if (!isOpen) return;

    setReviewLoading(true);
    setReviewError(null);
    setReviewIssues([]);
    setReviewOk(false);

    (async () => {
      try {
        const res = await fetch(`/api/work-orders/${workOrderId}/invoice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        const json = (await res.json().catch(() => null)) as ReviewResponse | null;

        if (!res.ok || !json) {
          setReviewOk(false);
          setReviewIssues([
            { kind: "error", message: "Invoice review failed (bad response)" },
          ]);
          return;
        }

        setReviewOk(Boolean(json.ok));
        setReviewIssues(Array.isArray(json.issues) ? json.issues : []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Invoice review failed";
        setReviewOk(false);
        setReviewError(msg);
        setReviewIssues([{ kind: "error", message: msg }]);
      } finally {
        setReviewLoading(false);
      }
    })();
  }, [isOpen, workOrderId]);

  const canTakePayment = Boolean(shopId && stripeAccountId);
  const canProceed = canTakePayment && reviewOk && !reviewLoading;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="INVOICE PREVIEW"
      size="xl"
      hideFooter
      bodyScrollable={false}
    >
      <div className="flex h-[78vh] flex-col gap-3">
        {/* Top action row */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--metal-border-soft)] bg-black/35 px-3 py-2">
          <div className="flex items-center gap-3">
            <div className="text-[0.7rem] uppercase tracking-[0.22em] text-neutral-300">
              Work Order
              <span className="ml-2 rounded-full border border-[var(--metal-border-soft)] bg-black/40 px-2 py-0.5 text-[0.65rem] text-neutral-200">
                #{workOrderId}
              </span>
            </div>

            {loading ? (
              <span className="text-[0.7rem] text-neutral-400">Loading shop…</span>
            ) : canTakePayment ? (
              <span className="text-[0.7rem] text-neutral-400">
                Payments enabled ({currency.toUpperCase()})
              </span>
            ) : (
              <span className="text-[0.7rem] text-neutral-500">
                Payments unavailable (shop not connected)
              </span>
            )}

            {reviewLoading ? (
              <span className="text-[0.7rem] text-neutral-400">Reviewing…</span>
            ) : reviewOk ? (
              <span className="text-[0.7rem] text-emerald-300">Invoice ready</span>
            ) : (
              <span className="text-[0.7rem] text-amber-300">Missing required info</span>
            )}
          </div>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-2">
            {canTakePayment && (
              <div className={canProceed ? "" : "opacity-50 pointer-events-none"}>
                <CustomerPaymentButton
                  shopId={shopId as string}
                  stripeAccountId={stripeAccountId as string}
                  currency={currency}
                  workOrderId={workOrderId}
                />
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--metal-border-soft)] bg-black/60 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-neutral-200 hover:bg-white/5 active:scale-95"
            >
              Close
            </button>
          </div>
        </div>

        {/* Review issues panel (only shows if blocked) */}
        {!reviewOk && (
          <div className="rounded-xl border border-amber-500/30 bg-black/35 px-3 py-2">
            <div className="text-[0.7rem] uppercase tracking-[0.18em] text-amber-200">
              Invoice blocked
            </div>
            <div className="mt-1 text-[0.75rem] text-neutral-300">
              Fix the items below, then reopen the invoice preview.
            </div>

            {reviewError && (
              <div className="mt-2 text-[0.75rem] text-red-200">
                {reviewError}
              </div>
            )}

            <ul className="mt-2 space-y-1 text-[0.8rem] text-neutral-200">
              {(reviewIssues ?? []).slice(0, 12).map((i, idx) => (
                <li key={`${i.kind}-${idx}`} className="flex gap-2">
                  <span className="text-amber-300">•</span>
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Mobile payment row */}
        <div className="md:hidden flex items-center justify-between gap-2 rounded-xl border border-[var(--metal-border-soft)] bg-black/35 px-3 py-2">
          {canTakePayment ? (
            <div className={canProceed ? "" : "opacity-50 pointer-events-none"}>
              <CustomerPaymentButton
                shopId={shopId as string}
                stripeAccountId={stripeAccountId as string}
                currency={currency}
                workOrderId={workOrderId}
              />
            </div>
          ) : (
            <span className="text-[0.7rem] text-neutral-500">
              Connect Stripe to accept payments
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--metal-border-soft)] bg-black/60 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-neutral-200 hover:bg-white/5 active:scale-95"
          >
            Close
          </button>
        </div>

        {/* PDF Surface */}
        <div className="flex-1 overflow-hidden rounded-xl border border-[var(--metal-border-soft)] bg-black/30">
          <PDFViewer width="100%" height="100%">
            <WorkOrderInvoicePDF
              workOrderId={workOrderId}
              vehicleInfo={vehicleInfo}
              customerInfo={customerInfo}
              lines={lines}
              summary={summary}
              signatureImage={signatureImage}
            />
          </PDFViewer>
        </div>
      </div>
    </ModalShell>
  );
}