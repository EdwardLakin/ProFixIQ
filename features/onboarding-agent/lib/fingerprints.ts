import type { OnboardingDomain } from "./domains";

export function normalizePhone(phone?: string | null): string | null {
  const digits = String(phone ?? "").replace(/\D+/g, "");
  return digits.length >= 7 ? digits : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function fingerprintForDomain(domain: OnboardingDomain, normalized: Record<string, unknown>): string | null {
  if (domain === "customers") {
    const source = text(normalized.sourceCustomerId);
    if (source) return `customer:source:${source}`;
    const email = text(normalized.email).toLowerCase();
    if (email) return `customer:email:${email}`;
    const phone = normalizePhone(text(normalized.phone));
    if (phone) return `customer:phone:${phone}`;
    const name = text(normalized.name) || text(normalized.businessName);
    if (name) return `customer:name:${name.toLowerCase()}`;
    return null;
  }

  if (domain === "vehicles") {
    const vin = text(normalized.vin).toUpperCase();
    if (vin) return `vehicle:vin:${vin}`;
    const plate = text(normalized.plate).toUpperCase();
    if (plate) return `vehicle:plate:${plate}`;
    const sourceVehicleId = text(normalized.sourceVehicleId);
    if (sourceVehicleId) return `vehicle:source:${sourceVehicleId}`;
    const unit = text(normalized.unitNumber);
    const customerId = text(normalized.sourceCustomerId);
    if (unit && customerId) return `vehicle:unit_customer:${unit}:${customerId}`;
    return null;
  }

  if (domain === "history") {
    const sourceWorkOrderId = text(normalized.sourceWorkOrderId);
    return sourceWorkOrderId ? `history:wo:${sourceWorkOrderId}` : null;
  }

  if (domain === "invoices") {
    const invoice = text(normalized.invoiceNumber);
    if (invoice) return `invoice:number:${invoice}`;
    const sourceWorkOrderId = text(normalized.sourceWorkOrderId);
    return sourceWorkOrderId ? `invoice:wo:${sourceWorkOrderId}` : null;
  }

  if (domain === "parts") {
    const sku = text(normalized.sku) || text(normalized.partNumber);
    if (sku) return `part:sku:${sku.toLowerCase()}`;
    const description = text(normalized.description) || text(normalized.name);
    return description ? `part:name:${description.toLowerCase()}` : null;
  }

  if (domain === "vendors") {
    const account = text(normalized.accountNumber);
    if (account) return `vendor:account:${account.toLowerCase()}`;
    const email = text(normalized.email).toLowerCase();
    if (email) return `vendor:email:${email}`;
    const phone = normalizePhone(text(normalized.phone));
    if (phone) return `vendor:phone:${phone}`;
    const name = text(normalized.name);
    return name ? `vendor:name:${name.toLowerCase()}` : null;
  }

  if (domain === "staff") {
    const email = text(normalized.email).toLowerCase();
    if (email) return `staff:email:${email}`;
    const name = text(normalized.name);
    return name ? `staff:name:${name.toLowerCase()}` : null;
  }

  if (domain === "menu") {
    const opCode = text(normalized.opCode);
    if (opCode) return `menu:op:${opCode.toLowerCase()}`;
    const serviceName = text(normalized.serviceName);
    if (serviceName) return `menu:name:${serviceName.toLowerCase()}`;
    const description = text(normalized.description);
    return description ? `menu:description:${description.toLowerCase()}` : null;
  }

  return null;
}
