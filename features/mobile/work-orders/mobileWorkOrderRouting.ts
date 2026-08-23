export function resolveMobileWorkOrderHref(input: {
  workOrderId: string;
  status: string;
  readyToInvoiceCloseout: boolean;
  inspectionTemplateId?: string | null;
  returnTo?: string | null;
}): string {
  const workOrderId = encodeURIComponent(input.workOrderId);
  const pathname =
    input.readyToInvoiceCloseout && input.status === "ready_to_invoice"
      ? `/mobile/service/closeout/${workOrderId}`
      : `/mobile/work-orders/${workOrderId}`;
  const query = new URLSearchParams();
  const templateId = input.inspectionTemplateId?.trim();
  if (templateId) query.set("templateId", templateId);
  const returnTo = resolveMobileWorkOrderReturnHref(input.returnTo);
  if (returnTo) query.set("returnTo", returnTo);

  const encodedQuery = query.toString();
  return encodedQuery ? `${pathname}?${encodedQuery}` : pathname;
}

export function buildMobileWorkOrderListHref(input: {
  status?: string | null;
  readyToInvoiceCloseout?: boolean;
  inspectionTemplateId?: string | null;
}): string {
  const query = new URLSearchParams();
  const status = input.status?.trim();
  if (status) query.set("status", status);
  if (input.readyToInvoiceCloseout && status === "ready_to_invoice") {
    query.set("mode", "field_closeout");
  }
  const templateId = input.inspectionTemplateId?.trim();
  if (templateId) query.set("templateId", templateId);
  const encodedQuery = query.toString();
  return encodedQuery
    ? `/mobile/work-orders?${encodedQuery}`
    : "/mobile/work-orders";
}

/** Only the mobile Work Orders list is accepted as a detail-page return URL. */
export function resolveMobileWorkOrderReturnHref(
  value: string | null | undefined,
): string | null {
  const candidate = String(value ?? "").trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate, "https://mobile.profixiq.local");
    if (
      parsed.origin !== "https://mobile.profixiq.local" ||
      parsed.pathname !== "/mobile/work-orders"
    ) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}
