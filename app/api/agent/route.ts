import { NextResponse } from "next/server";
import { startAgent } from "@/features/agent/server/runAgent";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const goal: string = body.goal ?? "";
  const context: Record<string, unknown> = body.context ?? {};
  const idempotencyKey: string | null = body.idempotencyKey ?? null;
  const planner: "simple" | "openai" | undefined = body.planner;

  if (!goal) return NextResponse.json({ error: "goal required" }, { status: 400 });

  try {
    const out = await startAgent({ goal, context, idempotencyKey, planner });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Agent failed" }, { status: 500 });
  }
}
