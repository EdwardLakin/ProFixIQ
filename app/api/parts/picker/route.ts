import { NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderLineTechnician =
  DB["public"]["Tables"]["work_order_line_technicians"]["Row"];

const ALLOWED_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "parts",
  "mechanic",
  "lead_hand",
  "foreman",
] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanSearch(value: string | null): string {
  return (value ?? "")
    .replace(/[,%_().]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

async function mechanicCanUseLine(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  lineId: string | null;
  shopId: string;
  technicianId: string;
}): Promise<boolean> {
  if (!input.lineId || !UUID_PATTERN.test(input.lineId)) return false;

  const { data: line, error } = await input.admin
    .from("work_order_lines")
    .select("id,assigned_tech_id,assigned_to")
    .eq("id", input.lineId)
    .eq("shop_id", input.shopId)
    .maybeSingle<
      Pick<WorkOrderLine, "id" | "assigned_tech_id" | "assigned_to">
    >();

  if (error || !line) return false;
  if (
    line.assigned_tech_id === input.technicianId ||
    line.assigned_to === input.technicianId
  ) {
    return true;
  }

  const { data: sharedAssignment, error: sharedError } = await input.admin
    .from("work_order_line_technicians")
    .select("id")
    .eq("work_order_line_id", line.id)
    .eq("technician_id", input.technicianId)
    .maybeSingle<Pick<WorkOrderLineTechnician, "id">>();

  return !sharedError && Boolean(sharedAssignment);
}

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ALLOWED_ROLES,
  });
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const lineId = url.searchParams.get("workOrderLineId")?.trim() || null;
  const search = cleanSearch(url.searchParams.get("q"));
  const admin = createAdminSupabase();

  if (
    access.canonicalRole === "mechanic" &&
    !(await mechanicCanUseLine({
      admin,
      lineId,
      shopId: access.profile.shop_id,
      technicianId: access.profile.id,
    }))
  ) {
    return NextResponse.json(
      { error: "This inventory picker is limited to your assigned jobs." },
      { status: 403 },
    );
  }

  let partsQuery = admin
    .from("parts")
    .select(
      "id,shop_id,name,sku,part_number,category,default_cost,cost,price",
    )
    .eq("shop_id", access.profile.shop_id)
    .order("name")
    .limit(50);

  if (search) {
    const pattern = `%${search}%`;
    partsQuery = partsQuery.or(
      `name.ilike.${pattern},sku.ilike.${pattern},part_number.ilike.${pattern},category.ilike.${pattern}`,
    );
  }

  const [partsResult, locationsResult] = await Promise.all([
    partsQuery,
    admin
      .from("stock_locations")
      .select("id,code,name,shop_id")
      .eq("shop_id", access.profile.shop_id)
      .order("code"),
  ]);

  if (partsResult.error) {
    return NextResponse.json(
      { error: partsResult.error.message || "Unable to load parts inventory." },
      { status: 500 },
    );
  }
  if (locationsResult.error) {
    return NextResponse.json(
      {
        error:
          locationsResult.error.message ||
          "Unable to load inventory locations.",
      },
      { status: 500 },
    );
  }

  const parts = partsResult.data ?? [];
  const partIds = parts.map((part) => part.id);
  const stockResult = partIds.length
    ? await admin
        .from("v_part_stock")
        .select(
          "part_id,location_id,qty_available,qty_on_hand,qty_reserved",
        )
        .in("part_id", partIds)
    : { data: [], error: null };

  if (stockResult.error) {
    return NextResponse.json(
      { error: stockResult.error.message || "Unable to load inventory stock." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      shopId: access.profile.shop_id,
      parts,
      locations: locationsResult.data ?? [],
      stock: stockResult.data ?? [],
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
