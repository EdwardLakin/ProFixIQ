import type { OnboardingDomain } from "./domains";

export function normalizePhone(phone?: string | null): string | null {
  const digits = String(phone ?? "").replace(/\D+/g, "");
  return digits.length >= 7 ? digits : null;
}

export function fingerprintForDomain(domain: OnboardingDomain, normalized: Record<string, unknown>): string | null {
  if (domain === "customers") {
    return String(normalized.sourceCustomerId ?? normalized.email ?? normalized.phone ?? normalized.name ?? "").trim() || null;
  }
  if (domain === "vehicles") {
    return String(normalized.vin ?? normalized.plate ?? normalized.unitNumber ?? normalized.sourceVehicleId ?? "").trim() || null;
  }
  if (domain === "history") {
    return String(normalized.sourceWorkOrderId ?? normalized.roNumber ?? "").trim() || null;
  }
  if (domain === "invoices") {
    return String(normalized.invoiceNumber ?? normalized.sourceWorkOrderId ?? "").trim() || null;
  }
  return String(normalized.sourceExternalId ?? "").trim() || null;
}
