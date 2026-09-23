export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { extendDemoProspect } from "@/features/ops/server/demoAccess";

type Body = {
  profileId?: unknown;
  expiresAt?: unknown;
};

export async function POST(request: Request) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const profileId = typeof body.profileId === "string" ? body.profileId : "";
  const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : "";
  if (!profileId) {
    return NextResponse.json({ error: "profileId is required." }, { status: 400 });
  }

  try {
    const result = await extendDemoProspect({ profileId, expiresAt });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to extend demo access.";
    console.error("[ops/demo-access/extend]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
