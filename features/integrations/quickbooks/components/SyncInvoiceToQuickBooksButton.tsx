"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";

type SyncResponse = {
  ok: boolean;
  invoiceId?: string;
  quickbooksInvoiceId?: string;
  docNumber?: string | null;
  alreadySynced?: boolean;
  error?: string;
};

type Props = {
  invoiceId: string;
  disabled?: boolean;
  className?: string;
  onSynced?: (result: {
    invoiceId: string;
    quickbooksInvoiceId: string;
    docNumber: string | null;
    alreadySynced: boolean;
  }) => void;
};

export default function SyncInvoiceToQuickBooksButton({
  invoiceId,
  disabled = false,
  className,
  onSynced,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [lastSyncedDoc, setLastSyncedDoc] = useState<string | null>(null);

  const label = useMemo(() => {
    if (busy) return "Syncing…";
    if (lastSyncedDoc) return `Synced • ${lastSyncedDoc}`;
    return "Sync to QuickBooks";
  }, [busy, lastSyncedDoc]);

  async function handleClick() {
    if (!invoiceId || busy || disabled) return;

    try {
      setBusy(true);

      const res = await fetch(`/api/integrations/quickbooks/invoice/${invoiceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const json = (await res.json().catch(() => ({}))) as SyncResponse;

      if (!res.ok || !json.ok || !json.quickbooksInvoiceId) {
        throw new Error(json.error || "Failed to sync invoice to QuickBooks.");
      }

      const resolvedDoc = json.docNumber ?? null;
      if (resolvedDoc) {
        setLastSyncedDoc(resolvedDoc);
      }

      toast.success(
        json.alreadySynced
          ? `Invoice already synced to QuickBooks${resolvedDoc ? ` (${resolvedDoc})` : ""}.`
          : `Invoice synced to QuickBooks${resolvedDoc ? ` (${resolvedDoc})` : ""}.`,
      );

      onSynced?.({
        invoiceId: json.invoiceId ?? invoiceId,
        quickbooksInvoiceId: json.quickbooksInvoiceId,
        docNumber: json.docNumber ?? null,
        alreadySynced: Boolean(json.alreadySynced),
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to sync invoice to QuickBooks.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={disabled || busy}
      className={className}
    >
      {label}
    </Button>
  );
}