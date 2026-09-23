export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { revokeDemoProspect } from "@/features/ops/server/demoAccess";

type Body = {
  profileId?: unknown;
};

export async function POST(request: Request) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const profileId = typeof body.profileId === "string" ? body.profileId : "";
  if (!profileId) {
    return NextResponse.json({ error: "profileId is required." }, { status: 400 });
  }

  try {
    const result = await revokeDemoProspect({ profileId });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to revoke demo access.";
    console.error("[ops/demo-access/revoke]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
