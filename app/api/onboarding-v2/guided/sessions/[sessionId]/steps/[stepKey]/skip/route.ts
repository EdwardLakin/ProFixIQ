import type { NextRequest } from "next/server";
import { skipGuidedStep } from "@/features/onboarding-v2/guided/server";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { sessionId: string; stepKey: string } }) {
  return skipGuidedStep(params.sessionId, params.stepKey);
}
