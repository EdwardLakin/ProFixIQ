export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { createDemoProspect } from "@/features/ops/server/demoAccess";

type Body = {
  fullName?: unknown;
  email?: unknown;
  expiresAt?: unknown;
};

export async function POST(request: Request) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fullName = typeof body.fullName === "string" ? body.fullName : "";
  const email = typeof body.email === "string" ? body.email : "";
  const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : "";

  try {
    const result = await createDemoProspect(
      { fullName, email, expiresAt },
      access.profile?.id ?? null,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create demo access.";
    console.error("[ops/demo-access/create]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
