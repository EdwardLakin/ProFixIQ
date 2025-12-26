// features/shared/lib/email/sendInvoiceEmail.ts

type InvoiceLine = {
  title: string;
  description?: string;
  quantity?: number;
  rate?: number;
  total?: number;
  partName?: string;
  jobType?: string;
};

type VehicleInfo = {
  year?: string;
  make?: string;
  model?: string;
  vin?: string;
};

type CustomerInfo = {
  name?: string;
  phone?: string;
  email?: string;
};

export async function sendInvoiceEmail({
  vehicleId,
  workOrderId,
  lines,
  summary,
  vehicleInfo,
  customerInfo,
  invoiceTotal,
  pdfUrl,
  shopName,
}: {
  vehicleId: string;
  workOrderId: string;
  lines: InvoiceLine[];
  summary?: string;
  vehicleInfo?: VehicleInfo;
  customerInfo?: CustomerInfo;
  invoiceTotal?: number;
  pdfUrl?: string | null;
  shopName?: string;
}) {
  const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(
    /\/$/,
    "",
  );

  const res = await fetch(`${baseUrl}/functions/v1/send-invoice-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      vehicleId,
      workOrderId,
      lines,
      summary,
      vehicleInfo,
      customerInfo,
      invoiceTotal,
      pdfUrl,
      shopName,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to send invoice email (status ${res.status})`);
  }

  return res.json().catch(() => ({}));
}