import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

import type { Database } from "@shared/types/types/supabase";
import type { ToolContext } from "@/features/agent/lib/toolTypes";
import { runSimplePlan } from "@/features/agent/lib/plannerSimple";
import { runOpenAIPlanner } from "@/features/agent/lib/plannerOpenAI";
import { runFleetPlanner } from "@/features/agent/lib/plannerFleet";
import { runApprovalPlanner } from "@/features/agent/lib/plannerApprovals";

type DB = Database;

type PlannerKind = "simple" | "openai" | "ops" | "fleet" | "approvals";

type PlannerEvent = {
  kind: string;
  [key: string]: unknown;
};

const BodySchema = z.object({
  goal: z.string().min(1, "Goal is required"),
  planner: z
    .enum(["simple", "openai", "ops", "fleet", "approvals"])
    .optional(),
  context: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().optional().nullable(),
});

function toMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function requireUser(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

async function resolveShopId(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) return null;
  return data?.shop_id ?? null;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const user = await requireUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = await resolveShopId(supabase, user.id);
  if (!shopId) {
    return NextResponse.json({ error: "No shop found for user" }, { status: 400 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid request body",
      },
      { status: 400 },
    );
  }

  const { goal, context, idempotencyKey = null } = parsed.data;

  // 🔥 Normalize context so planner always has usable inputs
  const normalizedContext = {
    ...context,
    customerQuery: context.customerQuery ?? context.customer ?? undefined,
    plateOrVin: context.plateOrVin ?? context.vin ?? context.plate ?? undefined,
    workOrderId: context.workOrderId ?? context.id ?? undefined,
    allowCreate:
      context.allowCreate === true ||
      context.allow_create === true,
  };


  const defaultPlanner: PlannerKind =
    process.env.OPENAI_API_KEY ? "ops" : "simple";

  const planner: PlannerKind = parsed.data.planner ?? defaultPlanner;

  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from("planner_runs")
      .select("id")
      .eq("shop_id", shopId)
      .eq("user_id", user.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existing?.id) {
      return NextResponse.json({ runId: existing.id, alreadyExists: true });
    }
  }

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
    return NextResponse.json(
      { error: "Failed to create planner run" },
      { status: 500 },
    );
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
      content: e as Record<string, unknown>,
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[planner/run] event insert error", error);
    }
  };

  try {
    await emit({
      kind: "plan",
      text: `Started ${planner} planner`,
      planner,
      goal,
    });

    if (planner === "simple") {
      await runSimplePlan(goal, normalizedContext, ctx, emit);
    } else if (planner === "fleet") {
      await runFleetPlanner(goal, normalizedContext, ctx, emit);
    } else if (planner === "approvals") {
      await runApprovalPlanner(goal, normalizedContext, ctx, emit);
    } else {
      await runOpenAIPlanner(goal, normalizedContext, ctx, emit);
    }

    await emit({ kind: "final", text: "Planner finished." });

    await supabase
      .from("planner_runs")
      .update({ status: "succeeded" })
      .eq("id", runId);

    return NextResponse.json({
      runId,
      alreadyExists: false,
    });
  } catch (err) {
    await emit({ kind: "final", text: `Planner failed: ${toMsg(err)}` });

    await supabase
      .from("planner_runs")
      .update({ status: "failed" })
      .eq("id", runId);

    return NextResponse.json(
      {
        runId,
        alreadyExists: false,
        error: toMsg(err),
      },
      { status: 200 },
    );
  }
}
