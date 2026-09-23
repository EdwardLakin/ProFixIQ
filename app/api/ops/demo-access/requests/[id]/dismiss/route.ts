export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { dismissDemoAccessRequest } from "@/features/ops/server/demoAccessRequests";

type RouteContext = { params: { id: string } };

export async function POST(_request: Request, context: unknown) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const { params } = context as RouteContext;
  const requestId = params?.id ?? "";
  if (!requestId) {
    return NextResponse.json({ error: "requestId is required." }, { status: 400 });
  }

  try {
    await dismissDemoAccessRequest({ requestId }, access.profile?.id ?? null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to dismiss demo access request.";
    console.error("[ops/demo-access/requests/dismiss]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
