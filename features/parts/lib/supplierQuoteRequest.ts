export type SupplierQuoteDraftItem = {
  description: string;
  qty: number;
  requestedPartNumber?: string | null;
  requestedManufacturer?: string | null;
};

function clean(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function quantityLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function buildSupplierQuoteDraft(input: {
  workOrderNumber: string;
  supplierName: string;
  items: SupplierQuoteDraftItem[];
}): { subject: string; message: string } {
  const workOrderNumber = clean(input.workOrderNumber) || "Work order";
  const supplierName = clean(input.supplierName) || "Parts team";
  const lines = input.items.map((item) => {
    const details = [
      clean(item.requestedPartNumber)
        ? `Part # ${clean(item.requestedPartNumber)}`
        : "",
      clean(item.requestedManufacturer),
    ].filter(Boolean);

    return `- ${quantityLabel(item.qty)} x ${clean(item.description) || "Part"}${
      details.length ? ` (${details.join(" | ")})` : ""
    }`;
  });

  return {
    subject: `Quote request - ${workOrderNumber}`,
    message: [
      `Hello ${supplierName},`,
      "",
      `Please provide a quote for the following parts for work order ${workOrderNumber}:`,
      "",
      ...lines,
      "",
      "Please include unit cost, availability, and ETA.",
      "",
      "Thank you.",
    ].join("\n"),
  };
}

export function supplierQuoteContactHref(input: {
  channel: "email" | "phone";
  email?: string | null;
  phone?: string | null;
  subject: string;
  message: string;
}): string | null {
  if (input.channel === "email") {
    const email = clean(input.email);
    if (!email) return null;
    return `mailto:${email}?subject=${encodeURIComponent(input.subject)}&body=${encodeURIComponent(input.message)}`;
  }

  const phone = clean(input.phone).replace(/[^+\d]/g, "");
  return phone ? `tel:${phone}` : null;
}
