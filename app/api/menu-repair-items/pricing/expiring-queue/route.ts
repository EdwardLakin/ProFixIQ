import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

type PricingStatus = "fresh" | "stale" | "expired";

function computePricingStatus(validUntil: string | null): PricingStatus {
  if (!validUntil) return "expired";

  const now = Date.now();
  const ts = new Date(validUntil).getTime();
  if (!Number.isFinite(ts)) return "expired";

  if (ts < now) return "expired";
  if (ts < now + 3 * 24 * 60 * 60 * 1000) return "stale";
  return "fresh";
}

function daysUntil(validUntil: string | null): number | null {
  if (!validUntil) return null;
  const ts = new Date(validUntil).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.floor((ts - Date.now()) / (24 * 60 * 60 * 1000));
}

export async function GET() {
  try {
    const supabase = createServerSupabaseRoute();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 });
    }

    const shopId = profile?.shop_id ?? null;
    if (!shopId) {
      return NextResponse.json({ ok: false, error: "Missing shop context" }, { status: 400 });
    }

    const { data: repairItems, error: repairErr } = await supabase
      .from("menu_repair_items")
      .select(
        "id, shop_id, name, complaint, vehicle_year, vehicle_make, vehicle_model, engine, drivetrain, transmission, active_pricing_snapshot_id",
      )
      .eq("shop_id", shopId)
      .order("updated_at", { ascending: false })
      .limit(500);

    if (repairErr) {
      return NextResponse.json({ ok: false, error: repairErr.message }, { status: 500 });
    }

    const items = repairItems ?? [];
    const snapshotIds = items
      .map((item) => item.active_pricing_snapshot_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    const snapshotById = new Map<
      string,
      {
        id: string;
        supplier_name: string | null;
        quoted_at: string | null;
        valid_until: string | null;
        pricing_valid_days: number | null;
        total_cost: number | null;
        total_sell: number | null;
        currency: string | null;
      }
    >();

    if (snapshotIds.length > 0) {
      const { data: snapshots, error: snapErr } = await supabase
        .from("menu_repair_item_pricing_snapshots")
        .select(
          "id, supplier_name, quoted_at, valid_until, pricing_valid_days, total_cost, total_sell, currency",
        )
        .in("id", snapshotIds);

      if (snapErr) {
        return NextResponse.json({ ok: false, error: snapErr.message }, { status: 500 });
      }

      for (const snapshot of snapshots ?? []) {
        snapshotById.set(snapshot.id, snapshot);
      }
    }

    const rows = items
      .map((item) => {
        const snapshotId = item.active_pricing_snapshot_id ?? null;
        const snapshot = snapshotId ? snapshotById.get(snapshotId) ?? null : null;
        const pricingStatus = computePricingStatus(snapshot?.valid_until ?? null);

        return {
          menuRepairItemId: item.id,
          name: item.name ?? item.complaint ?? "Repair item",
          complaint: item.complaint ?? null,
          vehicleYear: item.vehicle_year ?? null,
          vehicleMake: item.vehicle_make ?? null,
          vehicleModel: item.vehicle_model ?? null,
          engine: item.engine ?? null,
          drivetrain: item.drivetrain ?? null,
          transmission: item.transmission ?? null,
          activePricingSnapshotId: snapshotId,
          pricingStatus,
          daysUntilExpiry: daysUntil(snapshot?.valid_until ?? null),
          supplierName: snapshot?.supplier_name ?? null,
          quotedAt: snapshot?.quoted_at ?? null,
          validUntil: snapshot?.valid_until ?? null,
          pricingValidDays: snapshot?.pricing_valid_days ?? 30,
          totalCost: snapshot?.total_cost ?? null,
          totalSell: snapshot?.total_sell ?? null,
          currency: snapshot?.currency ?? "CAD",
        };
      })
      .filter((row) => row.pricingStatus !== "fresh");

    return NextResponse.json({
      ok: true,
      count: rows.length,
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
  }
}
