export type PurchaseOrderContactChannel = "email" | "phone";

type PurchaseOrderContactLine = {
  description?: string | null;
  sku?: string | null;
  qty: number;
  unitCost?: number | null;
};

export function buildPurchaseOrderContactDraft(input: {
  workOrderNumber: string;
  poNumber?: string | null;
  supplierName: string;
  lines: PurchaseOrderContactLine[];
}): { subject: string; message: string } {
  const workOrderNumber = input.workOrderNumber.trim();
  const poNumber = input.poNumber?.trim() || "Draft PO";
  const lineText = input.lines.map((line, index) => {
    const reference = line.sku?.trim() ? ` | Part # ${line.sku.trim()}` : "";
    const unitCost =
      line.unitCost == null
        ? ""
        : ` | Unit cost $${Math.max(0, line.unitCost).toFixed(2)}`;
    return `${index + 1}. ${line.description?.trim() || "Part"} | Qty ${line.qty}${reference}${unitCost}`;
  });

  return {
    subject: `Purchase order - ${workOrderNumber}`,
    message: [
      `Hello ${input.supplierName.trim() || "Parts Team"},`,
      "",
      `Please place the following order for work order ${workOrderNumber}.`,
      `PO reference: ${poNumber}`,
      "",
      ...lineText,
      "",
      "Please confirm availability and expected delivery.",
    ].join("\n"),
  };
}

export function purchaseOrderContactHref(input: {
  channel: PurchaseOrderContactChannel;
  email?: string | null;
  phone?: string | null;
  subject: string;
  message: string;
}): string | null {
  if (input.channel === "phone") {
    const phone = input.phone?.trim();
    return phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : null;
  }

  const email = input.email?.trim();
  if (!email) return null;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(input.subject)}&body=${encodeURIComponent(input.message)}`;
}
