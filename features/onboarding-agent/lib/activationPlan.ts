export function buildDryRunActivationPlan(input: {
  sessionId: string;
  entityCounts: Record<string, number>;
  linkCounts: Record<string, number>;
  reviewBlocking: number;
  reviewNonBlocking: number;
}) {
  const risks: string[] = [];
  if (input.reviewBlocking > 0) risks.push(`${input.reviewBlocking} blocking review items must be resolved before activation.`);
  if ((input.entityCounts.historical_invoice ?? 0) > 0 && (input.linkCounts.work_order_invoice ?? 0) === 0) {
    risks.push("Historical invoices have no work order links yet.");
  }

  return {
    sessionId: input.sessionId,
    mode: "dry_run",
    creates: {
      customers: input.entityCounts.customer ?? 0,
      vehicles: input.entityCounts.vehicle ?? 0,
      historicalWorkOrders: input.entityCounts.historical_work_order ?? 0,
      historicalInvoices: input.entityCounts.historical_invoice ?? 0,
      parts: input.entityCounts.part ?? 0,
      vendors: input.entityCounts.vendor ?? 0,
      staffCandidates: input.entityCounts.staff_candidate ?? 0,
      menuSuggestions: input.entityCounts.menu_suggestion ?? 0,
      inspectionSuggestions: input.entityCounts.inspection_suggestion ?? 0,
    },
    links: {
      customerVehicle: input.linkCounts.customer_vehicle ?? 0,
      vehicleWorkOrder: input.linkCounts.vehicle_work_order ?? 0,
      workOrderInvoice: input.linkCounts.work_order_invoice ?? 0,
    },
    review: {
      blocking: input.reviewBlocking,
      nonblocking: input.reviewNonBlocking,
    },
    risks,
  };
}
