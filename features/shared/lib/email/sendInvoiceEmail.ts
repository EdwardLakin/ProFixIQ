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
}: {
  vehicleId: string;
  workOrderId: string;
  lines: InvoiceLine[];
  summary?: string;
  vehicleInfo?: VehicleInfo;
  customerInfo?: CustomerInfo;
}) {
  const res = await fetch(
    "https://jaqjlyhvyofjvtwaeurr.supabase.co/functions/v1/send-invoice-email",
    {
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
      }),
    },
  );

  if (!res.ok) throw new Error("Failed to send invoice email");

  return await res.json();
}
