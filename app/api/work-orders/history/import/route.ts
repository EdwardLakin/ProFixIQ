import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { parseCsvFileFromFormData } from "@/features/shared/lib/import/csv";
import { normalizeVehicleHistoryImportRow } from "@/features/work-orders/import/normalizeVehicleHistoryImportRow";
import {
  importVehicleHistoryRowsSynchronously,
  VEHICLE_HISTORY_IMPORT_MAX_ROWS,
} from "@/features/work-orders/server/vehicle-history-import-job";

type HistoryImportRow = Record<string, unknown>;

const VEHICLE_HISTORY_IMPORT_DEBUG =
  process.env.VEHICLE_HISTORY_IMPORT_DEBUG === "1" ||
  process.env.CUSTOMER_IMPORT_DEBUG === "1";

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      allowRoles: ["owner", "admin", "manager", "advisor"],
    });
    if (!access.ok) return access.response;

    const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          error:
            "Vehicle history import requires multipart/form-data with a CSV file field.",
        },
        { status: 415 },
      );
    }

    const formData = await req.formData();
    let parsed;
    try {
      parsed = await parseCsvFileFromFormData<HistoryImportRow>({
        formData,
        maxRows: VEHICLE_HISTORY_IMPORT_MAX_ROWS,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to parse vehicle history CSV.",
        },
        { status: 400 },
      );
    }

    const { supabase, profile } = access;
    const shopId = profile.shop_id;
    if (!shopId) {
      return NextResponse.json(
        { error: "No active shop is selected." },
        { status: 400 },
      );
    }

    const normalizedRows = parsed.rows.map((row) =>
      normalizeVehicleHistoryImportRow(row as Record<string, unknown>),
    );
    if (VEHICLE_HISTORY_IMPORT_DEBUG) {
      parsed.rows.slice(0, 10).forEach((rawRow, index) => {
        console.info("[vehicle-history-import] Raw CSV row", {
          row: index + 1,
          rawRow,
        });
        console.info("[vehicle-history-import] Normalized row", {
          row: index + 1,
          normalizedRow: normalizedRows[index],
        });
      });
    }

    const result = await importVehicleHistoryRowsSynchronously({
      supabase,
      shopId,
      rows: normalizedRows,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to import vehicle history CSV.",
      },
      { status: 500 },
    );
  }
}
