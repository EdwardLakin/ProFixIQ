import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { listAiRecommendationsForSubject } from "@/features/ai/server";
import { generateShopBoostPostActivationEvidenceAndRecommendations } from "@/features/ai/server/domains/shopBoost";

function isUuid(value: string | null | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor"],
  });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Shop not found" }, { status: 403 });

  const actor = {
    shopId,
    actorId: access.profile.id,
    role: access.profile.role,
    source: "manual" as const,
  };

  const url = new URL(req.url);
  const intakeId = url.searchParams.get("intakeId")?.trim() || null;

  const rows = await listAiRecommendationsForSubject(access.supabase, actor, {
    subjectType: "shop_boost_intake",
    subjectId: intakeId && isUuid(intakeId) ? intakeId : undefined,
    domain: "shop_boost",
    limit: 100,
  });

  const recommendations = rows.filter((row) => row.status === "open" || row.status === "acknowledged");
  return NextResponse.json({ recommendations });
}

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager"],
  });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Shop not found" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { intakeId?: string; sourceRunId?: string };

  const actor = {
    shopId,
    actorId: access.profile.id,
    role: access.profile.role,
    source: "manual" as const,
  };

  const result = await generateShopBoostPostActivationEvidenceAndRecommendations({
    supabase: access.supabase,
    actor,
    intakeId: body.intakeId?.trim() || null,
    sourceRunId: body.sourceRunId?.trim() || null,
  });

  return NextResponse.json(result);
}
