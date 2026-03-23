import type { AssistantContext } from "../types/assistant";

export function buildAssistantHref(context?: AssistantContext): string {
  const params = new URLSearchParams();

  if (context?.workOrderId) params.set("workOrderId", context.workOrderId);
  if (context?.vehicleId) params.set("vehicleId", context.vehicleId);
  if (context?.customerId) params.set("customerId", context.customerId);
  if (context?.bookingId) params.set("bookingId", context.bookingId);
  if (context?.pageType) params.set("pageType", context.pageType);
  if (context?.pageTitle) params.set("pageTitle", context.pageTitle);

  const qs = params.toString();
  return qs ? `/assistant?${qs}` : "/assistant";
}
