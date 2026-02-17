// app/work-orders/[id]/invoice/page.tsx  ✅ FULL FILE REPLACEMENT
"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import InvoicePreviewPageClient from "@/features/work-orders/components/InvoicePreviewPageClient";

export default function WorkOrderInvoicePage(): JSX.Element | null {
  const params = useParams<{ id?: string | string[] }>();

  const workOrderId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  }, [params]);

  if (!workOrderId) return null;

  return <InvoicePreviewPageClient workOrderId={workOrderId} />;
}