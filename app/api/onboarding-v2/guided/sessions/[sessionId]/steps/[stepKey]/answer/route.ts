import type { NextRequest } from "next/server";
import { answerGuidedStep } from "@/features/onboarding-v2/guided/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string; stepKey: string }> }
) {
  const { sessionId, stepKey } = await context.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return answerGuidedStep(sessionId, stepKey, body);
}
