import type { InvoiceRow, WorkOrderRow } from "../types";

export type QuickBooksInvoiceInput = {
  invoice: Pick<
    InvoiceRow,
    | "id"
    | "invoice_number"
    | "issued_at"
    | "due_date"
    | "notes"
    | "labor_cost"
    | "parts_cost"
    | "discount_total"
    | "tax_total"
    | "total"
    | "work_order_id"
  >;
  workOrder?: Pick<WorkOrderRow, "custom_id"> | null;
  qbCustomerId: string;
  qbSalesItemId: string;
};

function roundMoney(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function mapInvoiceToQuickBooksPayload(input: QuickBooksInvoiceInput) {
  const { invoice, workOrder, qbCustomerId, qbSalesItemId } = input;

  const labor = roundMoney(invoice.labor_cost);
  const parts = roundMoney(invoice.parts_cost);
  const discount = roundMoney(invoice.discount_total);
  const tax = roundMoney(invoice.tax_total);

  const lines: Array<Record<string, unknown>> = [];

  const pushSalesLine = (description: string, amount: number) => {
    if (amount <= 0) return;
    lines.push({
      DetailType: "SalesItemLineDetail",
      Amount: amount,
      Description: description,
      SalesItemLineDetail: {
        ItemRef: {
          value: qbSalesItemId,
        },
        Qty: 1,
        UnitPrice: amount,
      },
    });
  };

  pushSalesLine("Labor", labor);
  pushSalesLine("Parts", parts);

  if (discount > 0) {
    lines.push({
      DetailType: "SalesItemLineDetail",
      Amount: -discount,
      Description: "Discount",
      SalesItemLineDetail: {
        ItemRef: {
          value: qbSalesItemId,
        },
        Qty: 1,
        UnitPrice: -discount,
      },
    });
  }

  if (tax > 0) {
    pushSalesLine("Tax", tax);
  }

  const privateNoteParts = [
    workOrder?.custom_id?.trim() ? `RO: ${workOrder.custom_id.trim()}` : null,
    invoice.notes?.trim() || null,
  ].filter(Boolean);

  return {
    CustomerRef: { value: qbCustomerId },
    DocNumber: invoice.invoice_number?.trim() || undefined,
    TxnDate: invoice.issued_at?.slice(0, 10) || undefined,
    DueDate: invoice.due_date?.slice(0, 10) || undefined,
    PrivateNote: privateNoteParts.join(" • ") || undefined,
    Line: lines,
  };
}