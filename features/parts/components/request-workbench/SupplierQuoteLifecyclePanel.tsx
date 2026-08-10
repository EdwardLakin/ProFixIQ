"use client";

import Link from "next/link";
import { Mail, Phone } from "lucide-react";

import type {
  DraftPurchaseOrderPrompt,
  SupplierQuoteChannel,
  SupplierQuoteWorkbenchBatch,
} from "./types";

export function SupplierQuoteLifecyclePanel({
  quoteRequests,
  draftPurchaseOrders,
  busyPo,
  onRecordResponse,
  onContactPurchaseOrder,
}: {
  quoteRequests: SupplierQuoteWorkbenchBatch[];
  draftPurchaseOrders: DraftPurchaseOrderPrompt[];
  busyPo?: { poId: string; channel: SupplierQuoteChannel } | null;
  onRecordResponse?: (quoteRequestId: string) => void;
  onContactPurchaseOrder?: (
    poId: string,
    channel: SupplierQuoteChannel,
  ) => void;
}): JSX.Element | null {
  const pending = quoteRequests.filter((request) => request.status === "requested");
  const errors = quoteRequests.filter((request) => request.poGenerationError);
  const actionablePos = draftPurchaseOrders.filter(
    (purchaseOrder) => !purchaseOrder.supplierContactedAt,
  );

  if (pending.length === 0 && errors.length === 0 && actionablePos.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {pending.map((request) => (
        <div
          key={request.id}
          className="flex flex-wrap items-center justify-between gap-3 border-y border-sky-400/20 bg-sky-500/10 px-4 py-3"
        >
          <div>
            <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
              Waiting for quote from {request.supplierName}
            </div>
            <div className="text-xs text-[color:var(--theme-text-secondary)]">
              {request.itemIds.length} {request.itemIds.length === 1 ? "part" : "parts"}
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg border border-sky-400/35 bg-sky-600/80 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            onClick={() => onRecordResponse?.(request.id)}
          >
            Record Supplier Quote
          </button>
        </div>
      ))}

      {actionablePos.map((purchaseOrder) => {
        const busy = busyPo?.poId === purchaseOrder.id;
        return (
          <div
            key={purchaseOrder.id}
            className="flex flex-wrap items-center justify-between gap-3 border-y border-emerald-400/25 bg-emerald-500/10 px-4 py-3"
          >
            <div>
              <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                Customer approved. Draft PO ready for {purchaseOrder.supplierName}
              </div>
              <div className="text-xs text-[color:var(--theme-text-secondary)]">
                PO {purchaseOrder.poNumber || purchaseOrder.id.slice(0, 8)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/parts/po/${purchaseOrder.id}`}
                className="rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
              >
                Review PO
              </Link>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] disabled:opacity-50"
                disabled={busy || !purchaseOrder.supplierPhone}
                onClick={() => onContactPurchaseOrder?.(purchaseOrder.id, "phone")}
              >
                <Phone aria-hidden="true" className="h-4 w-4" />
                {busy && busyPo?.channel === "phone" ? "Opening call..." : "Call in PO"}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-600/85 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={busy || !purchaseOrder.supplierEmail}
                onClick={() => onContactPurchaseOrder?.(purchaseOrder.id, "email")}
              >
                <Mail aria-hidden="true" className="h-4 w-4" />
                {busy && busyPo?.channel === "email" ? "Preparing email..." : "Email PO"}
              </button>
            </div>
          </div>
        );
      })}

      {errors.map((request) => (
        <div
          key={request.id}
          className="border-y border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
        >
          Draft PO needs review for {request.supplierName}: {request.poGenerationError}
        </div>
      ))}
    </div>
  );
}
