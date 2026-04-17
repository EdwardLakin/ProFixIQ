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
  lane?:
    | "parts_follow_up"
    | "low_inventory_reorder"
    | "fleet_follow_up"
    | "menu_item_draft"
    | "inspection_template_draft"
    | "service_bundle_draft";
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
  if (payload.lane) params.set("lane", payload.lane);

  const qs = params.toString();
  return qs ? `/agent/planner?${qs}` : "/agent/planner";
}
