export type PlannerPayload = {
  goal?: string;
  customerQuery?: string;
  customerId?: string;
  vehicleId?: string;
  plateOrVin?: string;
  emailInvoiceTo?: string;
  bookingId?: string;
  workOrderId?: string;
  allowCreate?: boolean;
  autorun?: boolean;
  planner?: "ops" | "openai" | "simple" | "fleet" | "approvals";
};

export function buildPlannerHref(payload: PlannerPayload): string {
  const params = new URLSearchParams();

  if (payload.goal) params.set("goal", payload.goal);
  if (payload.customerQuery) params.set("customerQuery", payload.customerQuery);
  if (payload.customerId) params.set("customerId", payload.customerId);
  if (payload.vehicleId) params.set("vehicleId", payload.vehicleId);
  if (payload.plateOrVin) params.set("plateOrVin", payload.plateOrVin);
  if (payload.emailInvoiceTo) params.set("emailInvoiceTo", payload.emailInvoiceTo);
  if (payload.bookingId) params.set("bookingId", payload.bookingId);
  if (payload.workOrderId) params.set("workOrderId", payload.workOrderId);
  if (typeof payload.allowCreate === "boolean") {
    params.set("allowCreate", payload.allowCreate ? "1" : "0");
  }
  if (typeof payload.autorun === "boolean" && payload.autorun) {
    params.set("autorun", "1");
  }
  if (payload.planner) params.set("planner", payload.planner);

  const qs = params.toString();
  return qs ? `/agent/planner?${qs}` : "/agent/planner";
}
