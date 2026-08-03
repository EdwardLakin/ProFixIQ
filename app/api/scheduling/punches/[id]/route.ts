import { NextResponse, type NextRequest } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RouteContext = { params: Promise<{ id: string }> };

function retiredResponse() {
  return NextResponse.json(
    {
      error:
        "Direct punch edits are retired. Use Workforce Attendance so every correction is payroll-safe and audited.",
    },
    { status: 410 },
  );
}

export async function PATCH(_req: NextRequest, _context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;
  return retiredResponse();
}

export async function DELETE(_req: NextRequest, _context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;
  return retiredResponse();
}
