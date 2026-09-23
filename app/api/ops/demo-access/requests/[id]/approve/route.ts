export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { approveDemoAccessRequest } from "@/features/ops/server/demoAccessRequests";

type RouteContext = { params: { id: string } };

type Body = {
  expiresAt?: unknown;
};

export async function POST(request: NextRequest, context: unknown) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const { params } = context as RouteContext;
  const requestId = params?.id ?? "";
  if (!requestId) {
    return NextResponse.json({ error: "requestId is required." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const expiresAt = typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : undefined;

  try {
    const result = await approveDemoAccessRequest({ requestId, expiresAt }, access.profile?.id ?? null);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to approve demo access request.";
    console.error("[ops/demo-access/requests/approve]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
