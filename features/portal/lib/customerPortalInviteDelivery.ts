export type CustomerPortalInviteAccessStatus =
  | "sending"
  | "awaiting_delivery"
  | "not_delivered"
  | "delivery_issue"
  | "delivery_unknown"
  | "pending";

export function customerPortalInviteAccessStatus(
  deliveryStatus: string | null | undefined,
): CustomerPortalInviteAccessStatus {
  switch (deliveryStatus?.toLowerCase()) {
    case "queued":
      return "sending";
    case "accepted":
      return "awaiting_delivery";
    case "delivered":
      return "pending";
    case "suppressed":
      return "not_delivered";
    case "failed":
    case "bounced":
    case "deferred":
    case "dropped":
    case "spamreport":
    case "unsubscribe":
      return "delivery_issue";
    default:
      return "delivery_unknown";
  }
}
