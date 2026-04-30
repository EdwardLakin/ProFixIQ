import type { Database } from "@shared/types/types/supabase";

type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
type VehicleRow = Database["public"]["Tables"]["vehicles"]["Row"];

export type ParsedHistoryNotes = {
  workOrderLabel: string | null;
  invoiceLabel: string | null;
  totalLabel: string | null;
  laborLabel: string | null;
  liveWorkOrderId: string | null;
  sourceExternalId: string | null;
  sourceRowId: string | null;
  onboardingSessionId: string | null;
  extraLines: string[];
  importLines: string[];
  rawLines: string[];
};

export function parseHistoryNotes(notes: string | null | undefined): ParsedHistoryNotes {
  const lines = (notes ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const parsed: ParsedHistoryNotes = {
    workOrderLabel: null,
    invoiceLabel: null,
    totalLabel: null,
    laborLabel: null,
    liveWorkOrderId: null,
    sourceExternalId: null,
    sourceRowId: null,
    onboardingSessionId: null,
    extraLines: [],
    importLines: [],
    rawLines: lines,
  };

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex < 0) {
      parsed.extraLines.push(line);
      continue;
    }

    const label = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (!value) continue;

    if (label === "work order" || label === "work order id") {
      parsed.workOrderLabel = value;
      continue;
    }
    if (label === "invoice") {
      parsed.invoiceLabel = value;
      continue;
    }
    if (label === "total" || label === "invoice total") {
      parsed.totalLabel = value;
      continue;
    }
    if (label === "labor" || label === "labor total") {
      parsed.laborLabel = value;
      continue;
    }
    if (label === "live work order id") {
      parsed.liveWorkOrderId = value;
      parsed.importLines.push(line);
      continue;
    }
    if (label === "source external id") {
      parsed.sourceExternalId = value;
      parsed.importLines.push(line);
      continue;
    }
    if (label === "source row id") {
      parsed.sourceRowId = value;
      parsed.importLines.push(line);
      continue;
    }
    if (label === "onboarding session") {
      parsed.onboardingSessionId = value;
      parsed.importLines.push(line);
      continue;
    }
    if (label === "notes") {
      parsed.extraLines.push(value);
      continue;
    }

    parsed.extraLines.push(line);
  }

  return parsed;
}

export function formatMoneyLike(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/[$,]/g, "");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return raw;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

export function historyShortId(id: string): string {
  const clean = (id ?? "").trim();
  return clean ? clean.slice(0, 8) : "unknown";
}

export function historyTitle(input: { id: string; workOrderLabel: string | null; invoiceLabel: string | null }): string {
  const base = `History #${historyShortId(input.id)}`;
  if (input.workOrderLabel) return `${base} · WO ${input.workOrderLabel}`;
  if (input.invoiceLabel) return `${base} · Invoice ${input.invoiceLabel}`;
  return base;
}

export function fmtCustomerName(customer: Pick<CustomerRow, "first_name" | "last_name"> | null | undefined): string {
  if (!customer) return "—";
  const name = [customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ").trim();
  return name || "—";
}

export function fmtVehicle(vehicle: Pick<VehicleRow, "year" | "make" | "model" | "unit_number" | "license_plate"> | null | undefined): string {
  if (!vehicle) return "—";
  const main = [vehicle.year != null ? String(vehicle.year) : "", vehicle.make ?? "", vehicle.model ?? ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  const aux = [vehicle.unit_number ? `Unit ${vehicle.unit_number}` : "", vehicle.license_plate ? `Plate ${vehicle.license_plate}` : ""]
    .filter(Boolean)
    .join(" • ");
  return [main || "Vehicle", aux].filter(Boolean).join(" — ");
}
