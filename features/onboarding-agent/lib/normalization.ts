import type { OnboardingDomain } from "./domains";
import { normalizePhone } from "./fingerprints";

const normalizeKey = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const value = (row: Record<string, string>, canonicalKey: string, keys: string[]): string => {
  const normalizedKeys = new Set([canonicalKey, ...keys].map(normalizeKey));
  for (const [header, rawValue] of Object.entries(row)) {
    const key = normalizeKey(header);
    if (normalizedKeys.has(key) && rawValue) return rawValue.trim();
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
    const name = value(row, "name", ["customer name", "full name", "name"]);
    const [firstName = "", ...rest] = name.split(" ");
    return {
      entityType: "customer",
      displayName: name || value(row, "businessName", ["company name", "company", "business"]),
      normalized: {
        sourceCustomerId: value(row, "sourceCustomerId", ["customer id", "id", "external customer id"]),
        name,
        firstName,
        lastName: value(row, "lastName", ["last name"]) || rest.join(" "),
        businessName: value(row, "businessName", ["company", "company name", "business"]),
        email: value(row, "email", ["email", "email address", "e mail", "e-mail"]).toLowerCase(),
        phone: normalizePhone(value(row, "phone", ["phone", "phone number", "mobile"])),
      },
    };
  }

  if (domain === "vehicles") {
    const year = value(row, "year", ["year"]);
    const make = value(row, "make", ["make"]);
    const model = value(row, "model", ["model"]);
    const vin = value(row, "vin", ["vin"]).toUpperCase().replace(/\s+/g, "");
    const plate = value(row, "plate", ["plate", "license", "license plate"]).toUpperCase().replace(/\s+/g, "");
    const unitNumber = value(row, "unitNumber", ["unit", "unit number", "truck number"]);

    return {
      entityType: "vehicle",
      displayName: `${year} ${make} ${model}`.trim() || vin || plate || unitNumber,
      normalized: {
        sourceVehicleId: value(row, "sourceVehicleId", ["vehicle id", "id", "external vehicle id"]),
        sourceCustomerId: value(row, "sourceCustomerId", ["customer id"]),
        customerName: value(row, "customerName", ["customer name", "name"]),
        customerEmail: value(row, "customerEmail", ["customer email", "email", "customer e-mail", "customer e mail"]),
        customerPhone: normalizePhone(value(row, "customerPhone", ["customer phone", "phone"])),
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
    const sourceWorkOrderId = value(row, "sourceWorkOrderId", ["work order", "ro id", "repair order", "ro number", "work order number"]);
    const invoiceId = value(row, "invoiceId", ["invoice id", "invoice number", "invoice"]);
    const openedDate = value(row, "openedDate", ["opened", "opened date", "open date", "date", "service date"]);
    const complaint = value(row, "complaint", ["complaint", "description", "concern", "service text", "service performed"]);
    const correction = value(row, "correction", ["correction", "resolution"]);

    return {
      entityType: "historical_work_order",
      displayName: sourceWorkOrderId || invoiceId || `${openedDate} ${complaint || correction}`.trim(),
      normalized: {
        sourceWorkOrderId,
        invoiceId,
        sourceCustomerId: value(row, "sourceCustomerId", ["customer id"]),
        customerEmail: value(row, "customerEmail", ["customer email", "email", "customer e-mail", "customer e mail"]).toLowerCase(),
        customerName: value(row, "customerName", ["customer name", "name"]),
        sourceVehicleId: value(row, "sourceVehicleId", ["vehicle id"]),
        vehicleVin: value(row, "vehicleVin", ["vin"]).toUpperCase().replace(/\s+/g, ""),
        vehiclePlate: value(row, "vehiclePlate", ["plate", "license"]).toUpperCase().replace(/\s+/g, ""),
        vehicleUnitNumber: value(row, "vehicleUnitNumber", ["unit", "unit number"]),
        invoiceNumber: value(row, "invoiceNumber", ["invoice number", "invoice", "invoice id"]),
        complaint,
        cause: value(row, "cause", ["cause"]),
        correction,
        serviceDescription: value(row, "serviceDescription", ["service", "service name", "line description", "service description"]),
        openedDate,
        closedDate: value(row, "closedDate", ["closed", "completed date", "closed date"]),
        laborRaw: value(row, "laborRaw", ["labor", "labor total"]),
        laborTotal: parseMoney(value(row, "laborRaw", ["labor", "labor total"])),
        totalRaw: value(row, "totalRaw", ["total", "amount"]),
        total: parseMoney(value(row, "totalRaw", ["total", "amount"])),
        odometer: value(row, "odometer", ["odometer"]),
      },
    };
  }

  if (domain === "invoices") {
    const totalRaw = value(row, "totalRaw", ["total", "amount", "invoice total"]);
    const sourceWorkOrderId = value(row, "sourceWorkOrderId", ["work order", "ro", "ro id", "repair order", "work order number"]);
    const invoiceNumber = value(row, "invoiceNumber", ["invoice", "invoice number", "invoice id"]);
    const invoiceDate = value(row, "invoiceDate", ["issue date", "invoice date", "date"]);

    return {
      entityType: "historical_invoice",
      displayName: invoiceNumber || `${sourceWorkOrderId} ${invoiceDate}`.trim(),
      normalized: {
        invoiceNumber,
        sourceWorkOrderId,
        sourceCustomerId: value(row, "sourceCustomerId", ["customer id"]),
        customerName: value(row, "customerName", ["customer", "customer name", "name"]),
        customerEmail: value(row, "customerEmail", ["customer email", "email", "customer e-mail", "customer e mail"]).toLowerCase(),
        sourceVehicleId: value(row, "sourceVehicleId", ["vehicle id"]),
        vehicleVin: value(row, "vehicleVin", ["vin"]).toUpperCase().replace(/\s+/g, ""),
        vehiclePlate: value(row, "vehiclePlate", ["plate", "license"]).toUpperCase().replace(/\s+/g, ""),
        invoiceDate,
        paymentStatus: value(row, "paymentStatus", ["status", "payment status"]),
        totalRaw,
        total: parseMoney(totalRaw),
      },
    };
  }

  if (domain === "parts") {
    const description = value(row, "description", ["description", "name", "part"]);
    const partNumber = value(row, "partNumber", ["part number", "part #", "number"]);
    const sku = value(row, "sku", ["sku", "part sku"]);
    return {
      entityType: "part",
      displayName: description || partNumber || sku,
      normalized: {
        sku,
        partNumber,
        description,
        vendorName: value(row, "vendorName", ["vendor", "supplier", "vendor name", "supplier name"]),
        quantityOnHandRaw: value(row, "quantityOnHandRaw", ["qty", "quantity", "on hand", "quantity on hand"]),
        costRaw: value(row, "costRaw", ["cost", "unit cost"]),
        cost: parseMoney(value(row, "costRaw", ["cost", "unit cost"])),
        priceRaw: value(row, "priceRaw", ["price", "list price", "sale price"]),
        price: parseMoney(value(row, "priceRaw", ["price", "list price", "sale price"])),
      },
    };
  }

  if (domain === "vendors") {
    const name = value(row, "name", ["vendor", "supplier", "company", "vendor name", "supplier name"]);
    return {
      entityType: "vendor",
      displayName: name,
      normalized: {
        sourceVendorId: value(row, "sourceVendorId", ["vendor id", "external vendor id", "vendor_number"]),
        name,
        email: value(row, "email", ["email", "vendor email", "e mail", "e-mail"]).toLowerCase(),
        phone: normalizePhone(value(row, "phone", ["phone", "vendor phone"])),
        accountNumber: value(row, "accountNumber", ["account", "account number", "vendor account"]),
      },
    };
  }

  if (domain === "staff") {
    const name = value(row, "name", ["name", "full name", "employee"]);
    const email = value(row, "email", ["email", "email address", "e mail", "e-mail"]).toLowerCase();
    const username = value(row, "username", ["username", "user name", "login"]);
    return {
      entityType: "staff_candidate",
      displayName: name || email || username,
      normalized: {
        name,
        email,
        username,
        phone: normalizePhone(value(row, "phone", ["phone", "mobile"])),
        role: value(row, "role", ["role", "job title", "position", "technician", "advisor"]),
      },
    };
  }

  if (domain === "menu") {
    const serviceName = value(row, "serviceName", ["service", "service name", "name"]);
    const description = value(row, "description", ["description", "service description", "service_description"]);
    const laborPriceRaw = value(row, "laborPriceRaw", ["labor price", "price", "labor rate"]);

    return {
      entityType: "menu_suggestion",
      displayName: serviceName || description,
      normalized: {
        serviceName,
        description,
        category: value(row, "category", ["category", "service category"]),
        laborHours: value(row, "laborHours", ["labor hours", "hours"]),
        laborPriceRaw,
        laborPrice: parseMoney(laborPriceRaw),
        opCode: value(row, "opCode", ["operation code", "op code", "labor operation", "canned job"]),
        inspectionHint: value(row, "inspectionHint", ["inspection", "inspection hint", "recommended inspection"]),
      },
    };
  }

  return {
    entityType: "unknown",
    displayName: null,
    normalized: row,
  };
}
