import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { sessionId } = await context.params;

  return NextResponse.json(
    {
      ok: false,
      error: "Legacy onboarding agent analysis endpoint has been retired. Use /api/onboarding-agent/sessions/[sessionId]/analyze.",
      sessionId,
    },
    { status: 410 },
  );
}
