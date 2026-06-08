import type { NextRequest } from "next/server";
import { completeGuidedStep } from "@/features/onboarding-v2/guided/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ sessionId: string; stepKey: string }> }
) {
  const { sessionId, stepKey } = await context.params;
  return completeGuidedStep(sessionId, stepKey);
}
