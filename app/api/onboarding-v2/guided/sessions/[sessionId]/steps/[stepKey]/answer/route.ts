import type { NextRequest } from "next/server";
import { answerGuidedStep } from "@/features/onboarding-v2/guided/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { sessionId: string; stepKey: string } }) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return answerGuidedStep(params.sessionId, params.stepKey, body);
}
