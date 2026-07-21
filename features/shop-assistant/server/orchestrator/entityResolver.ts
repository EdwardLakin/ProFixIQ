import "server-only";

import type {
  ShopAssistantContext,
  ShopAssistantThreadContext,
} from "@/features/shop-assistant/types";

export type ResolvedOrchestratorEntities = {
  context: ShopAssistantContext;
  threadContext: ShopAssistantThreadContext;
  contextSummary: string;
};

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function resolveOrchestratorEntities(params: {
  pageContext?: ShopAssistantContext;
  threadContext: ShopAssistantThreadContext;
}): ResolvedOrchestratorEntities {
  const context: ShopAssistantContext = {
    workOrderId:
      clean(params.pageContext?.workOrderId) ??
      clean(params.threadContext.activeWorkOrderId),
    vehicleId:
      clean(params.pageContext?.vehicleId) ??
      clean(params.threadContext.activeVehicleId),
    customerId:
      clean(params.pageContext?.customerId) ??
      clean(params.threadContext.activeCustomerId),
    bookingId:
      clean(params.pageContext?.bookingId) ??
      clean(params.threadContext.activeBookingId),
    invoiceId:
      clean(params.pageContext?.invoiceId) ??
      clean(params.threadContext.activeInvoiceId),
    pageType: clean(params.pageContext?.pageType),
    pageTitle: clean(params.pageContext?.pageTitle),
  };

  const threadContext: ShopAssistantThreadContext = {
    ...params.threadContext,
    activeWorkOrderId: context.workOrderId,
    activeVehicleId: context.vehicleId,
    activeCustomerId: context.customerId,
    activeBookingId: context.bookingId,
    activeInvoiceId: context.invoiceId,
  };

  const contextSummary = [
    context.workOrderId ? `Active work order: ${context.workOrderId}` : null,
    context.vehicleId ? `Active vehicle: ${context.vehicleId}` : null,
    context.customerId ? `Active customer: ${context.customerId}` : null,
    context.bookingId ? `Active appointment: ${context.bookingId}` : null,
    context.invoiceId ? `Active invoice: ${context.invoiceId}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return { context, threadContext, contextSummary };
}
