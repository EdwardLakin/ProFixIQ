import type { OnboardingDomain } from "./domains";
import { normalizePhone } from "./fingerprints";

const value = (row: Record<string, string>, keys: string[]): string => {
  for (const key of keys) {
    const found = Object.entries(row).find(([header]) => header.toLowerCase().replace(/[_-]+/g, " ").trim() === key);
    if (found?.[1]) return found[1].trim();
  }
  return "";
};

export function normalizeRow(domain: OnboardingDomain, row: Record<string, string>) {
  if (domain === "customers") {
    const name = value(row, ["customer name", "full name", "name"]);
    const [firstName = "", ...rest] = name.split(" ");
    return {
      entityType: "customer",
      displayName: name || value(row, ["company name", "company"]),
      normalized: {
        sourceCustomerId: value(row, ["customer id", "id"]),
        name,
        firstName,
        lastName: rest.join(" "),
        businessName: value(row, ["company", "company name", "business"]),
        email: value(row, ["email"]).toLowerCase(),
        phone: normalizePhone(value(row, ["phone", "phone number"])),
      },
    };
  }

  if (domain === "vehicles") {
    return {
      entityType: "vehicle",
      displayName: `${value(row, ["year"])} ${value(row, ["make"])} ${value(row, ["model"])} ${value(row, ["vin"])}`.trim(),
      normalized: {
        sourceVehicleId: value(row, ["vehicle id", "id"]),
        sourceCustomerId: value(row, ["customer id"]),
        vin: value(row, ["vin"]).toUpperCase().replace(/\s+/g, ""),
        plate: value(row, ["plate", "license"]).toUpperCase().replace(/\s+/g, ""),
        unitNumber: value(row, ["unit", "unit number"]),
        year: value(row, ["year"]),
        make: value(row, ["make"]),
        model: value(row, ["model"]),
      },
    };
  }

  if (domain === "history") {
    return {
      entityType: "historical_work_order",
      displayName: value(row, ["work order", "repair order", "ro", "ro id"]),
      normalized: {
        sourceWorkOrderId: value(row, ["work order", "ro id", "repair order"]),
        sourceCustomerId: value(row, ["customer id"]),
        sourceVehicleId: value(row, ["vehicle id"]),
        complaint: value(row, ["complaint", "description"]),
        cause: value(row, ["cause"]),
        correction: value(row, ["correction"]),
        laborAmount: value(row, ["labor"]),
        total: value(row, ["total"]),
        closedDate: value(row, ["closed", "completed date", "closed date"]),
      },
    };
  }

  if (domain === "invoices") {
    return {
      entityType: "historical_invoice",
      displayName: value(row, ["invoice", "invoice number"]),
      normalized: {
        invoiceNumber: value(row, ["invoice", "invoice number"]),
        sourceWorkOrderId: value(row, ["work order", "ro", "ro id"]),
        sourceCustomerId: value(row, ["customer id"]),
        total: value(row, ["total", "amount"]),
        laborAmount: value(row, ["labor"]),
        partsAmount: value(row, ["parts"]),
        issueDate: value(row, ["issue date", "date"]),
        paymentStatus: value(row, ["status", "payment status"]),
      },
    };
  }

  if (domain === "staff") {
    return {
      entityType: "staff_candidate",
      displayName: value(row, ["name", "full name", "employee"]),
      normalized: {
        name: value(row, ["name", "full name", "employee"]),
        email: value(row, ["email"]).toLowerCase(),
        phone: normalizePhone(value(row, ["phone"])),
        role: value(row, ["role"]),
      },
    };
  }

  return {
    entityType: "unknown",
    displayName: null,
    normalized: row,
  };
}
