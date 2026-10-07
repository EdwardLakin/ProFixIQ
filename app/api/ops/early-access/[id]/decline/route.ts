export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { reviewEarlyAccessApplication } from "@/features/ops/server/earlyAccessApplications";

type RouteContext = { params: { id: string } };

export async function POST(_request: Request, context: unknown) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const { params } = context as RouteContext;
  const applicationId = params?.id ?? "";
  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required." }, { status: 400 });
  }

  try {
    await reviewEarlyAccessApplication(applicationId, "declined", access.profile?.id ?? null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to decline Early Access application.";
    console.error("[ops/early-access/decline]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
