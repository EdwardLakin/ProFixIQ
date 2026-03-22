import { appendEvent } from "./log";
import { getUserAndShopId } from "./supabase";
import { runSimplePlan } from "../lib/plannerSimple";
import { runOpenAIPlanner } from "../lib/plannerOpenAI";
import { runFleetPlanner } from "../lib/plannerFleet";
import { runApprovalPlanner } from "../lib/plannerApprovals";

export type PlannerName =
  | "simple"
  | "openai"
  | "ops"
  | "fleet"
  | "approvals";

export type StartAgentOptions = {
  goal: string;
  context: Record<string, unknown>;
  idempotencyKey?: string | null;
  planner?: PlannerName;
};

type PlannerRuntimeContext = {
  shopId: string;
  userId: string;
};

type AgentEvent = {
  kind: string;
  [key: string]: unknown;
};

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeContext(
  goal: string,
  rawContext: Record<string, unknown>,
): Record<string, unknown> {
  return {
    source: "ops-assistant",
    requestedAt: new Date().toISOString(),
    goal,
    ...rawContext,
  };
}

export async function startAgent(opts: StartAgentOptions) {
  const { goal, context, idempotencyKey = null, planner } = opts;

  const defaultPlanner: PlannerName =
    process.env.OPENAI_API_KEY ? "ops" : "simple";

  const effectivePlanner: PlannerName = planner ?? defaultPlanner;

  const { supabase, user, shopId } = await getUserAndShopId();

  const { data: ok, error: canStartError } = await supabase.rpc("agent_can_start");
  if (canStartError) {
    throw new Error(canStartError.message);
  }
  if (!ok) {
    throw new Error("Too many requests, try again in a moment.");
  }

  let existing: { id: string } | null = null;

  if (idempotencyKey) {
    const { data, error } = await supabase
      .from("agent_runs")
      .select("id,status")
      .eq("shop_id", shopId)
      .eq("user_id", user.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      existing = { id: data.id };
    }
  }

  if (existing) {
    return { runId: existing.id, alreadyExists: true as const };
  }

  const normalizedContext = normalizeContext(goal, context);

  const { data: run, error } = await supabase
    .from("agent_runs")
    .insert({
      shop_id: shopId,
      user_id: user.id,
      status: "running",
      goal,
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .single();

  if (error || !run) {
    throw new Error(error?.message ?? "Failed to create agent run");
  }

  let step = 1;

  const runtimeContext: PlannerRuntimeContext = {
    shopId,
    userId: user.id,
  };

  const onEvent = async (event: AgentEvent) => {
    await appendEvent(run.id, step++, event.kind, {
      ...event,
      goal,
      planner: effectivePlanner,
    });
  };

  try {
    await onEvent({
      kind: "planner_selected",
      planner: effectivePlanner,
    });

    if (effectivePlanner === "simple") {
      await runSimplePlan(goal, normalizedContext, runtimeContext, onEvent);
    } else if (effectivePlanner === "fleet") {
      await runFleetPlanner(goal, normalizedContext, runtimeContext, onEvent);
    } else if (effectivePlanner === "approvals") {
      await runApprovalPlanner(goal, normalizedContext, runtimeContext, onEvent);
    } else {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is required for ops/openai planner");
      }

      await runOpenAIPlanner(goal, normalizedContext, runtimeContext, onEvent);
    }

    const { error: doneError } = await supabase
      .from("agent_runs")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    if (doneError) {
      throw new Error(doneError.message);
    }

    await onEvent({
      kind: "planner_completed",
      planner: effectivePlanner,
    });

    return {
      runId: run.id,
      alreadyExists: false as const,
    };
  } catch (error) {
    const message = errMsg(error);

    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    await onEvent({
      kind: "planner_failed",
      planner: effectivePlanner,
      error: message,
    });

    throw new Error(message);
  }
}
