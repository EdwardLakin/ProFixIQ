type VehicleInfo = {
  year?: string;
  make?: string;
  model?: string;
  vin?: string;
  license_plate?: string;
  unit_number?: string;
  mileage?: string;
  color?: string;
  engine_hours?: string;
};

type InvoiceLinePayload = {
  complaint?: string | null;
  cause?: string | null;
  correction?: string | null;
  labor_time?: string | number | null;
  lineId?: string | null;
};

export type SendInvoiceEmailInput = {
  workOrderId: string;
  customerEmail: string;
  invoiceTotal?: number;
  customerName?: string;
  shopName?: string;
  lines?: InvoiceLinePayload[];
  vehicleInfo?: VehicleInfo;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function pickErrorMessage(text: string): string {
  try {
    const j = JSON.parse(text) as unknown;
    if (isRecord(j) && typeof j.error === "string" && j.error.trim().length) {
      return j.error.trim();
    }
  } catch {
    // ignore
  }
  return text.trim().length ? text.trim() : "Failed to send invoice email";
}

export async function sendInvoiceEmail(data: SendInvoiceEmailInput): Promise<void> {
  const res = await fetch("/api/invoices/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(pickErrorMessage(text));
  }
}
