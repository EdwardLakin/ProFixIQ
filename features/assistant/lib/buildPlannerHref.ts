export type PlannerPayload = {
  goal?: string;
  customerQuery?: string;
  plateOrVin?: string;
  emailInvoiceTo?: string;
  bookingId?: string;
  workOrderId?: string;
  allowCreate?: boolean;
  planner?: "ops" | "openai" | "simple" | "fleet" | "approvals";
};

export function buildPlannerHref(payload: PlannerPayload): string {
  const params = new URLSearchParams();

  if (payload.goal) params.set("goal", payload.goal);
  if (payload.customerQuery) params.set("customerQuery", payload.customerQuery);
  if (payload.plateOrVin) params.set("plateOrVin", payload.plateOrVin);
  if (payload.emailInvoiceTo) params.set("emailInvoiceTo", payload.emailInvoiceTo);
  if (payload.bookingId) params.set("bookingId", payload.bookingId);
  if (payload.workOrderId) params.set("workOrderId", payload.workOrderId);
  if (typeof payload.allowCreate === "boolean") {
    params.set("allowCreate", payload.allowCreate ? "1" : "0");
  }
  if (payload.planner) params.set("planner", payload.planner);

  const qs = params.toString();
  return qs ? `/agent/planner?${qs}` : "/agent/planner";
}
