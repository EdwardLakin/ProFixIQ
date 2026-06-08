import type { NextRequest } from "next/server";
import { setGuidedStepStatus } from "@/features/onboarding-v2/guided/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { sessionId: string; stepKey: string } }) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return setGuidedStepStatus(params.sessionId, params.stepKey, body);
}
