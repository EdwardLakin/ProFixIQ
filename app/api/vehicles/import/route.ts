import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  VEHICLE_IMPORT_MAX_ROWS,
  processVehicleImportRows,
  type VehicleImportRow,
} from "@/features/vehicles/server/vehicle-import-job";

type VehicleImportBody = {
  rows?: unknown;
};

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      allowRoles: ["owner", "admin", "manager", "advisor"],
    });
    if (!access.ok) return access.response;

    const { supabase, profile } = access;
    const shopId = profile.shop_id;
    if (!shopId) {
      return NextResponse.json(
        { error: "No active shop is selected." },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as VehicleImportBody;
    const rows = Array.isArray(body.rows) ? (body.rows as VehicleImportRow[]) : [];
    if (!rows.length) {
      return NextResponse.json(
        { error: "No vehicle rows provided." },
        { status: 400 },
      );
    }
    if (rows.length > VEHICLE_IMPORT_MAX_ROWS) {
      return NextResponse.json(
        {
          error: `Vehicle CSV contains ${rows.length} rows. Please split files into ${VEHICLE_IMPORT_MAX_ROWS} rows or fewer.`,
        },
        { status: 400 },
      );
    }

    const summary = await processVehicleImportRows(supabase, shopId, rows);

    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to import vehicles.",
      },
      { status: 500 },
    );
  }
}
