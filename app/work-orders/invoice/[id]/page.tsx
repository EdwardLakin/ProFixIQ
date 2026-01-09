// app/work-orders/invoice/[id]/page.tsx
"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";

import InvoicePreviewPageClient from "@/features/work-orders/components/InvoicePreviewPageClient";

export default function WorkOrderInvoicePage() {
  const params = useParams<{ id: string }>();

  const workOrderId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  }, [params]);

  // If someone hits the route without an id, render nothing (or you can show a small error UI)
  if (!workOrderId) return null;

  return <InvoicePreviewPageClient workOrderId={workOrderId} />;
}