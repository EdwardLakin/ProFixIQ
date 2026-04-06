import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { computeMaintenanceSuggestionsForWorkOrder } from "@/features/maintenance/server/computeMaintenanceSuggestions";

type DB = Database;

type MenuMeta = { name: string; price: number | null };

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function buildMenuMetaMap(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
  suggestions: Array<{
    menuItemId?: string | null;
  }>,
): Promise<Map<string, MenuMeta>> {
  const menuItemIds = [
    ...new Set(
      suggestions
        .map((item) => item.menuItemId)
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0),
    ),
  ];

  const menuMetaById = new Map<string, MenuMeta>();

  if (menuItemIds.length === 0) {
    return menuMetaById;
  }

  const { data: menuItemsData, error: menuItemsError } = await supabase
    .from("menu_items")
    .select("id, name, price")
    .in("id", menuItemIds);

  if (menuItemsError) throw menuItemsError;

  for (const row of (menuItemsData ?? []) as Array<{
    id: string;
    name: string | null;
    price: number | null;
  }>) {
    menuMetaById.set(row.id, {
      name: row.name ?? row.id,
      price: row.price ?? null,
    });
  }

  return menuMetaById;
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { workOrderId?: string; vehicleId?: string }
    | null;

  const workOrderId = safeTrim(body?.workOrderId);
  const vehicleId = safeTrim(body?.vehicleId);

  if (!workOrderId && !vehicleId) {
    return NextResponse.json(
      { error: "workOrderId or vehicleId is required" },
      { status: 400 },
    );
  }

  try {
    // Create / active work-order flow: compute fresh suggestions from work order
    if (workOrderId) {
      const result = await computeMaintenanceSuggestionsForWorkOrder({
        supabase,
        workOrderId,
      });

      const menuMetaById = await buildMenuMetaMap(supabase, result.suggestions);

      const suggestions = result.suggestions.map((item) => {
        const menuMeta = item.menuItemId
          ? menuMetaById.get(item.menuItemId) ?? null
          : null;

        const menuItemPrice = menuMeta?.price ?? null;

        return {
          ...item,
          menuItemName: menuMeta?.name ?? null,
          menuItemPrice,
          effectivePrice: menuItemPrice ?? item.estimatedPackagePrice ?? null,
        };
      });

      return NextResponse.json({
        ok: true,
        workOrderId,
        suggestions,
      });
    }

    // Create flow: use latest cached vehicle suggestions if present
    const { data: suggestionRows, error: suggestionError } = await supabase
      .from("maintenance_suggestions")
      .select("id, vehicle_id, suggestions")
      .eq("vehicle_id", vehicleId)
      .limit(1);

    const suggestionRow =
      Array.isArray(suggestionRows) && suggestionRows.length > 0
        ? suggestionRows[0]
        : null;

    if (suggestionError) throw suggestionError;

    if (!suggestionRow) {
      return NextResponse.json({
        ok: true,
        vehicleId,
        suggestions: [],
      });
    }

    const rawSuggestions = Array.isArray(suggestionRow.suggestions)
      ? suggestionRow.suggestions
      : [];

    const typedSuggestions = rawSuggestions as Array<{
      menuItemId?: string | null;
      estimatedPackagePrice?: number | null;
      [key: string]: unknown;
    }>;

    const menuMetaById = await buildMenuMetaMap(supabase, typedSuggestions);

    const suggestions = typedSuggestions.map((item) => {
      const menuItemId =
        typeof item.menuItemId === "string" ? item.menuItemId : null;

      const menuMeta = menuItemId
        ? menuMetaById.get(menuItemId) ?? null
        : null;

      const estimatedPackagePrice =
        typeof item.estimatedPackagePrice === "number"
          ? item.estimatedPackagePrice
          : null;

      return {
        ...item,
        menuItemName: menuMeta?.name ?? null,
        menuItemPrice: menuMeta?.price ?? null,
        effectivePrice: menuMeta?.price ?? estimatedPackagePrice ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      vehicleId,
      suggestions,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load maintenance suggestions";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
