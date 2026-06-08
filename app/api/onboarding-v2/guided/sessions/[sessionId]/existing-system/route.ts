import type { NextRequest } from "next/server";
import { setExistingSystem } from "@/features/onboarding-v2/guided/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return setExistingSystem(sessionId, body);
}
