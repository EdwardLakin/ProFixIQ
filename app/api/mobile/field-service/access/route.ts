import { NextResponse } from "next/server";

import {
  getMobileFieldServiceAccess,
} from "@/features/mobile/service/server/access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function GET() {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  try {
    return NextResponse.json(await getMobileFieldServiceAccess(access), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to verify Field Service access." },
      { status: 500 },
    );
  }
}
