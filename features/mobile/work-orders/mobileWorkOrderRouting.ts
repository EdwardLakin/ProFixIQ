export function resolveMobileWorkOrderHref(input: {
  workOrderId: string;
  status: string;
  readyToInvoiceCloseout: boolean;
  inspectionTemplateId?: string | null;
}): string {
  const workOrderId = encodeURIComponent(input.workOrderId);
  const pathname =
    input.readyToInvoiceCloseout && input.status === "ready_to_invoice"
      ? `/mobile/service/closeout/${workOrderId}`
      : `/mobile/work-orders/${workOrderId}`;
  const templateId = input.inspectionTemplateId?.trim();
  if (!templateId) return pathname;

  const query = new URLSearchParams({ templateId });
  return `${pathname}?${query.toString()}`;
}
