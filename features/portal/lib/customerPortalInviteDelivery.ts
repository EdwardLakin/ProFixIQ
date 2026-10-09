export type CustomerPortalInviteDeliveryState =
  | "sending"
  | "awaiting_delivery"
  | "delivered"
  | "not_delivered"
  | "delivery_issue"
  | "delivery_unknown";

export type CustomerPortalInviteAccessStatus =
  | "sending"
  | "awaiting_delivery"
  | "not_delivered"
  | "delivery_issue"
  | "delivery_unknown"
  | "pending";

export function customerPortalInviteDeliveryState(
  status: string | null | undefined,
  deliveredAt?: string | null,
): CustomerPortalInviteDeliveryState {
  const event = status?.toLowerCase();

  // Terminal events must override an earlier delivery timestamp.
  switch (event) {
    case "suppressed":
    case "bounce":
    case "bounced":
    case "dropped":
      return "not_delivered";
    case "spamreport":
    case "unsubscribe":
    case "group_unsubscribe":
      return "delivery_issue";
  }

  // SendGrid engagement events replace status after delivery; delivered_at preserves it.
  if (deliveredAt || event === "delivered" || event === "open" || event === "click") {
    return "delivered";
  }

  switch (event) {
    case "queued":
      return "sending";
    case "accepted":
    case "processed":
    case "deferred":
      return "awaiting_delivery";
    case "failed":
      return "delivery_issue";
    default:
      return "delivery_unknown";
  }
}

export function customerPortalInviteAccessStatus(
  deliveryState: CustomerPortalInviteDeliveryState,
): CustomerPortalInviteAccessStatus {
  return deliveryState === "delivered" ? "pending" : deliveryState;
}
