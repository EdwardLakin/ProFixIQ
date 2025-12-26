export async function sendInvoiceEmail(data: {
  workOrderId: string;
  customerEmail: string;
  invoiceTotal?: number;
  customerName?: string;
  shopName?: string;
  lines?: any[];
  vehicleInfo?: any;
}): Promise<void> {
  const res = await fetch("/api/invoices/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error("Failed to send invoice email: " + text);
  }
}
