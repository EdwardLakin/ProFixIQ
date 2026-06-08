import type { NextRequest } from "next/server";
import { getGuidedSession, patchGuidedSession } from "@/features/onboarding-v2/guided/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;
  return getGuidedSession(sessionId);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return patchGuidedSession(sessionId, body);
}
