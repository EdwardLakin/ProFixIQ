import { appendEvent } from "./log";
import { getUserAndShopId } from "./supabase";
import { runSimplePlan } from "../lib/plannerSimple";
import { runOpenAIPlanner } from "../lib/plannerOpenAI";

export type StartAgentOptions = {
  goal: string;
  context: Record<string, unknown>;
  idempotencyKey?: string | null;
  planner?: "simple" | "openai";
};

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function startAgent(opts: StartAgentOptions) {
  const { goal, context, idempotencyKey = null, planner = (process.env.OPENAI_API_KEY ? "openai" : "simple") } = opts;
  const { supabase, user, shopId } = await getUserAndShopId();

  const { data: ok } = await supabase.rpc("agent_can_start");
  if (!ok) throw new Error("Too many requests, try again in a moment.");

  let existing: { id: string } | null = null;
  if (idempotencyKey) {
    const { data } = await supabase
      .from("agent_runs")
      .select("id,status")
      .eq("shop_id", shopId)
      .eq("user_id", user.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (data) existing = { id: data.id };
  }
  if (existing) return { runId: existing.id, alreadyExists: true as const };

  const { data: run, error } = await supabase
    .from("agent_runs")
    .insert({ shop_id: shopId, user_id: user.id, status: "running", goal, idempotency_key: idempotencyKey })
    .select("*")
    .single();
  if (error || !run) throw new Error(error?.message ?? "Failed to create agent run");

  let step = 1;
  const onEvent = async (evt: { kind: string; [k: string]: unknown }) => {
    await appendEvent(run.id, step++, evt.kind, { ...evt, goal });
  };

  try {
    if (planner === "openai" && process.env.OPENAI_API_KEY) {
      await runOpenAIPlanner(goal, context, { shopId, userId: user.id }, onEvent);
    } else {
      await runSimplePlan(goal, context, { shopId, userId: user.id }, onEvent);
    }
    await supabase.from("agent_runs").update({ status: "succeeded", updated_at: new Date().toISOString() }).eq("id", run.id);
    return { runId: run.id, alreadyExists: false as const };
  } catch (e: unknown) {
    await appendEvent(run.id, step++, "error", { message: errMsg(e) });
    await supabase.from("agent_runs").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", run.id);
    throw e;
  }
}