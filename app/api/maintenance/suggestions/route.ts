import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { computeMaintenanceSuggestionsForWorkOrder } from "@/features/maintenance/server/computeMaintenanceSuggestions";

type DB = Database;

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
    | { workOrderId?: string }
    | null;

  const workOrderId = body?.workOrderId?.trim();
  if (!workOrderId) {
    return NextResponse.json(
      { error: "workOrderId is required" },
      { status: 400 },
    );
  }

  try {
    const result = await computeMaintenanceSuggestionsForWorkOrder({
      supabase,
      workOrderId,
    });

    const menuItemIds = [...new Set(
      result.suggestions.map((item) => item.menuItemId).filter(Boolean)
    )] as string[];

    let menuMetaById = new Map<string, { name: string; price: number | null }>();
    if (menuItemIds.length > 0) {
      const { data: menuItemsData, error: menuItemsError } = await supabase
        .from("menu_items")
        .select("id, name, price")
        .in("id", menuItemIds);

      if (menuItemsError) throw menuItemsError;

      menuMetaById = new Map(
        (
          (menuItemsData ?? []) as Array<{
            id: string;
            name: string | null;
            price: number | null;
          }>
        ).map((row) => [
          row.id,
          {
            name: row.name ?? row.id,
            price: row.price ?? null,
          },
        ])
      );
    }

    const suggestions = result.suggestions.map((item) => {
      const menuMeta = item.menuItemId ? menuMetaById.get(item.menuItemId) ?? null : null;
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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to compute suggestions";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
