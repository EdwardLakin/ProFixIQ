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

  // Engagement events can replace the latest status after a successful delivery.
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
    case "suppressed":
    case "bounce":
    case "bounced":
    case "dropped":
      return "not_delivered";
    case "failed":
    case "spamreport":
    case "unsubscribe":
    case "group_unsubscribe":
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
