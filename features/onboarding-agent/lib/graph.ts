export function buildSimpleLinks(entities: Array<{ id: string; entity_type: string; normalized: Record<string, unknown> }>) {
  const customersBySourceId = new Map<string, string>();
  const workOrdersBySourceId = new Map<string, string>();

  for (const entity of entities) {
    if (entity.entity_type === "customer") {
      const sourceCustomerId = String(entity.normalized.sourceCustomerId ?? "").trim();
      if (sourceCustomerId) customersBySourceId.set(sourceCustomerId, entity.id);
    }
    if (entity.entity_type === "historical_work_order") {
      const workOrderId = String(entity.normalized.sourceWorkOrderId ?? "").trim();
      if (workOrderId) workOrdersBySourceId.set(workOrderId, entity.id);
    }
  }

  const links: Array<{ from_entity_id: string; to_entity_id: string; link_type: string; confidence: number; evidence: Record<string, unknown> }> = [];

  for (const entity of entities) {
    if (entity.entity_type === "vehicle") {
      const customerSourceId = String(entity.normalized.sourceCustomerId ?? "").trim();
      const customerId = customersBySourceId.get(customerSourceId);
      if (customerId) {
        links.push({ from_entity_id: customerId, to_entity_id: entity.id, link_type: "customer_vehicle", confidence: 0.95, evidence: { sourceCustomerId: customerSourceId } });
      }
    }
    if (entity.entity_type === "historical_invoice") {
      const sourceWorkOrderId = String(entity.normalized.sourceWorkOrderId ?? "").trim();
      const workOrderEntityId = workOrdersBySourceId.get(sourceWorkOrderId);
      if (workOrderEntityId) {
        links.push({ from_entity_id: workOrderEntityId, to_entity_id: entity.id, link_type: "work_order_invoice", confidence: 0.95, evidence: { sourceWorkOrderId } });
      }
    }
  }

  return links;
}
