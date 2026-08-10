export type InvoiceDisplayIdentity = {
  primary: string;
  secondary: string;
};

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function invoiceDisplayIdentity(input: {
  workOrderNumber?: string | null;
  invoiceNumber?: string | null;
  workOrderId?: string | null;
  draft?: boolean;
}): InvoiceDisplayIdentity {
  const workOrderNumber = clean(input.workOrderNumber);
  const invoiceNumber = clean(input.invoiceNumber);
  const workOrderId = clean(input.workOrderId);

  return {
    primary:
      workOrderNumber ||
      (workOrderId
        ? `Work order ${workOrderId.slice(0, 8)}`
        : "Work order unavailable"),
    secondary: invoiceNumber
      ? `Invoice ${invoiceNumber}`
      : input.draft
        ? "Draft invoice"
        : "Invoice number pending",
  };
}
