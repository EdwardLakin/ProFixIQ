import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type HistoryImportRow = {
  customer_id?: unknown;
  vehicle_id?: unknown;
  vin?: unknown;
  customer_email?: unknown;
  email?: unknown;
  customer_phone?: unknown;
  phone?: unknown;
  customer_name?: unknown;
  name?: unknown;
  service_date?: unknown;
  repair_order_number?: unknown;
  work_order_number?: unknown;
  invoice_number?: unknown;
  odometer?: unknown;
  service_category?: unknown;
  complaint?: unknown;
  cause?: unknown;
  correction?: unknown;
  parts?: unknown;
  labor_hours?: unknown;
  total?: unknown;
  technician?: unknown;
  advisor?: unknown;
  notes?: unknown;
};

type CustomerRef = Pick<
  DB["public"]["Tables"]["customers"]["Row"],
  | "id"
  | "external_id"
  | "email"
  | "phone"
  | "phone_number"
  | "name"
  | "business_name"
  | "first_name"
  | "last_name"
>;
type VehicleRef = Pick<
  DB["public"]["Tables"]["vehicles"]["Row"],
  "id" | "external_id" | "vin" | "customer_id"
>;

type Resolver = {
  customersById: Map<string, CustomerRef>;
  customersByExternal: Map<string, CustomerRef>;
  customersByEmail: Map<string, CustomerRef>;
  customersByPhone: Map<string, CustomerRef>;
  customersByName: Map<string, CustomerRef>;
  vehiclesById: Map<string, VehicleRef>;
  vehiclesByExternal: Map<string, VehicleRef>;
  vehiclesByVin: Map<string, VehicleRef>;
};

