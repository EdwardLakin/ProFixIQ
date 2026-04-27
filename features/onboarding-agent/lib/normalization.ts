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
    const plate = value(row, ["plate", "license", "license plate"]).toUpperCase().replace(/\s+/g, "");
    const unitNumber = value(row, ["unit", "unit number", "truck number"]);

    return {
      entityType: "vehicle",
      displayName: `${year} ${make} ${model}`.trim() || vin || plate || unitNumber,
      normalized: {
        sourceVehicleId: value(row, ["vehicle id", "id", "external vehicle id"]),
        sourceCustomerId: value(row, ["customer id"]),
        customerName: value(row, ["customer name", "name"]),
        customerEmail: value(row, ["customer email", "email"]),
        customerPhone: normalizePhone(value(row, ["customer phone", "phone"])),
        vin,
        plate,
        unitNumber,
        year,
        make,
        model,
      },
    };
  }

  if (domain === "history") {
    const sourceWorkOrderId = value(row, ["work order", "ro id", "repair order", "ro number", "work order number"]);
    const invoiceId = value(row, ["invoice id", "invoice number", "invoice"]);
    const openedDate = value(row, ["opened", "opened date", "open date", "date", "service date"]);
    const complaint = value(row, ["complaint", "description", "concern", "service text", "service performed"]);
    const correction = value(row, ["correction", "resolution"]);

    return {
      entityType: "historical_work_order",
      displayName: sourceWorkOrderId || invoiceId || `${openedDate} ${complaint || correction}`.trim(),
      normalized: {
        sourceWorkOrderId,
        invoiceId,
        sourceCustomerId: value(row, ["customer id"]),
        customerEmail: value(row, ["customer email", "email"]).toLowerCase(),
        customerName: value(row, ["customer name", "name"]),
        sourceVehicleId: value(row, ["vehicle id"]),
        vehicleVin: value(row, ["vin"]).toUpperCase().replace(/\s+/g, ""),
        vehiclePlate: value(row, ["plate", "license"]).toUpperCase().replace(/\s+/g, ""),
        vehicleUnitNumber: value(row, ["unit", "unit number"]),
        complaint,
        cause: value(row, ["cause"]),
        correction,
        serviceDescription: value(row, ["service", "service name", "line description", "service description"]),
        openedDate,
        closedDate: value(row, ["closed", "completed date", "closed date"]),
        laborRaw: value(row, ["labor", "labor total"]),
        laborTotal: parseMoney(value(row, ["labor", "labor total"])),
        totalRaw: value(row, ["total", "amount"]),
        total: parseMoney(value(row, ["total", "amount"])),
      },
    };
  }

  if (domain === "invoices") {
    const totalRaw = value(row, ["total", "amount", "invoice total"]);
    const sourceWorkOrderId = value(row, ["work order", "ro", "ro id", "repair order", "work order number"]);
    const invoiceNumber = value(row, ["invoice", "invoice number", "invoice id"]);
    const invoiceDate = value(row, ["issue date", "invoice date", "date"]);

    return {
      entityType: "historical_invoice",
      displayName: invoiceNumber || `${sourceWorkOrderId} ${invoiceDate}`.trim(),
      normalized: {
        invoiceNumber,
        sourceWorkOrderId,
        sourceCustomerId: value(row, ["customer id"]),
        customerName: value(row, ["customer", "customer name", "name"]),
        customerEmail: value(row, ["customer email", "email"]).toLowerCase(),
        vehicleVin: value(row, ["vin"]).toUpperCase().replace(/\s+/g, ""),
        invoiceDate,
        paymentStatus: value(row, ["status", "payment status"]),
        totalRaw,
        total: parseMoney(totalRaw),
      },
    };
  }

  if (domain === "parts") {
    const description = value(row, ["description", "name", "part"]);
    const partNumber = value(row, ["part number", "part #", "number"]);
    const sku = value(row, ["sku", "part sku"]);
    return {
      entityType: "part",
      displayName: description || partNumber || sku,
      normalized: {
        sku,
        partNumber,
        description,
        vendorName: value(row, ["vendor", "supplier", "vendor name", "supplier name"]),
        quantityOnHandRaw: value(row, ["qty", "quantity", "on hand", "quantity on hand"]),
        costRaw: value(row, ["cost", "unit cost"]),
        cost: parseMoney(value(row, ["cost", "unit cost"])),
        priceRaw: value(row, ["price", "list price", "sale price"]),
        price: parseMoney(value(row, ["price", "list price", "sale price"])),
      },
    };
  }

  if (domain === "vendors") {
    const name = value(row, ["vendor", "supplier", "company", "vendor name", "supplier name"]);
    return {
      entityType: "vendor",
      displayName: name,
      normalized: {
        name,
        email: value(row, ["email", "vendor email"]).toLowerCase(),
        phone: normalizePhone(value(row, ["phone", "vendor phone"])),
        accountNumber: value(row, ["account", "account number", "vendor account"]),
      },
    };
  }

  if (domain === "staff") {
    const name = value(row, ["name", "full name", "employee"]);
    const email = value(row, ["email", "email address"]).toLowerCase();
    return {
      entityType: "staff_candidate",
      displayName: name || email,
      normalized: {
        name,
        email,
        phone: normalizePhone(value(row, ["phone", "mobile"])),
        role: value(row, ["role", "job title", "position", "technician", "advisor"]),
      },
    };
  }

  if (domain === "menu") {
    const serviceName = value(row, ["service", "service name", "name"]);
    const description = value(row, ["description", "service description"]);
    const laborPriceRaw = value(row, ["labor price", "price", "labor rate"]);

    return {
      entityType: "menu_suggestion",
      displayName: serviceName || description,
      normalized: {
        serviceName,
        description,
        category: value(row, ["category", "service category"]),
        laborHours: value(row, ["labor hours", "hours"]),
        laborPriceRaw,
        laborPrice: parseMoney(laborPriceRaw),
        opCode: value(row, ["operation code", "op code", "labor operation", "canned job"]),
        inspectionHint: value(row, ["inspection", "inspection hint", "recommended inspection"]),
      },
    };
  }

  return {
    entityType: "unknown",
    displayName: null,
    normalized: row,
  };
}
