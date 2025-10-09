import { NextResponse } from "next/server";
import { startAgent } from "@/features/agent/server/runAgent";

export const runtime = "nodejs";

function toMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as Error).message;
  }
  try { return String(e); } catch { return "Unknown error"; }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const goal = (body.goal as string | undefined) ?? "";
  const context = (body.context as Record<string, unknown> | undefined) ?? {};
  const idempotencyKey = (body.idempotencyKey as string | null | undefined) ?? null;
  const planner = body.planner as ("simple" | "openai" | undefined);

  if (!goal) return NextResponse.json({ error: "goal required" }, { status: 400 });

  try {
    const out = await startAgent({ goal, context, idempotencyKey, planner });
    return NextResponse.json(out);
  } catch (e: unknown) {
    return NextResponse.json({ error: toMessage(e) }, { status: 500 });
  }
}
