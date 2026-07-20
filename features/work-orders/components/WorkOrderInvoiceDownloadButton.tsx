// features/work-orders/components/WorkOrderInvoiceDownloadButton.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RepairLine } from "@ai/lib/parseRepairOutput";

type Props = {
  workOrderId: string;
  invoiceVersionId?: string | null;
  draft?: boolean;

  // kept for signature parity (server route generates PDF from DB)
  lines?: RepairLine[];
  summary?: string;
  vehicleInfo?: { year?: string; make?: string; model?: string; vin?: string };
  customerInfo?: { name?: string; phone?: string; email?: string };

  autoTrigger?: boolean;
  className?: string;

  // ✅ New: choose where the button goes
  mode?: "pdf" | "preview"; // default "pdf"

  // ✅ PDF behavior
  openInNewTab?: boolean; // default true
  forceDownload?: boolean; // default false (uses ?download=1)
};

export function WorkOrderInvoiceDownloadButton({
  workOrderId,
  invoiceVersionId,
  draft = false,
  autoTrigger = false,
  className,
  mode = "pdf",
  openInNewTab = true,
  forceDownload = false,
}: Props): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTriggered = useRef(false);

  const urlToOpen = useMemo(() => {
    if (mode === "preview") return `/work-orders/${workOrderId}/invoice`;

    const base = invoiceVersionId
      ? `/api/invoice-versions/${invoiceVersionId}/pdf`
      : `/api/work-orders/${workOrderId}/invoice-pdf`;
    return forceDownload ? `${base}?download=1` : base;
  }, [mode, workOrderId, invoiceVersionId, forceDownload]);

  const open = useCallback(async (): Promise<void> => {
    if (busy) return;
    if (!workOrderId) return;

    setBusy(true);
    setError(null);
    if (mode === "preview") {
      if (openInNewTab) {
        const preview = window.open(urlToOpen, "_blank");
        if (preview) preview.opener = null;
      } else {
        window.location.assign(urlToOpen);
      }
      setBusy(false);
      return;
    }
    const popup = openInNewTab && !forceDownload
      ? window.open("about:blank", "_blank")
      : null;
    if (popup) {
      popup.opener = null;
      popup.document.title = "Preparing invoice PDF";
      popup.document.body.textContent = "Preparing invoice PDF...";
    }
    try {
      const response = await fetch(urlToOpen, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/pdf" },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Invoice PDF could not be generated (${response.status}).`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/pdf")) {
        throw new Error("The invoice service returned an unexpected response.");
      }

      const blobUrl = URL.createObjectURL(await response.blob());
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);

      if (forceDownload) {
        const disposition = response.headers.get("content-disposition") ?? "";
        const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? "invoice.pdf";
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }
      if (popup) {
        popup.location.replace(blobUrl);
      } else {
        window.location.assign(blobUrl);
      }
    } catch (caught: unknown) {
      popup?.close();
      setError(caught instanceof Error ? caught.message : "Invoice PDF could not be opened.");
    } finally {
      setBusy(false);
    }
  }, [busy, workOrderId, mode, openInNewTab, forceDownload, urlToOpen]);

  useEffect(() => {
    if (!autoTrigger) {
      autoTriggered.current = false;
      return;
    }
    if (!workOrderId) return;
    if (autoTriggered.current) return;
    autoTriggered.current = true;
    queueMicrotask(() => void open());
  }, [autoTrigger, workOrderId, open]);

  const label =
    mode === "preview"
      ? "Open invoice preview"
      : draft
        ? "Preview draft PDF"
      : openInNewTab
        ? "Open invoice PDF"
        : "View invoice PDF";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => void open()}
        disabled={!workOrderId || busy}
        className={
          className ??
          "rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-on-accent)] hover:brightness-110 disabled:opacity-60"
        }
      >
        {busy ? "Preparing PDF…" : label}
      </button>
      {error ? (
        <span role="alert" className="max-w-sm text-right text-xs text-red-300">
          {error}
        </span>
      ) : null}
    </div>
  );
}
