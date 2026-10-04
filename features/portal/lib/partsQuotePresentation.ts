export type PortalPartsQuoteStatus =
  | "requested"
  | "quoted"
  | "sent"
  | "approved"
  | "declined"
  | "cancelled";

export type PortalPartsQuoteChoice = "order_parts" | "book_install";

export type PortalPartsQuoteItem = {
  id: string;
  description: string;
  partNumber: string | null;
  qty: number;
  unitPrice: number | null;
  lineTotal: number | null;
};

/** Customer-visible shape. Never carries cost, vendor, or staff-only fields. */
export type PortalPartsQuote = {
  id: string;
  status: PortalPartsQuoteStatus;
  paid: boolean;
  description: string;
  notes: string | null;
  qty: number;
  vehicleLabel: string | null;
  currency: "cad" | "usd";
  subtotal: number | null;
  taxTotal: number | null;
  total: number | null;
  items: PortalPartsQuoteItem[];
  approvalChoice: PortalPartsQuoteChoice | null;
  createdAt: string;
  sentAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  paidAt: string | null;
};

export const PORTAL_PARTS_QUOTE_PAYMENT_PURPOSE = "portal_parts_quote_payment";

export function isPortalPartsQuoteStatus(
  value: unknown,
): value is PortalPartsQuoteStatus {
  return (
    value === "requested" ||
    value === "quoted" ||
    value === "sent" ||
    value === "approved" ||
    value === "declined" ||
    value === "cancelled"
  );
}

export function partsQuoteStatusLabel(
  status: PortalPartsQuoteStatus,
  paid: boolean,
): string {
  if (paid) return "Paid";
  switch (status) {
    case "requested":
    case "quoted":
      return "Parts is preparing your quote";
    case "sent":
      return "Quote ready for your approval";
    case "approved":
      return "Approved";
    case "declined":
      return "Declined";
    case "cancelled":
      return "Cancelled";
  }
}

export function partsQuoteNeedsDecision(status: PortalPartsQuoteStatus): boolean {
  return status === "sent";
}

export function partsQuoteCanPay(
  status: PortalPartsQuoteStatus,
  paid: boolean,
  total: number | null,
): boolean {
  return status === "approved" && !paid && (total ?? 0) > 0;
}

export function formatPartsQuoteMoney(
  amount: number | null | undefined,
  currency: string,
): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency.toUpperCase() === "USD" ? "USD" : "CAD",
  }).format(amount);
}

export function partsQuoteTotalCents(total: number | null | undefined): number {
  const cents = Math.round(Number(total ?? 0) * 100);
  return Number.isFinite(cents) && cents > 0 ? cents : 0;
}
