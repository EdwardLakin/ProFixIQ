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
    const sourceVehicleId = text(normalized.sourceVehicleId);
    if (sourceVehicleId) return `vehicle:source:${sourceVehicleId}`;
    const vin = text(normalized.vin).toUpperCase();
    if (vin) return `vehicle:vin:${vin}`;
    const plate = text(normalized.plate).toUpperCase();
    if (plate) return `vehicle:plate:${plate}`;
    const unit = text(normalized.unitNumber);
    const customerId = text(normalized.sourceCustomerId);
    if (unit && customerId) return `vehicle:unit_customer:${unit}:${customerId}`;
    const year = text(normalized.year);
    const make = text(normalized.make);
    const model = text(normalized.model);
    if (year && make && model) return `vehicle:ymm:${year}:${make.toLowerCase()}:${model.toLowerCase()}`;
    return null;
  }

  if (domain === "history") {
    const sourceWorkOrderId = text(normalized.sourceWorkOrderId);
    if (sourceWorkOrderId) return `history:wo:${sourceWorkOrderId}`;
    const invoiceId = text(normalized.invoiceId);
    if (invoiceId) return `history:invoice:${invoiceId}`;
    const openedDate = text(normalized.openedDate);
    const narrative = text(normalized.complaint) || text(normalized.correction) || text(normalized.serviceDescription);
    const vin = text(normalized.vehicleVin).toUpperCase();
    if (openedDate && narrative) return `history:date_text:${openedDate}:${narrative.toLowerCase().slice(0, 120)}`;
    if (openedDate && vin) return `history:date_vin:${openedDate}:${vin}`;
    return null;
  }

  if (domain === "invoices") {
    const invoice = text(normalized.invoiceNumber);
    if (invoice) return `invoice:number:${invoice}`;
    const sourceWorkOrderId = text(normalized.sourceWorkOrderId);
    const invoiceDate = text(normalized.invoiceDate);
    const totalRaw = text(normalized.totalRaw);
    if (sourceWorkOrderId && invoiceDate) return `invoice:wo_date:${sourceWorkOrderId}:${invoiceDate}`;
    if (sourceWorkOrderId) return `invoice:wo:${sourceWorkOrderId}`;
    if (invoiceDate && totalRaw) return `invoice:date_total:${invoiceDate}:${totalRaw}`;
    return null;
  }

  if (domain === "parts") {
    const sku = text(normalized.sku) || text(normalized.partNumber);
    if (sku) return `part:sku:${sku.toLowerCase()}`;
    const description = text(normalized.description) || text(normalized.name);
    const vendor = text(normalized.vendorName);
    if (description && vendor) return `part:vendor_desc:${vendor.toLowerCase()}:${description.toLowerCase()}`;
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
    const category = text(normalized.category);
    if (description && category) return `menu:cat_desc:${category.toLowerCase()}:${description.toLowerCase().slice(0, 120)}`;
    return description ? `menu:description:${description.toLowerCase().slice(0, 120)}` : null;
  }

  return null;
}
