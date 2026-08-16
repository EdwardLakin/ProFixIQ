export function resolveMobileWorkOrderHref(input: {
  workOrderId: string;
  status: string;
  readyToInvoiceCloseout: boolean;
}): string {
  const workOrderId = encodeURIComponent(input.workOrderId);
  return input.readyToInvoiceCloseout && input.status === "ready_to_invoice"
    ? `/mobile/service/closeout/${workOrderId}`
    : `/mobile/work-orders/${workOrderId}`;
}
