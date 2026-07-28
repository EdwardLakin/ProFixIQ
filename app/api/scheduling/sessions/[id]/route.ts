import { NextResponse, type NextRequest } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(_req: NextRequest, _context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;

  return NextResponse.json(
    {
      error:
        "Legacy job sessions are read-only. Correct canonical labor segments from Workforce time review.",
    },
    { status: 410 },
  );
}

export async function DELETE(_req: NextRequest, _context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;

  return NextResponse.json(
    {
      error:
        "Legacy job sessions are read-only. Correct canonical labor segments from Workforce time review.",
    },
    { status: 410 },
  );
}
