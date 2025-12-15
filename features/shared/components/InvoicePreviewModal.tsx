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

  const canTakePayment = Boolean(shopId && stripeAccountId);

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
        {/* Top action row (metal/glass theme, no orange-400/500) */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--metal-border-soft)] bg-black/35 px-3 py-2">
          <div className="flex items-center gap-3">
            <div className="text-[0.7rem] uppercase tracking-[0.22em] text-neutral-300">
              Work Order
              <span className="ml-2 rounded-full border border-[var(--metal-border-soft)] bg-black/40 px-2 py-0.5 text-[0.65rem] text-neutral-200">
                #{workOrderId}
              </span>
            </div>

            {loading ? (
              <span className="text-[0.7rem] text-neutral-400">
                Loading shop…
              </span>
            ) : canTakePayment ? (
              <span className="text-[0.7rem] text-neutral-400">
                Payments enabled ({currency.toUpperCase()})
              </span>
            ) : (
              <span className="text-[0.7rem] text-neutral-500">
                Payments unavailable (shop not connected)
              </span>
            )}
          </div>

          {/* Desktop payment CTA */}
          <div className="hidden md:flex items-center gap-2">
            {canTakePayment && (
              <CustomerPaymentButton
                shopId={shopId as string}
                stripeAccountId={stripeAccountId as string}
                currency={currency}
                workOrderId={workOrderId}
              />
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

        {/* Mobile payment row */}
        <div className="md:hidden flex items-center justify-between gap-2 rounded-xl border border-[var(--metal-border-soft)] bg-black/35 px-3 py-2">
          {canTakePayment ? (
            <CustomerPaymentButton
              shopId={shopId as string}
              stripeAccountId={stripeAccountId as string}
              currency={currency}
              workOrderId={workOrderId}
            />
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

        {/* PDF Surface (keep child-managed scroll) */}
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