import { createOrResumeGuidedSession, listGuidedSessions } from "@/features/onboarding-v2/guided/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return listGuidedSessions();
}

export async function POST() {
  return createOrResumeGuidedSession();
}
