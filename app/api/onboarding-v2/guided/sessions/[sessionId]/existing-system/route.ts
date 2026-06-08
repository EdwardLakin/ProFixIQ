import type { NextRequest } from "next/server";
import { setExistingSystem } from "@/features/onboarding-v2/guided/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return setExistingSystem(params.sessionId, body);
}
