import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { getActiveMenuRepairPricingSnapshot } from "@/features/parts/server/getActiveMenuRepairPricingSnapshot";

type DB = Database;

type Body = {
  workOrderId?: string;
  menuRepairItemId?: string;
  notes?: string | null;
  laborHours?: number | null;
};

type MenuRepairItemLite = Pick<
  DB["public"]["Tables"]["menu_repair_items"]["Row"],
  | "id"
  | "shop_id"
  | "name"
  | "complaint"
  | "cause"
  | "correction"
  | "labor_hours"
  | "price_estimate"
>;

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });
    const body = (await req.json().catch(() => null)) as Body | null;

    const workOrderId = safeTrim(body?.workOrderId);
    const menuRepairItemId = safeTrim(body?.menuRepairItemId);
    const notes = safeTrim(body?.notes) || null;

    if (!workOrderId || !menuRepairItemId) {
      return NextResponse.json(
        { ok: false, error: "Missing workOrderId or menuRepairItemId" },
        { status: 400 },
      );
    }

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: repairItem, error: repairErr } = await supabase
      .from("menu_repair_items")
      .select(
        "id, shop_id, name, complaint, cause, correction, labor_hours, price_estimate",
      )
      .eq("id", menuRepairItemId)
      .maybeSingle<MenuRepairItemLite>();

    if (repairErr) {
      return NextResponse.json({ ok: false, error: repairErr.message }, { status: 500 });
    }

    if (!repairItem?.id) {
      return NextResponse.json({ ok: false, error: "Repair item not found" }, { status: 404 });
    }

    const laborOverride =
      typeof body?.laborHours === "number" && Number.isFinite(body.laborHours)
        ? body.laborHours
        : null;

    const activeSnapshot = await getActiveMenuRepairPricingSnapshot({
      supabase,
      menuRepairItemId: repairItem.id,
    });

    const activePrice =
      activeSnapshot?.pricingStatus !== "expired"
        ? activeSnapshot?.totalSell ?? null
        : null;

    const pricingStatus = activeSnapshot?.pricingStatus ?? "expired";
    const pricingNotes = [
      notes,
      activeSnapshot?.supplierName
        ? `Pricing supplier: ${activeSnapshot.supplierName}`
        : null,
      activeSnapshot?.validUntil
        ? `Pricing valid until: ${activeSnapshot.validUntil}`
        : null,
      `Pricing status: ${pricingStatus}`,
    ]
      .filter(Boolean)
      .join(" • ");

    const insertRow: DB["public"]["Tables"]["work_order_lines"]["Insert"] = {
      work_order_id: workOrderId,
      shop_id: repairItem.shop_id,
      description: repairItem.name,
      complaint: notes || repairItem.complaint || null,
      cause: repairItem.cause || null,
      correction: repairItem.correction || null,
      notes: pricingNotes || null,
      labor_time: laborOverride ?? repairItem.labor_hours ?? null,
      price_estimate: activePrice ?? repairItem.price_estimate ?? null,
      job_type: "repair",
      approval_state: "pending",
      status: "awaiting_approval",
    };

    const { data: created, error: createErr } = await supabase
      .from("work_order_lines")
      .insert(insertRow)
      .select("id")
      .single();

    if (createErr) {
      return NextResponse.json({ ok: false, error: createErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      workOrderLineId: created?.id ?? null,
      pricingStatus,
      activePricingSnapshotId: activeSnapshot?.snapshotId ?? null,
      validUntil: activeSnapshot?.validUntil ?? null,
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
