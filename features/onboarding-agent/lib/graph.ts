import { makeReviewItem } from "@/features/onboarding-agent/lib/staging";

type Entity = {
  id: string;
  entity_type: string;
  status?: string | null;
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
  const { shopId, sessionId } = params;
  const entities = params.entities.filter((entity) => (entity.status ?? "ready") === "ready");
  const links: Array<{ from_entity_id: string; to_entity_id: string; link_type: string; confidence: number; evidence: Record<string, unknown>; status: string }> = [];
  const reviewItems: ReturnType<typeof makeReviewItem>[] = [];

  const customers = entities.filter((entity) => entity.entity_type === "customer");
  const vehicles = entities.filter((entity) => entity.entity_type === "vehicle");
  const workOrders = entities.filter((entity) => entity.entity_type === "historical_work_order");
  const invoices = entities.filter((entity) => entity.entity_type === "historical_invoice");
  const parts = entities.filter((entity) => entity.entity_type === "part");
  const vendors = entities.filter((entity) => entity.entity_type === "vendor");
  const menus = entities.filter((entity) => entity.entity_type === "menu_suggestion");

  const mapByNonEmpty = (items: Entity[], getKey: (entity: Entity) => string) => {
    const map = new Map<string, Entity>();
    for (const item of items) {
      const key = getKey(item);
      if (!key) continue;
      map.set(key, item);
    }
    return map;
  };

  const customersBySourceId = mapByNonEmpty(customers, (c) => text(c.normalized.sourceCustomerId));
  const customersByEmail = mapByNonEmpty(customers, (c) => text(c.normalized.email).toLowerCase());
  const customersByPhone = mapByNonEmpty(customers, (c) => text(c.normalized.phone));
  const customersByName = mapByNonEmpty(customers, (c) => normalizeName(c.normalized.name || c.normalized.businessName));

  const vehiclesBySourceId = mapByNonEmpty(vehicles, (v) => text(v.normalized.sourceVehicleId));
  const vehiclesByVin = mapByNonEmpty(vehicles, (v) => text(v.normalized.vin).toUpperCase());
  const vehiclesByPlate = mapByNonEmpty(vehicles, (v) => text(v.normalized.plate).toUpperCase());
  const vehiclesByUnit = mapByNonEmpty(vehicles, (v) => text(v.normalized.unitNumber).toUpperCase());

  const workOrdersBySourceId = mapByNonEmpty(workOrders, (wo) => text(wo.normalized.sourceWorkOrderId));
  const workOrdersByInvoiceId = mapByNonEmpty(workOrders, (wo) => text(wo.normalized.invoiceId));

  const pushLink = (from: string, to: string, linkType: string, confidence: number, evidence: Record<string, unknown>) => {
    if (confidence < 0.6 || !from || !to) return;

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
      evidence = { sourceCustomerId, matchStrategy: "source_id" };
    } else if (customerEmail && customersByEmail.get(customerEmail)) {
      matched = customersByEmail.get(customerEmail);
      confidence = 0.85;
      evidence = { customerEmail, matchStrategy: "email" };
    } else if (customerPhone && customersByPhone.get(customerPhone)) {
      matched = customersByPhone.get(customerPhone);
      confidence = 0.84;
      evidence = { customerPhone, matchStrategy: "phone" };
    } else if (customerName && customersByName.get(customerName)) {
      matched = customersByName.get(customerName);
      confidence = 0.72;
      evidence = { customerName, matchStrategy: "name" };
    }

    if (!matched) {
      reviewItems.push(
        makeReviewItem({
          shopId,
          sessionId,
          severity: "medium",
          domain: "vehicles",
          issueType: "missing_customer_link",
          summary: "Vehicle identity staged but customer link is missing",
          details: { sourceCustomerId, customerEmail, customerPhone, customerName, recommendedAction: "Provide customer identifier columns to improve vehicle linking." },
        }),
      );
      continue;
    }

    pushLink(matched.id, vehicle.id, "customer_vehicle", confidence, evidence);
  }

  for (const workOrder of workOrders) {
    const sourceCustomerId = text(workOrder.normalized.sourceCustomerId);
    const customerEmail = text(workOrder.normalized.customerEmail).toLowerCase();
    const customerName = normalizeName(workOrder.normalized.customerName);

    const customer = customersBySourceId.get(sourceCustomerId)
      || customersByEmail.get(customerEmail)
      || customersByName.get(customerName);

    if (customer) {
      const confidence = sourceCustomerId ? 0.95 : customerEmail ? 0.84 : 0.7;
      pushLink(customer.id, workOrder.id, "customer_work_order", confidence, { sourceCustomerId, customerEmail, customerName });
    } else {
      reviewItems.push(
        makeReviewItem({
          shopId,
          sessionId,
          severity: "medium",
          domain: "history",
          issueType: "missing_customer_link",
          summary: "Historical work order staged but customer link is missing",
          details: { sourceCustomerId, customerEmail, customerName, recommendedAction: "Map customer identifiers in work order history for stronger linking." },
        }),
      );
    }

    const sourceVehicleId = text(workOrder.normalized.sourceVehicleId);
    const vehicleVin = text(workOrder.normalized.vehicleVin).toUpperCase();
    const vehiclePlate = text(workOrder.normalized.vehiclePlate).toUpperCase();
    const vehicleUnit = text(workOrder.normalized.vehicleUnitNumber).toUpperCase();

    const vehicle = vehiclesBySourceId.get(sourceVehicleId)
      || vehiclesByVin.get(vehicleVin)
      || vehiclesByPlate.get(vehiclePlate)
      || vehiclesByUnit.get(vehicleUnit);

    if (vehicle) {
      const confidence = sourceVehicleId ? 0.95 : vehicleVin || vehiclePlate ? 0.86 : 0.72;
      pushLink(vehicle.id, workOrder.id, "vehicle_work_order", confidence, { sourceVehicleId, vehicleVin, vehiclePlate, vehicleUnit });
    } else {
      reviewItems.push(
        makeReviewItem({
          shopId,
          sessionId,
          severity: "medium",
          domain: "history",
          issueType: "missing_vehicle_link",
          summary: "Historical work order staged but vehicle link is missing",
          details: { sourceVehicleId, vehicleVin, vehiclePlate, vehicleUnit, recommendedAction: "Map vehicle VIN, plate, or vehicle ID in work order history." },
        }),
      );
    }
  }

  for (const invoice of invoices) {
    const sourceWorkOrderId = text(invoice.normalized.sourceWorkOrderId);
    const invoiceNumber = text(invoice.normalized.invoiceNumber);
    const workOrder = (sourceWorkOrderId ? workOrdersBySourceId.get(sourceWorkOrderId) : undefined)
      || (invoiceNumber ? workOrdersByInvoiceId.get(invoiceNumber) : undefined);
    if (workOrder) {
      pushLink(workOrder.id, invoice.id, "work_order_invoice", 0.95, { sourceWorkOrderId, invoiceNumber, matchStrategy: sourceWorkOrderId ? "source_id" : "invoice_number" });
    } else {
      reviewItems.push(
        makeReviewItem({
          shopId,
          sessionId,
          severity: "high",
          domain: "invoices",
          issueType: "missing_work_order_link",
          summary: "Historical invoice staged but work order link is missing",
          details: { sourceWorkOrderId, invoiceNumber, recommendedAction: "Include work order or repair order references in invoice data." },
        }),
      );
    }
  }

  for (const part of parts) {
    const vendorName = normalizeName(part.normalized.vendorName);
    if (!vendorName) continue;
    const match = vendors.find((vendor) => normalizeName(vendor.normalized.name) === vendorName);
    if (match) {
      pushLink(match.id, part.id, "vendor_part", 0.8, { vendorName, matchStrategy: "vendor_name" });
    } else {
      reviewItems.push(
        makeReviewItem({
          shopId,
          sessionId,
          severity: "medium",
          domain: "parts",
          issueType: "missing_vendor_link",
          summary: "Part staged but vendor link is missing",
          details: { vendorName, recommendedAction: "Upload vendor master data or align vendor naming." },
        }),
      );
    }
  }

  for (const menu of menus) {
    if (!text(menu.normalized.serviceName) && !text(menu.normalized.description) && !text(menu.normalized.opCode)) {
      reviewItems.push(
        makeReviewItem({
          shopId,
          sessionId,
          severity: "medium",
          domain: "menu",
          issueType: "missing_service_identity",
          summary: "Service catalog row is missing service identity",
          details: { opCode: menu.normalized.opCode },
        }),
      );
      continue;
    }

    pushLink(menu.id, menu.id, "service_menu_suggestion", 1, { type: "self" });
  }

  const dedupedLinks = links.filter(
    (link, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.link_type === link.link_type
          && candidate.from_entity_id === link.from_entity_id
          && candidate.to_entity_id === link.to_entity_id,
      ) === index,
  );

  return { links: dedupedLinks, reviewItems };
}
