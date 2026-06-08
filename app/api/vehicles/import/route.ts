import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type VehicleInsert = DB["public"]["Tables"]["vehicles"]["Insert"];
type VehicleUpdate = DB["public"]["Tables"]["vehicles"]["Update"];
type VehicleMatch = Pick<DB["public"]["Tables"]["vehicles"]["Row"], "id">;

type VehicleImportRow = {
  unit_number?: unknown;
  vin?: unknown;
  license_plate?: unknown;
  year?: unknown;
  make?: unknown;
  model?: unknown;
};

function cleanString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function cleanVin(value: unknown): string | null {
  return cleanString(value)?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? null;
}

function cleanPlate(value: unknown): string | null {
  return cleanString(value)?.toUpperCase() ?? null;
}

function cleanYear(value: unknown): number | null {
  const text = cleanString(value);
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 1900 || parsed > 2100) return null;
  return Math.trunc(parsed);
}

function normalizeRow(row: VehicleImportRow, shopId: string): VehicleInsert | null {
  const unitNumber = cleanString(row.unit_number);
  const vin = cleanVin(row.vin);
  const plate = cleanPlate(row.license_plate);
  const year = cleanYear(row.year);
  const make = cleanString(row.make);
  const model = cleanString(row.model);

  if (!vin && !unitNumber && !plate && !(year && make && model)) return null;

  return {
    shop_id: shopId,
    unit_number: unitNumber,
    vin,
    license_plate: plate,
    year,
    make,
    model,
  };
}

async function findExistingVehicle(
  supabase: SupabaseClient<DB>,
  shopId: string,
  normalized: VehicleInsert,
): Promise<VehicleMatch | null> {
  if (normalized.vin) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id")
      .eq("shop_id", shopId)
      .eq("vin", normalized.vin)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (normalized.unit_number) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id")
      .eq("shop_id", shopId)
      .eq("unit_number", normalized.unit_number)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (normalized.license_plate) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id")
      .eq("shop_id", shopId)
      .eq("license_plate", normalized.license_plate)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      allowRoles: ["owner", "admin", "manager", "advisor"],
    });

    if (!access.ok) {
      return access.response;
    }

    const body = await req.json().catch(() => null);
    const rows = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({ error: "No vehicle rows provided." }, { status: 400 });
    }

    const { supabase, profile } = access;
    const shopId = profile.shop_id;

    if (!shopId) {
      return NextResponse.json({ error: "No active shop is selected." }, { status: 400 });
    }

    const counts = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    };

    for (const raw of rows) {
      const normalized = normalizeRow(raw as VehicleImportRow, shopId);

      if (!normalized) {
        counts.skipped += 1;
        continue;
      }

      try {
        const existing = await findExistingVehicle(supabase, shopId, normalized);

        if (existing) {
          const updatePayload: VehicleUpdate = {
            unit_number: normalized.unit_number,
            vin: normalized.vin,
            license_plate: normalized.license_plate,
            year: normalized.year,
            make: normalized.make,
            model: normalized.model,
          };

          const { error } = await supabase
            .from("vehicles")
            .update(updatePayload)
            .eq("id", existing.id)
            .eq("shop_id", shopId);

          if (error) throw error;
          counts.updated += 1;
          continue;
        }

        const { error } = await supabase.from("vehicles").insert(normalized);

        if (error) throw error;
        counts.created += 1;
      } catch {
        counts.failed += 1;
      }
    }

    return NextResponse.json({ ok: true, counts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import vehicles." },
      { status: 500 },
    );
  }
}
