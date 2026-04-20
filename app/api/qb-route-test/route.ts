export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { requireNonProductionRoute } from "@/features/shared/lib/server/api-route-guard";

export async function GET() {
  const envGate = requireNonProductionRoute("qb-route-test");
  if (!envGate.ok) {
    return envGate.response;
  }

  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) {
    return access.response;
  }

  return NextResponse.json({
    ok: true,
    route: "qb-route-test",
  });
}
