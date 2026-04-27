import { makeReviewItem } from "@/features/onboarding-agent/lib/staging";

type Entity = {
  id: string;
  entity_type: string;
  display_name?: string | null;
  normalized: Record<string, unknown>;
  source_external_id?: string | null;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeName(value: unknown): string {
  return text(value).toLowerCase();
}

type BuildLinksParams = {
  entities: Entity[];
  shopId: string;
  sessionId: string;
};

export function buildStagedLinks(params: BuildLinksParams) {
  const { entities, shopId, sessionId } = params;
  const links: Array<{ from_entity_id: string; to_entity_id: string; link_type: string; confidence: number; evidence: Record<string, unknown>; status: string }> = [];
  const reviewItems: ReturnType<typeof makeReviewItem>[] = [];

  const customers = entities.filter((entity) => entity.entity_type === "customer");
  const vehicles = entities.filter((entity) => entity.entity_type === "vehicle");
  const workOrders = entities.filter((entity) => entity.entity_type === "historical_work_order");
  const invoices = entities.filter((entity) => entity.entity_type === "historical_invoice");
  const parts = entities.filter((entity) => entity.entity_type === "part");
  const vendors = entities.filter((entity) => entity.entity_type === "vendor");

  const customersBySourceId = new Map(customers.map((c) => [text(c.normalized.sourceCustomerId), c]));
  const customersByEmail = new Map(customers.map((c) => [text(c.normalized.email).toLowerCase(), c]));
  const customersByPhone = new Map(customers.map((c) => [text(c.normalized.phone), c]));
  const customersByName = new Map(customers.map((c) => [normalizeName(c.normalized.name || c.normalized.businessName), c]));

  const vehiclesBySourceId = new Map(vehicles.map((v) => [text(v.normalized.sourceVehicleId), v]));
  const vehiclesByVin = new Map(vehicles.map((v) => [text(v.normalized.vin).toUpperCase(), v]));
  const vehiclesByPlate = new Map(vehicles.map((v) => [text(v.normalized.plate).toUpperCase(), v]));

  const workOrdersBySourceId = new Map(workOrders.map((wo) => [text(wo.normalized.sourceWorkOrderId), wo]));

  const pushLink = (from: string, to: string, linkType: string, confidence: number, evidence: Record<string, unknown>) => {
    if (confidence < 0.75) {
      reviewItems.push(
        makeReviewItem({
          shopId,
          sessionId,
          severity: "medium",
          domain: linkType,
          issueType: "low_confidence_mapping",
          summary: `${linkType} mapping confidence too low`,
          details: evidence,
        }),
      );
      return;
    }

    links.push({
      from_entity_id: from,
      to_entity_id: to,
      link_type: linkType,
      confidence,
      evidence,
      status: confidence >= 0.75 ? "staged" : "needs_review",
    });
  };

  for (const vehicle of vehicles) {
    const sourceCustomerId = text(vehicle.normalized.sourceCustomerId);
    const customerEmail = text(vehicle.normalized.customerEmail).toLowerCase();
    const customerPhone = text(vehicle.normalized.customerPhone);
    const customerName = normalizeName(vehicle.normalized.customerName);

    let matched: Entity | undefined;
    let confidence = 0;
    let evidence: Record<string, unknown> = {};

    if (sourceCustomerId && customersBySourceId.get(sourceCustomerId)) {
      matched = customersBySourceId.get(sourceCustomerId);
      confidence = 0.95;
      evidence = { sourceCustomerId };
    } else if (customerEmail && customersByEmail.get(customerEmail)) {
      matched = customersByEmail.get(customerEmail);
      confidence = 0.85;
      evidence = { customerEmail };
    } else if (customerPhone && customersByPhone.get(customerPhone)) {
      matched = customersByPhone.get(customerPhone);
      confidence = 0.85;
      evidence = { customerPhone };
    } else if (customerName && customersByName.get(customerName)) {
      matched = customersByName.get(customerName);
      confidence = 0.75;
      evidence = { customerName };
    }

    if (!matched) {
      reviewItems.push(
        makeReviewItem({
          shopId,
          sessionId,
          severity: "high",
          domain: "vehicles",
          issueType: "missing_customer_link",
          summary: "Vehicle is missing a confident customer link",
          details: { vehicleId: vehicle.id, sourceCustomerId, customerEmail, customerPhone, customerName },
        }),
      );
      continue;
    }

    pushLink(matched.id, vehicle.id, "customer_vehicle", confidence, evidence);
  }

  for (const workOrder of workOrders) {
    const sourceCustomerId = text(workOrder.normalized.sourceCustomerId);
    const sourceVehicleId = text(workOrder.normalized.sourceVehicleId);
    const vehicleVin = text(workOrder.normalized.vehicleVin).toUpperCase();
    const vehiclePlate = text(workOrder.normalized.vehiclePlate).toUpperCase();

    const customer = sourceCustomerId ? customersBySourceId.get(sourceCustomerId) : undefined;
    if (customer) {
      pushLink(customer.id, workOrder.id, "customer_work_order", 0.95, { sourceCustomerId });
    } else {
      reviewItems.push(
        makeReviewItem({
          shopId,
          sessionId,
          severity: "high",
          domain: "history",
          issueType: "missing_customer_link",
          summary: "Work order is missing customer linkage",
          details: { workOrderId: workOrder.id, sourceCustomerId },
        }),
      );
    }

    const vehicle = vehiclesBySourceId.get(sourceVehicleId) || vehiclesByVin.get(vehicleVin) || vehiclesByPlate.get(vehiclePlate);
    if (vehicle) {
      const confidence = sourceVehicleId ? 0.95 : vehicleVin ? 0.9 : 0.75;
      pushLink(vehicle.id, workOrder.id, "vehicle_work_order", confidence, { sourceVehicleId, vehicleVin, vehiclePlate });
    } else {
      reviewItems.push(
        makeReviewItem({
          shopId,
          sessionId,
          severity: "medium",
          domain: "history",
          issueType: "missing_vehicle_link",
          summary: "Work order is missing vehicle linkage",
          details: { workOrderId: workOrder.id, sourceVehicleId, vehicleVin, vehiclePlate },
        }),
      );
    }
  }

  for (const invoice of invoices) {
    const sourceWorkOrderId = text(invoice.normalized.sourceWorkOrderId);
    const workOrder = sourceWorkOrderId ? workOrdersBySourceId.get(sourceWorkOrderId) : undefined;
    if (workOrder) {
      pushLink(workOrder.id, invoice.id, "work_order_invoice", 0.95, { sourceWorkOrderId });
    } else {
      reviewItems.push(
        makeReviewItem({
          shopId,
          sessionId,
          severity: "high",
          domain: "invoices",
          issueType: "missing_work_order_link",
          summary: "Invoice is missing work-order linkage",
          details: { invoiceId: invoice.id, sourceWorkOrderId },
        }),
      );
    }
  }

  for (const part of parts) {
    const vendorName = normalizeName(part.normalized.vendorName);
    const match = vendors.find((vendor) => {
      const vendorKey = normalizeName(vendor.normalized.name);
      return vendorName && vendorKey && vendorName === vendorKey;
    });
    if (match) {
      pushLink(match.id, part.id, "vendor_part", 0.75, { vendorName });
    }
  }

  const dedupedLinks = links.filter(
    (link, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.link_type === link.link_type &&
          candidate.from_entity_id === link.from_entity_id &&
          candidate.to_entity_id === link.to_entity_id,
      ) === index,
  );

  return { links: dedupedLinks, reviewItems };
}
