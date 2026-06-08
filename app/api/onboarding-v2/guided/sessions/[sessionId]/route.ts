import type { NextRequest } from "next/server";
import { getGuidedSession, patchGuidedSession } from "@/features/onboarding-v2/guided/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { sessionId: string } }) {
  return getGuidedSession(params.sessionId);
}

export async function PATCH(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return patchGuidedSession(params.sessionId, body);
}