function clean(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}
function key(value: unknown): string | null {
  return clean(value)?.toLowerCase().replace(/\s+/g, " ") ?? null;
}
function phone(value: unknown): string | null {
  const text = clean(value);
  if (!text) return null;
  return text.replace(/\D/g, "") || text;
}
function vin(value: unknown): string | null {
  return (
    clean(value)
      ?.toUpperCase()
      .replace(/[^A-Z0-9]/g, "") ?? null
  );
}
function num(value: unknown): number | null {
  const text = clean(value);
  if (!text) return null;
  const parsed = Number(text.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
function validDate(value: unknown): string | null {
  const text = clean(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
function customerName(c: CustomerRef): string | null {
  return (
    c.name ||
    c.business_name ||
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
    null
  );
}

async function loadResolver(
  supabase: SupabaseClient<DB>,
  shopId: string,
): Promise<Resolver> {
  const [
    { data: customers, error: customerError },
    { data: vehicles, error: vehicleError },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select(
        "id, external_id, email, phone, phone_number, name, business_name, first_name, last_name",
      )
      .eq("shop_id", shopId),
    supabase
      .from("vehicles")
      .select("id, external_id, vin, customer_id")
      .eq("shop_id", shopId),
  ]);
  if (customerError) throw customerError;
  if (vehicleError) throw vehicleError;
  const r: Resolver = {
    customersById: new Map(),
    customersByExternal: new Map(),
    customersByEmail: new Map(),
    customersByPhone: new Map(),
    customersByName: new Map(),
    vehiclesById: new Map(),
    vehiclesByExternal: new Map(),
    vehiclesByVin: new Map(),
  };
  for (const c of (customers ?? []) as CustomerRef[]) {
    r.customersById.set(c.id, c);
    const ex = key(c.external_id);
    if (ex && !r.customersByExternal.has(ex)) r.customersByExternal.set(ex, c);
    const em = key(c.email);
    if (em && !r.customersByEmail.has(em)) r.customersByEmail.set(em, c);
    for (const p of [c.phone, c.phone_number]) {
      const ph = phone(p);
      if (ph && !r.customersByPhone.has(ph)) r.customersByPhone.set(ph, c);
    }
    for (const n of [c.name, c.business_name, customerName(c)]) {
      const nk = key(n);
      if (nk && !r.customersByName.has(nk)) r.customersByName.set(nk, c);
    }
  }
  for (const v of (vehicles ?? []) as VehicleRef[]) {
    r.vehiclesById.set(v.id, v);
    const ex = key(v.external_id);
    if (ex && !r.vehiclesByExternal.has(ex)) r.vehiclesByExternal.set(ex, v);
    const vk = vin(v.vin);
    if (vk && !r.vehiclesByVin.has(vk)) r.vehiclesByVin.set(vk, v);
  }
  return r;
}

function resolveCustomer(
  row: HistoryImportRow,
  r: Resolver,
): CustomerRef | null {
  const cid = clean(row.customer_id);
  if (cid && r.customersById.has(cid)) return r.customersById.get(cid)!;
  const ex = key(row.customer_id);
  if (ex && r.customersByExternal.has(ex))
    return r.customersByExternal.get(ex)!;
  const em = key(row.customer_email ?? row.email);
  if (em && r.customersByEmail.has(em)) return r.customersByEmail.get(em)!;
  const ph = phone(row.customer_phone ?? row.phone);
  if (ph && r.customersByPhone.has(ph)) return r.customersByPhone.get(ph)!;
  const nm = key(row.customer_name ?? row.name);
  if (nm && r.customersByName.has(nm)) return r.customersByName.get(nm)!;
  return null;
}
function resolveVehicle(row: HistoryImportRow, r: Resolver): VehicleRef | null {
  const vid = clean(row.vehicle_id);
  if (vid && r.vehiclesById.has(vid)) return r.vehiclesById.get(vid)!;
  const ex = key(row.vehicle_id);
  if (ex && r.vehiclesByExternal.has(ex)) return r.vehiclesByExternal.get(ex)!;
  const vk = vin(row.vin);
  if (vk && r.vehiclesByVin.has(vk)) return r.vehiclesByVin.get(vk)!;
  return null;
}

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      allowRoles: ["owner", "admin", "manager", "advisor"],
    });
    if (!access.ok) return access.response;
    const body = await req.json().catch(() => null);
    const rows = Array.isArray(body?.rows) ? body.rows : null;
    if (!rows?.length)
      return NextResponse.json(
        { error: "No history rows provided." },
        { status: 400 },
      );
    const { supabase, profile } = access;
    const shopId = profile.shop_id;
    if (!shopId)
      return NextResponse.json(
        { error: "No active shop is selected." },
        { status: 400 },
      );
    const resolver = await loadResolver(supabase, shopId);
    const counts = { imported: 0, skipped: 0, failed: 0, duplicates: 0 };
    const skippedRows: Array<{
      row: number;
      reason: string;
      repairOrderNumber: string | null;
      invoiceNumber: string | null;
    }> = [];
    const failedRows: Array<{
      row: number;
      error: string;
      repairOrderNumber: string | null;
      invoiceNumber: string | null;
    }> = [];
    for (const [i, raw] of (rows as HistoryImportRow[]).entries()) {
      const rowNumber = i + 1;
      const row = raw;
      const repairOrderNumber = clean(
        row.repair_order_number ?? row.work_order_number,
      );
      const invoiceNumber = clean(row.invoice_number);
      try {
        const serviceDate = validDate(row.service_date);
        if (!serviceDate) {
          counts.skipped++;
          skippedRows.push({
            row: rowNumber,
            reason: "Invalid or missing service_date.",
            repairOrderNumber,
            invoiceNumber,
          });
          continue;
        }
        const invalidNumber = (
          [
            ["odometer", row.odometer],
            ["labor_hours", row.labor_hours],
            ["total", row.total],
          ] as const
        ).find(([, value]) => clean(value) && num(value) === null);
        if (invalidNumber) {
          counts.skipped++;
          skippedRows.push({
            row: rowNumber,
            reason: `${invalidNumber[0]} must be numeric when provided.`,
            repairOrderNumber,
            invoiceNumber,
          });
          continue;
        }
        const vehicle = resolveVehicle(row, resolver);
        const customer =
          resolveCustomer(row, resolver) ??
          (vehicle?.customer_id
            ? (resolver.customersById.get(vehicle.customer_id) ?? null)
            : null);
        if (!customer) {
          counts.skipped++;
          skippedRows.push({
            row: rowNumber,
            reason: "Existing customer could not be matched.",
            repairOrderNumber,
            invoiceNumber,
          });
          continue;
        }
        if ((clean(row.vehicle_id) || clean(row.vin)) && !vehicle) {
          counts.skipped++;
          skippedRows.push({
            row: rowNumber,
            reason: "Existing vehicle could not be matched.",
            repairOrderNumber,
            invoiceNumber,
          });
          continue;
        }
        if (repairOrderNumber || invoiceNumber) {
          let q = supabase
            .from("history")
            .select("id")
            .eq("customer_id", customer.id)
            .limit(1);
          if (repairOrderNumber)
            q = q.eq("work_order_number" as "id", repairOrderNumber);
          if (invoiceNumber) q = q.eq("invoice_number" as "id", invoiceNumber);
          const { data, error } = await q;
          if (error) throw error;
          if ((data ?? []).length) {
            counts.skipped++;
            counts.duplicates++;
            skippedRows.push({
              row: rowNumber,
              reason: "Duplicate repair order/invoice already exists.",
              repairOrderNumber,
              invoiceNumber,
            });
            continue;
          }
        }
        const parts = clean(row.parts);
        const notes =
          [
            clean(row.notes),
            parts ? `Parts: ${parts}` : null,
            clean(row.service_category)
              ? `Service category: ${clean(row.service_category)}`
              : null,
          ]
            .filter(Boolean)
            .join("\n") || null;
        const description =
          [
            clean(row.service_category),
            clean(row.complaint),
            clean(row.correction),
          ]
            .filter(Boolean)
            .join(" · ") || "Imported historical service record";
        const payload: DB["public"]["Tables"]["history"]["Insert"] &
          Record<string, unknown> = {
          customer_id: customer.id,
          vehicle_id: vehicle?.id ?? null,
          service_date: serviceDate,
          description,
          notes,
          work_order_number: repairOrderNumber,
          invoice_number: invoiceNumber,
          odometer: num(row.odometer),
          symptom: clean(row.complaint),
          cause: clean(row.cause),
          correction: clean(row.correction),
          labor_hours: num(row.labor_hours),
          total: num(row.total),
          advisor_name: clean(row.advisor),
          assigned_tech_name: clean(row.technician),
          historical_status: "imported",
          source_system: "vehicle_history_csv",
          source_row_id: String(rowNumber),
        };
        const { error } = await supabase.from("history").insert(payload);
        if (error) throw error;
        counts.imported++;
      } catch (error) {
        counts.failed++;
        failedRows.push({
          row: rowNumber,
          error:
            error instanceof Error
              ? error.message
              : "History row failed to import.",
          repairOrderNumber,
          invoiceNumber,
        });
      }
    }
    return NextResponse.json({ ok: true, counts, skippedRows, failedRows });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to import vehicle history.",
      },
      { status: 500 },
    );
  }
}
