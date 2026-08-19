export const FIELD_INVOICE_ACTIVE_STATES = [
  "issued",
  "partially_paid",
  "paid",
] as const;

export type FieldInvoiceFilter = "unpaid" | "paid" | "all";

export type FieldInvoiceWorkOrder = {
  id: string;
  custom_id: string | null;
  updated_at: string | null;
  paid_at: string | null;
  customers: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | Array<{
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }> | null;
  vehicles: {
    year: number | null;
    make: string | null;
    model: string | null;
    license_plate: string | null;
  } | Array<{
    year: number | null;
    make: string | null;
    model: string | null;
    license_plate: string | null;
  }> | null;
};

export type FieldInvoiceVersion = {
  id: string;
  work_order_id: string;
  version_number: number;
  lifecycle_status: string;
  currency: string;
  total: number | null;
  paid_total: number | null;
  refunded_total: number | null;
  outstanding_total: number | null;
  issued_at: string | null;
  created_at: string;
  invoices:
    | { invoice_number: string | null }
    | Array<{ invoice_number: string | null }>
    | null;
};

export type FieldInvoiceHistoryRow = {
  invoiceVersionId: string;
  invoiceNumber: string | null;
  versionNumber: number;
  workOrderId: string;
  workOrderNumber: string | null;
  lifecycleStatus: string;
  paymentState: Exclude<FieldInvoiceFilter, "all">;
  currency: string;
  total: number;
  paidTotal: number;
  refundedTotal: number;
  outstandingTotal: number;
  issuedAt: string | null;
  updatedAt: string | null;
  paidAt: string | null;
  customerName: string;
  customerEmail: string | null;
  vehicleLabel: string;
  licensePlate: string | null;
};

function numberValue(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function singleRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function customerName(workOrder: FieldInvoiceWorkOrder): string {
  const customer = singleRelation(workOrder.customers);
  return [
    customer?.first_name ?? "",
    customer?.last_name ?? "",
  ]
    .filter(Boolean)
    .join(" ") || "No customer";
}

function vehicleLabel(workOrder: FieldInvoiceWorkOrder): string {
  const vehicle = singleRelation(workOrder.vehicles);
  return [
    vehicle?.year ?? "",
    vehicle?.make ?? "",
    vehicle?.model ?? "",
  ]
    .filter(Boolean)
    .join(" ") || "Vehicle not linked";
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildFieldInvoiceHistoryRows(
  workOrders: FieldInvoiceWorkOrder[],
  versions: FieldInvoiceVersion[],
): FieldInvoiceHistoryRow[] {
  const latestByWorkOrder = new Map<string, FieldInvoiceVersion>();

  for (const version of versions) {
    if (!FIELD_INVOICE_ACTIVE_STATES.includes(
      version.lifecycle_status as (typeof FIELD_INVOICE_ACTIVE_STATES)[number],
    )) {
      continue;
    }
    const current = latestByWorkOrder.get(version.work_order_id);
    if (!current || version.version_number > current.version_number) {
      latestByWorkOrder.set(version.work_order_id, version);
    }
  }

  return workOrders
    .flatMap((workOrder): FieldInvoiceHistoryRow[] => {
      const version = latestByWorkOrder.get(workOrder.id);
      if (!version) return [];

      const outstandingTotal = numberValue(version.outstanding_total);
      const customer = singleRelation(workOrder.customers);
      const vehicle = singleRelation(workOrder.vehicles);
      const invoice = singleRelation(version.invoices);
      const paymentState =
        version.lifecycle_status === "paid" || outstandingTotal <= 0.005
          ? "paid"
          : "unpaid";

      return [
        {
          invoiceVersionId: version.id,
          invoiceNumber: invoice?.invoice_number ?? null,
          versionNumber: version.version_number,
          workOrderId: workOrder.id,
          workOrderNumber: workOrder.custom_id,
          lifecycleStatus: version.lifecycle_status,
          paymentState,
          currency: version.currency.toUpperCase() || "CAD",
          total: numberValue(version.total),
          paidTotal: numberValue(version.paid_total),
          refundedTotal: numberValue(version.refunded_total),
          outstandingTotal,
          issuedAt: version.issued_at,
          updatedAt: workOrder.updated_at,
          paidAt: workOrder.paid_at,
          customerName: customerName(workOrder),
          customerEmail: customer?.email ?? null,
          vehicleLabel: vehicleLabel(workOrder),
          licensePlate: vehicle?.license_plate ?? null,
        },
      ];
    })
    .sort(
      (left, right) =>
        timestamp(right.issuedAt ?? right.updatedAt) -
        timestamp(left.issuedAt ?? left.updatedAt),
    );
}

export function filterFieldInvoiceHistoryRows(
  rows: FieldInvoiceHistoryRow[],
  filter: FieldInvoiceFilter,
  query: string,
): FieldInvoiceHistoryRow[] {
  const normalizedQuery = query.trim().toLowerCase();

  return rows.filter((row) => {
    if (filter !== "all" && row.paymentState !== filter) return false;
    if (!normalizedQuery) return true;

    return [
      row.invoiceNumber,
      row.workOrderNumber,
      row.customerName,
      row.customerEmail,
      row.vehicleLabel,
      row.licensePlate,
    ].some((value) => value?.toLowerCase().includes(normalizedQuery));
  });
}

export function summarizeFieldInvoiceHistory(rows: FieldInvoiceHistoryRow[]) {
  const unpaid = rows.filter((row) => row.paymentState === "unpaid");
  const paid = rows.filter((row) => row.paymentState === "paid");
  return {
    unpaidCount: unpaid.length,
    paidCount: paid.length,
    outstandingByCurrency: unpaid.reduce<Record<string, number>>(
      (totals, row) => {
        totals[row.currency] =
          numberValue(totals[row.currency]) + row.outstandingTotal;
        return totals;
      },
      {},
    ),
  };
}
