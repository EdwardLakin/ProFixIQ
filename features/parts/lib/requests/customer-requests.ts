/**
 * Customer portal parts quote requests that have not been approved yet live in
 * the "Customer requests" section of the Parts queue. Once the customer
 * approves, the linked request is released and flows through the regular
 * order/receive queue like any other approved Parts request.
 */
export const CUSTOMER_REQUEST_PRE_APPROVAL_STATUSES = ["requested", "quoted", "sent"] as const;

export type CustomerPartsRequestRow = {
  id: string;
  status: string;
  description: string;
  notes: string | null;
  qty: number;
  partRequestId: string | null;
  customerName: string | null;
  vehicleLabel: string | null;
  total: number | null;
  currency: string;
  approvalChoice: string | null;
  paid: boolean;
  workOrderId: string | null;
  /** Staff alert raised by a refund, dispute or an unapplied prepayment. */
  paymentAttention: string | null;
  /** Amount of the customer's payment credited to an invoice, in dollars. */
  prepaidApplied: number;
  createdAt: string;
  sentAt: string | null;
  approvedAt: string | null;
};

export type CustomerRequestStatus =
  | "requested"
  | "quoted"
  | "sent"
  | "approved"
  | "declined"
  | "cancelled";

export function isPreApprovalCustomerRequest(status: string): boolean {
  return (CUSTOMER_REQUEST_PRE_APPROVAL_STATUSES as readonly string[]).includes(status);
}

export function customerRequestStatusLabel(status: string, paid: boolean): string {
  if (status === "approved") return paid ? "Approved and paid — order parts" : "Approved — order parts";
  switch (status) {
    case "requested":
      return "Needs pricing";
    case "quoted":
      return "Priced — sending to customer";
    case "sent":
      return "Sent — waiting for customer";
    case "declined":
      return "Declined by customer";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

/** Part request ids still owned by the customer-request section (not the queue). */
export function hiddenPartRequestIds(
  requests: ReadonlyArray<{ status: string; partRequestId: string | null }>,
): Set<string> {
  const ids = new Set<string>();
  for (const request of requests) {
    if (request.partRequestId && isPreApprovalCustomerRequest(request.status)) {
      ids.add(request.partRequestId);
    }
  }
  return ids;
}

/** Plain-language staff alert for a parts quote payment that needs attention. */
export function paymentAttentionLabel(attention: string | null): string | null {
  switch (attention) {
    case "refunded":
      return "Customer payment was refunded";
    case "partially_refunded":
      return "Customer payment was partly refunded";
    case "dispute_open":
      return "Payment dispute open";
    case "dispute_lost":
      return "Payment dispute lost";
    case "credit_unapplied":
      return "Prepaid amount is more than the invoice — review the leftover credit";
    case "ledger_mismatch":
      return "Payment could not be matched to the invoice — review the ledger";
    default:
      return null;
  }
}
