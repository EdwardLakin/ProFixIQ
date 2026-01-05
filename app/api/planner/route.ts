// app/api/planner/run/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import type { ToolContext } from "@/features/agent/lib/toolTypes";
import type { PlannerEvent } from "@/features/agent/lib/plannerSimple";
import { runSimplePlan } from "@/features/agent/lib/plannerSimple";
import { runOpenAIPlanner } from "@/features/agent/lib/plannerOpenAI";
import { runFleetPlanner } from "@/features/agent/lib/plannerFleet";
import { runApprovalPlanner } from "@/features/agent/lib/plannerApprovals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlannerKind = "simple" | "openai" | "fleet" | "approvals";

type Body = {
  goal?: string;
  planner?: PlannerKind;
  context?: Record<string, unknown>;
  idempotencyKey?: string | null;
};

function toMsg(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

async function getShopId(supabase: ReturnType<typeof createRouteHandlerClient<Database>>, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data?.shop_id) return null;
  return data.shop_id as string;
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  const user = userRes?.user;

  if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  const goal = (body?.goal ?? "").trim();
  if (!goal) return NextResponse.json({ error: "goal required" }, { status: 400 });

  const planner: PlannerKind = (body?.planner ?? "openai") as PlannerKind;
  const context = (body?.context ?? {}) as Record<string, unknown>;
  const idempotencyKey = body?.idempotencyKey ?? null;

  const shopId = await getShopId(supabase, user.id);
  if (!shopId) return NextResponse.json({ error: "Unable to resolve shop for this account." }, { status: 400 });

  // Idempotency: reuse existing run for same user + key
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from("planner_runs")
      .select("id,status")
      .eq("user_id", user.id)
      .eq("idempotency_key", idempotencyKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return NextResponse.json({ runId: existing.id, alreadyExists: true });
    }
  }

  // Create run
  const { data: runRow, error: runErr } = await supabase
    .from("planner_runs")
    .insert({
      shop_id: shopId,
      user_id: user.id,
      status: "running",
      planner_kind: planner,
      goal,
      context,
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();

  if (runErr || !runRow?.id) {
    return NextResponse.json({ error: "Failed to create planner run" }, { status: 500 });
  }

  const runId = runRow.id as string;
  let step = 0;

  const ctx: ToolContext = { shopId, userId: user.id };

  const emit = async (e: PlannerEvent) => {
    step += 1;
    const { error } = await supabase.from("planner_events").insert({
      run_id: runId,
      step,
      kind: e.kind,
      content: e as unknown as Record<string, unknown>,
    });
    if (error) {
      // Don’t throw (we don’t want event logging failure to kill the plan)
      // eslint-disable-next-line no-console
      console.error("[planner/run] event insert error", error);
    }
  };

  // Run the planner (synchronously)
  try {
    await emit({ kind: "plan", text: `Started ${planner} planner` });

    if (planner === "simple") await runSimplePlan(goal, context, ctx, emit);
    else if (planner === "fleet") await runFleetPlanner(goal, context, ctx, emit);
    else if (planner === "approvals") await runApprovalPlanner(goal, context, ctx, emit);
    else await runOpenAIPlanner(goal, context, ctx, emit);

    await emit({ kind: "final", text: "Planner finished." });

    await supabase
      .from("planner_runs")
      .update({ status: "succeeded" })
      .eq("id", runId);

    return NextResponse.json({ runId, alreadyExists: false });
  } catch (err) {
    await emit({ kind: "final", text: `Planner failed: ${toMsg(err)}` });

    await supabase
      .from("planner_runs")
      .update({ status: "failed" })
      .eq("id", runId);

    return NextResponse.json({ runId, alreadyExists: false, error: toMsg(err) }, { status: 200 });
  }
}