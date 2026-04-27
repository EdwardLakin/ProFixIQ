import type { OnboardingDomain } from "./domains";
import { normalizePhone } from "./fingerprints";

const normalizeKey = (value: string) => value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

const value = (row: Record<string, string>, keys: string[]): string => {
  const normalizedKeys = keys.map(normalizeKey);
  for (const [header, rawValue] of Object.entries(row)) {
    const key = normalizeKey(header);
    if (normalizedKeys.includes(key) && rawValue) return rawValue.trim();
  }
  return "";
};

function parseMoney(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeRow(domain: OnboardingDomain, row: Record<string, string>) {
  if (domain === "customers") {
    const name = value(row, ["customer name", "full name", "name"]);
    const [firstName = "", ...rest] = name.split(" ");
    return {
      entityType: "customer",
      displayName: name || value(row, ["company name", "company", "business"]),
      normalized: {
        sourceCustomerId: value(row, ["customer id", "id", "external customer id"]),
        name,
        firstName,
        lastName: rest.join(" "),
        businessName: value(row, ["company", "company name", "business"]),
        email: value(row, ["email", "email address"]).toLowerCase(),
        phone: normalizePhone(value(row, ["phone", "phone number", "mobile"])),
      },
    };
  }

  if (domain === "vehicles") {
    const year = value(row, ["year"]);
    const make = value(row, ["make"]);
    const model = value(row, ["model"]);
    const vin = value(row, ["vin"]).toUpperCase().replace(/\s+/g, "");

    return {
      entityType: "vehicle",
      displayName: `${year} ${make} ${model}`.trim() || vin || value(row, ["plate", "license"]),
      normalized: {
        sourceVehicleId: value(row, ["vehicle id", "id", "external vehicle id"]),
        sourceCustomerId: value(row, ["customer id"]),
        customerName: value(row, ["customer name", "name"]),
        customerEmail: value(row, ["customer email", "email"]),
        customerPhone: normalizePhone(value(row, ["customer phone", "phone"])),
        vin,
        plate: value(row, ["plate", "license", "license plate"]).toUpperCase().replace(/\s+/g, ""),
        unitNumber: value(row, ["unit", "unit number", "truck number"]),
        year,
        make,
        model,
      },
    };
  }

  if (domain === "history") {
    return {
      entityType: "historical_work_order",
      displayName: value(row, ["work order", "repair order", "ro", "ro id", "ro number"]),
      normalized: {
        sourceWorkOrderId: value(row, ["work order", "ro id", "repair order", "ro number"]),
        invoiceId: value(row, ["invoice id", "invoice number", "invoice"]),
        sourceCustomerId: value(row, ["customer id"]),
        customerEmail: value(row, ["customer email", "email"]).toLowerCase(),
        customerName: value(row, ["customer name", "name"]),
        sourceVehicleId: value(row, ["vehicle id"]),
        vehicleVin: value(row, ["vin"]).toUpperCase().replace(/\s+/g, ""),
        vehiclePlate: value(row, ["plate", "license"]).toUpperCase().replace(/\s+/g, ""),
        vehicleUnitNumber: value(row, ["unit", "unit number"]),
        complaint: value(row, ["complaint", "description", "concern"]),
        cause: value(row, ["cause"]),
        correction: value(row, ["correction", "resolution"]),
        openedDate: value(row, ["opened", "opened date", "open date", "date"]),
        closedDate: value(row, ["closed", "completed date", "closed date"]),
        totalRaw: value(row, ["total", "amount"]),
        total: parseMoney(value(row, ["total", "amount"])),
      },
    };
  }

  if (domain === "invoices") {
    const totalRaw = value(row, ["total", "amount"]);
    return {
      entityType: "historical_invoice",
      displayName: value(row, ["invoice", "invoice number"]),
      normalized: {
        invoiceNumber: value(row, ["invoice", "invoice number", "invoice id"]),
        sourceWorkOrderId: value(row, ["work order", "ro", "ro id", "repair order"]),
        sourceCustomerId: value(row, ["customer id"]),
        invoiceDate: value(row, ["issue date", "invoice date", "date"]),
        paymentStatus: value(row, ["status", "payment status"]),
        totalRaw,
        total: parseMoney(totalRaw),
      },
    };
  }

  if (domain === "parts") {
    return {
      entityType: "part",
      displayName: value(row, ["description", "name", "part"]),
      normalized: {
        sku: value(row, ["sku", "part sku"]),
        partNumber: value(row, ["part number", "part #", "number"]),
        description: value(row, ["description", "name", "part"]),
        vendorName: value(row, ["vendor", "supplier", "vendor name", "supplier name"]),
      },
    };
  }

  if (domain === "vendors") {
    return {
      entityType: "vendor",
      displayName: value(row, ["vendor", "supplier", "company", "vendor name", "supplier name"]),
      normalized: {
        name: value(row, ["vendor", "supplier", "company", "vendor name", "supplier name"]),
        email: value(row, ["email", "vendor email"]).toLowerCase(),
        phone: normalizePhone(value(row, ["phone", "vendor phone"])),
        accountNumber: value(row, ["account", "account number", "vendor account"]),
      },
    };
  }

  if (domain === "staff") {
    return {
      entityType: "staff_candidate",
      displayName: value(row, ["name", "full name", "employee"]),
      normalized: {
        name: value(row, ["name", "full name", "employee"]),
        email: value(row, ["email", "email address"]).toLowerCase(),
        phone: normalizePhone(value(row, ["phone", "mobile"])),
        role: value(row, ["role", "job title", "position", "technician", "advisor"]),
      },
    };
  }

  if (domain === "menu") {
    return {
      entityType: "menu_suggestion",
      displayName: value(row, ["service", "service name", "name", "description"]),
      normalized: {
        serviceName: value(row, ["service", "service name", "name"]),
        description: value(row, ["description"]),
        category: value(row, ["category", "service category"]),
        laborHours: value(row, ["labor hours", "hours"]),
        laborPriceRaw: value(row, ["labor price", "price", "labor rate"]),
        laborPrice: parseMoney(value(row, ["labor price", "price", "labor rate"])),
        opCode: value(row, ["operation code", "op code", "labor operation", "canned job"]),
      },
    };
  }

  return {
    entityType: "unknown",
    displayName: null,
    normalized: row,
  };
}
