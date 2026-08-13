import { NextResponse } from "next/server";

import { getMobileActiveJobs } from "@/features/dispatch/server/commands";
import { requireMobileServiceOperatorApiAccess } from "@/features/mobile/service/server/access";

type StockRow = {
  part_id: string | null;
  location_id: string | null;
  qty_available: number | string | null;
  qty_on_hand: number | string | null;
  qty_reserved: number | string | null;
};

type PartRow = {
  id: string;
  sku: string | null;
  part_number: string | null;
  name: string | null;
  description: string | null;
  category: string | null;
};

function quantity(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  const access = await requireMobileServiceOperatorApiAccess();
  if (!access.ok) return access.response;

  try {
    const snapshot = await getMobileActiveJobs({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      actorUserId: access.profile.id,
    });
    const visit = snapshot.activeJob ?? snapshot.nextJob;
    const truck = visit?.serviceVehicle ?? null;
    const stockLocationId = truck?.stockLocationId ?? null;

    if (!visit || !truck || !stockLocationId) {
      return NextResponse.json(
        {
          serverNow: snapshot.serverNow,
          visit: visit
            ? {
                id: visit.id,
                workOrderId: visit.workOrderId ?? null,
                workOrderNumber: visit.workOrderNumber ?? null,
                status: visit.status,
                kind: snapshot.activeJob ? "active" : "next",
              }
            : null,
          truck: truck
            ? {
                id: truck.id,
                name: truck.name,
                unitNumber: truck.unitNumber ?? null,
                stockLocationId,
              }
            : null,
          items: [],
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const { data: stockData, error: stockError } = await access.supabase
      .from("v_part_stock")
      .select(
        "part_id,location_id,qty_available,qty_on_hand,qty_reserved",
      )
      .eq("location_id", stockLocationId);
    if (stockError) throw new Error(stockError.message);

    const stockRows = ((stockData ?? []) as StockRow[]).filter(
      (row) =>
        Boolean(row.part_id) &&
        (quantity(row.qty_on_hand) !== 0 || quantity(row.qty_reserved) !== 0),
    );
    const partIds = Array.from(
      new Set(
        stockRows
          .map((row) => row.part_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    let parts: PartRow[] = [];
    if (partIds.length > 0) {
      const { data: partData, error: partError } = await access.supabase
        .from("parts")
        .select("id,sku,part_number,name,description,category")
        .eq("shop_id", access.profile.shop_id)
        .in("id", partIds);
      if (partError) throw new Error(partError.message);
      parts = (partData ?? []) as PartRow[];
    }

    const partsById = new Map(parts.map((part) => [part.id, part]));
    const items = stockRows
      .map((stock) => {
        const partId = stock.part_id as string;
        const part = partsById.get(partId);
        return {
          partId,
          sku: part?.sku ?? null,
          partNumber: part?.part_number ?? null,
          name: part?.name ?? part?.description ?? "Inventory part",
          description: part?.description ?? null,
          category: part?.category ?? null,
          qtyOnHand: quantity(stock.qty_on_hand),
          qtyReserved: quantity(stock.qty_reserved),
          qtyAvailable: quantity(stock.qty_available),
        };
      })
      .sort((a, b) =>
        `${a.name} ${a.sku ?? ""}`.localeCompare(`${b.name} ${b.sku ?? ""}`),
      );

    return NextResponse.json(
      {
        serverNow: snapshot.serverNow,
        visit: {
          id: visit.id,
          workOrderId: visit.workOrderId ?? null,
          workOrderNumber: visit.workOrderNumber ?? null,
          status: visit.status,
          kind: snapshot.activeJob ? "active" : "next",
        },
        truck: {
          id: truck.id,
          name: truck.name,
          unitNumber: truck.unitNumber ?? null,
          stockLocationId,
        },
        items,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load assigned truck inventory." },
      { status: 500 },
    );
  }
}
