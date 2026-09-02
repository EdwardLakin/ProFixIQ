import { NextResponse } from "next/server";
import {
  requireCanonicalShopOrFieldApiAccess,
  resolveWorkOrderProductAuthority,
} from "@/features/mobile/service/server/access";

type Body = {
  workOrderId?: string | null;
  itemLabel?: string | null;
  note?: string | null;
  suggestedMatchId?: string | null;
  suggestedLabel?: string | null;
  menuRepairItemId?: string | null;
  action?: "accepted" | "dismissed" | null;
  vehicle?: {
    year?: string | number | null;
    make?: string | null;
    model?: string | null;
    engine?: string | null;
    drivetrain?: string | null;
    transmission?: string | null;
  } | null;
};

function safeTrim(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const workOrderId = safeTrim(body?.workOrderId);
  if (!workOrderId) {
    return NextResponse.json(
      { ok: false, error: "Missing work order" },
      { status: 400 },
    );
  }

  const access = await requireCanonicalShopOrFieldApiAccess({
    requiredCapability: "canRunInspections",
  });
  if (!access.ok) return access.response;
  if (
    !(await resolveWorkOrderProductAuthority(access, workOrderId)).authorized
  ) {
    return NextResponse.json(
      { ok: false, error: "Work order not found" },
      { status: 404 },
    );
  }
  const supabase = access.supabase;

  const year =
    typeof body?.vehicle?.year === "number"
      ? body.vehicle.year
      : Number(body?.vehicle?.year ?? 0) || null;

  const { error } = await supabase
    .from("inspection_smart_match_feedback")
    .insert({
      shop_id: access.profile.shop_id,
      user_id: access.authUserId,
      item_label: safeTrim(body?.itemLabel),
      note: safeTrim(body?.note),
      suggested_match_id: safeTrim(body?.suggestedMatchId),
      suggested_label: safeTrim(body?.suggestedLabel),
      menu_repair_item_id: safeTrim(body?.menuRepairItemId),
      action: body?.action === "accepted" ? "accepted" : "dismissed",
      vehicle_year: year,
      vehicle_make: safeTrim(body?.vehicle?.make),
      vehicle_model: safeTrim(body?.vehicle?.model),
      engine: safeTrim(body?.vehicle?.engine),
      drivetrain: safeTrim(body?.vehicle?.drivetrain),
      transmission: safeTrim(body?.vehicle?.transmission),
    });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
