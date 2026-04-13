import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

function clamp(v: number): number {
  if (!Number.isFinite(v)) return 30;
  return Math.max(1, Math.min(90, Math.round(v)));
}

// GET current value
export async function GET() {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageBranding",
    allowRoles: ["owner", "admin"],
  });
  if (!access.ok) return access.response;

  const { data } = await access.supabase
    .from("shops")
    .select("menu_repair_pricing_valid_days")
    .eq("id", access.profile.shop_id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    days: data?.menu_repair_pricing_valid_days ?? 30,
  });
}

// UPDATE value (PIN protected)
export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageBranding",
    allowRoles: ["owner", "admin"],
    requireOwnerPin: true,
    ownerPinRequest: req,
  });
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  const raw = typeof body?.days === "number" ? body.days : 30;
  const days = clamp(raw);

  const { error } = await access.supabase
    .from("shops")
    .update({ menu_repair_pricing_valid_days: days })
    .eq("id", access.profile.shop_id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, days });
}
