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
        sourceCustomerId: value(row, ["customer id", "id"]),
        name,
        firstName,
        lastName: rest.join(" "),
        businessName: value(row, ["company", "company name", "business"]),
        email: value(row, ["email", "email address"]).toLowerCase(),
        phone: normalizePhone(value(row, ["phone", "phone number", "mobile"])),
        address: value(row, ["address", "street", "street address"]),
        city: value(row, ["city", "town"]),
        province: value(row, ["province", "state", "region"]),
        postalCode: value(row, ["postal", "postal code", "zip", "zip code"]),
        fleetFlag: ["1", "true", "yes", "fleet"].includes(value(row, ["fleet", "is fleet", "company flag"]).toLowerCase()),
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
        sourceVehicleId: value(row, ["vehicle id", "id"]),
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
      displayName: value(row, ["work order", "repair order", "ro", "ro id"]),
      normalized: {
        sourceWorkOrderId: value(row, ["work order", "ro id", "repair order", "ro number"]),
        sourceCustomerId: value(row, ["customer id"]),
        sourceVehicleId: value(row, ["vehicle id"]),
        vehicleVin: value(row, ["vin"]).toUpperCase().replace(/\s+/g, ""),
        vehiclePlate: value(row, ["plate", "license"]).toUpperCase().replace(/\s+/g, ""),
        invoiceId: value(row, ["invoice id", "invoice number", "invoice"]),
        complaint: value(row, ["complaint", "description", "concern"]),
        cause: value(row, ["cause"]),
        correction: value(row, ["correction", "resolution"]),
        openedDate: value(row, ["opened", "opened date", "open date"]),
        closedDate: value(row, ["closed", "completed date", "closed date"]),
        mileage: value(row, ["mileage", "odometer"]),
        totalRaw: value(row, ["total", "amount"]),
        total: parseMoney(value(row, ["total", "amount"])),
        laborRaw: value(row, ["labor", "labor amount"]),
        laborAmount: parseMoney(value(row, ["labor", "labor amount"])),
        partsRaw: value(row, ["parts", "parts amount"]),
        partsAmount: parseMoney(value(row, ["parts", "parts amount"])),
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
        subtotalRaw: value(row, ["subtotal"]),
        subtotal: parseMoney(value(row, ["subtotal"])),
        taxRaw: value(row, ["tax", "tax amount"]),
        tax: parseMoney(value(row, ["tax", "tax amount"])),
        laborRaw: value(row, ["labor", "labor amount"]),
        laborAmount: parseMoney(value(row, ["labor", "labor amount"])),
        partsRaw: value(row, ["parts", "parts amount"]),
        partsAmount: parseMoney(value(row, ["parts", "parts amount"])),
        totalRaw,
        total: parseMoney(totalRaw),
        issueDate: value(row, ["issue date", "date"]),
        paidDate: value(row, ["paid date", "closed", "closed date"]),
        paymentStatus: value(row, ["status", "payment status"]),
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
        vendorName: value(row, ["vendor", "supplier", "vendor name"]),
        quantity: value(row, ["qty", "quantity", "on hand"]),
        costRaw: value(row, ["cost"]),
        cost: parseMoney(value(row, ["cost"])),
        priceRaw: value(row, ["price", "retail"]),
        price: parseMoney(value(row, ["price", "retail"])),
      },
    };
  }

  if (domain === "vendors") {
    return {
      entityType: "vendor",
      displayName: value(row, ["vendor", "supplier", "company", "vendor name"]),
      normalized: {
        name: value(row, ["vendor", "supplier", "company", "vendor name"]),
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
        role: value(row, ["role", "job title", "position"]),
      },
    };
  }

  return {
    entityType: "unknown",
    displayName: null,
    normalized: row,
  };
}
